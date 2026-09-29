import "server-only";
import { createHash } from "node:crypto";
import { parseMarketingReceipt, UUID, type MarketingPurpose } from "@/lib/marketing/contract";
import { MarketingProviderError, readNativeMarketingTemplate } from "@/lib/marketing/provider";

type NativeTemplate = { id: string; current_version_id: string; subject: string; html: string; text: string; from: string | null; reply_to: string[] | null };
export function marketingTemplateFingerprint(value: unknown): string {
  const template = validateTemplate(value);
  return createHash("sha256").update(JSON.stringify({ id: template.id, version: template.current_version_id,
    subject: template.subject, html: template.html, text: template.text, from: template.from, replyTo: template.reply_to })).digest("hex");
}
function validateTemplate(value: unknown): NativeTemplate {
  if (!value || typeof value !== "object") throw new MarketingProviderError("provider_contract_invalid");
  const v = value as Record<string, unknown>;
  if (v.status !== "published" || v.has_unpublished_versions !== false || typeof v.id !== "string" || !UUID.test(v.id)
    || typeof v.current_version_id !== "string" || !UUID.test(v.current_version_id)
    || typeof v.subject !== "string" || !v.subject || v.subject.length > 300 || /[\r\n]/.test(v.subject)
    || typeof v.html !== "string" || v.html.length < 1 || v.html.length > 100_000
    || typeof v.text !== "string" || v.text.length < 1 || v.text.length > 100_000
    || (v.from !== null && typeof v.from !== "string")
    || (v.reply_to !== null && (!Array.isArray(v.reply_to) || v.reply_to.some((entry) => typeof entry !== "string")))
    || /<(script|iframe|object|embed|form)\b/i.test(v.html)) throw new MarketingProviderError("provider_contract_invalid");
  return v as NativeTemplate;
}
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
function substitute(template: string, values: Record<string, string>, html: boolean) {
  const result = template.replace(/\{\{\{?([A-Z_]+)\}\}\}?/g, (_match, key: string) => {
    if (!(key in values)) throw new MarketingProviderError("provider_contract_invalid");
    return html ? escapeHtml(values[key]) : values[key];
  });
  if (result.includes("{{") || result.includes("}}")) throw new MarketingProviderError("provider_contract_invalid");
  return result;
}
type MarketingMessage = { from: string; reply_to: string; subject: string; html: string; text: string; topic_id?: string; headers?: Record<string, string> };
export async function renderMarketingMessage(purpose: MarketingPurpose, rawReceipt: unknown, apiKey: string,
  readTemplate: (id: string, apiKey: string) => Promise<unknown> = readNativeMarketingTemplate): Promise<MarketingMessage> {
  const receipt = parseMarketingReceipt(rawReceipt), contract = receipt.templateContract, approved = contract.templates[purpose];
  const native = validateTemplate(await readTemplate(approved.id, apiKey));
  if (native.id !== approved.id || marketingTemplateFingerprint({ ...native, status: "published", has_unpublished_versions: false }) !== approved.sha256
    || (native.from !== null && native.from !== contract.from)
    || (native.reply_to !== null && (native.reply_to.length !== 1 || native.reply_to[0] !== contract.replyTo))) {
    throw new MarketingProviderError("provider_contract_invalid");
  }
  const confirmation = purpose === "marketing_confirmation";
  const token = confirmation ? receipt.confirmationToken : receipt.preferenceToken;
  if (!token) throw new MarketingProviderError("provider_contract_invalid");
  const url = `${contract.siteOrigin}/email-preferences?${confirmation ? "confirm" : "unsubscribe"}=${token}`;
  const required = confirmation ? "HELIX_CONFIRM_URL" : "HELIX_PREFERENCES_URL";
  const hasVariable = (body: string, name: string) => body.includes(`{{${name}}}`) || body.includes(`{{{${name}}}}`);
  if (![native.html, native.text].every((body) => hasVariable(body, required))
    || (!confirmation && ![native.html, native.text].every((body) => hasVariable(body, "HELIX_POSTAL_ADDRESS")))) {
    throw new MarketingProviderError("provider_contract_invalid");
  }
  const values = { HELIX_SITE_ORIGIN: contract.siteOrigin, HELIX_POSTAL_ADDRESS: contract.postalAddress, [required]: url };
  const message = { from: contract.from, reply_to: contract.replyTo, subject: substitute(native.subject, values, false),
    html: substitute(native.html, values, true), text: substitute(native.text, values, false) };
  if (confirmation) return message;
  return { ...message, topic_id: contract.topicId, headers: {
    "List-Unsubscribe": `<${contract.siteOrigin}/api/marketing/unsubscribe?token=${token}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  } };
}
