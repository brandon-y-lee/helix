import "server-only";
import { isEmailAddress } from "@/lib/email/config";
import { readBoundedBody } from "@/lib/email/provider";
import { UUID } from "@/lib/marketing/contract";
import type { MarketingContactProvider } from "@/lib/marketing/service";

export class MarketingProviderError extends Error {
  constructor(readonly code: "provider_unavailable" | "provider_contract_invalid") { super("Marketing provider needs operator attention."); }
}
export async function marketingProviderRequest(path: string, apiKey: string, method = "GET", body?: unknown, maxBytes = 600_000): Promise<unknown> {
  try {
    const multipart = body instanceof FormData;
    const response = await fetch(`https://api.resend.com${path}`, { method, cache: "no-store", redirect: "error",
      signal: AbortSignal.timeout(3_000), headers: { Authorization: `Bearer ${apiKey}`, ...(!multipart ? { "Content-Type": "application/json" } : {}) },
      ...(body === undefined ? {} : { body: multipart ? body : JSON.stringify(body) }) });
    if (!response.ok) { await response.body?.cancel(); throw new MarketingProviderError("provider_unavailable"); }
    return JSON.parse(await readBoundedBody(response, maxBytes));
  } catch { throw new MarketingProviderError("provider_unavailable"); }
}
export const readNativeMarketingTemplate = (id: string, apiKey: string) => marketingProviderRequest(`/templates/${encodeURIComponent(id)}`, apiKey);

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
function identifier(value: unknown): string {
  if (typeof value !== "string" || !UUID.test(value)) throw new MarketingProviderError("provider_contract_invalid");
  return value;
}
function importCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 1) throw new MarketingProviderError("provider_contract_invalid");
  return value;
}
export const resendMarketingContacts: MarketingContactProvider = {
  async getContact(idOrEmail, apiKey) {
    // A missing Contact is distinct from an outage; do not create on an arbitrary failed read.
    const response = await fetch(`https://api.resend.com/contacts/${encodeURIComponent(idOrEmail)}`, {
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(3_000), headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (response.status === 404) { await response.body?.cancel(); return null; }
    if (!response.ok) { await response.body?.cancel(); throw new MarketingProviderError("provider_unavailable"); }
    const value: unknown = JSON.parse(await readBoundedBody(response, 16_384));
    if (!record(value) || typeof value.email !== "string" || typeof value.unsubscribed !== "boolean") throw new MarketingProviderError("provider_contract_invalid");
    return { id: identifier(value.id), email: value.email, unsubscribed: value.unsubscribed };
  },
  async createImport(email, apiKey) {
    if (!isEmailAddress(email) || email.split("@")[0].length > 64) throw new MarketingProviderError("provider_contract_invalid");
    // Never upsert: a competing import or a native withdrawal must remain untouched.
    // Deliberately omit Topic/Segment assignments; skip semantics for those are not qualified.
    const body = new FormData();
    body.append("file", new Blob([`Email,Unsubscribed\r\n"${email}",false\r\n`], { type: "text/csv" }), "contact.csv");
    body.append("column_map", JSON.stringify({ email: "Email", unsubscribed: "Unsubscribed" }));
    body.append("on_conflict", "skip");
    const value = await marketingProviderRequest("/contacts/imports", apiKey, "POST", body, 16_384);
    if (!record(value) || value.object !== "contact_import") throw new MarketingProviderError("provider_contract_invalid");
    return identifier(value.id);
  },
  async readImport(importId, apiKey) {
    const value = await marketingProviderRequest(`/contacts/imports/${identifier(importId)}`, apiKey, "GET", undefined, 16_384);
    if (!record(value) || value.object !== "contact_import" || value.id !== importId || !record(value.counts)
      || (value.status !== "queued" && value.status !== "in_progress" && value.status !== "completed" && value.status !== "failed")) {
      throw new MarketingProviderError("provider_contract_invalid");
    }
    const counts = { total: importCount(value.counts.total), created: importCount(value.counts.created), updated: importCount(value.counts.updated),
      skipped: importCount(value.counts.skipped), failed: importCount(value.counts.failed) };
    const processed = counts.created + counts.updated + counts.skipped + counts.failed;
    if (counts.updated !== 0 || processed > counts.total
      || (value.status === "completed" && (counts.total !== 1 || counts.failed !== 0 || counts.created + counts.skipped !== 1))) {
      throw new MarketingProviderError("provider_contract_invalid");
    }
    return { id: importId, status: value.status, counts };
  },
  async updateContact(id, unsubscribed, apiKey) {
    if (unsubscribed !== true) throw new MarketingProviderError("provider_contract_invalid");
    await marketingProviderRequest(`/contacts/${identifier(id)}`, apiKey, "PATCH", { unsubscribed: true });
  },
  async updateTopic(id, topicId, subscribed, apiKey) {
    if (subscribed !== false) throw new MarketingProviderError("provider_contract_invalid");
    await marketingProviderRequest(`/contacts/${identifier(id)}/topics`, apiKey, "PATCH", [
      { id: identifier(topicId), subscription: "opt_out" },
    ]);
  },
  async getTopicDefault(topicId, apiKey) {
    const value = await marketingProviderRequest(`/topics/${identifier(topicId)}`, apiKey, "GET", undefined, 16_384);
    if (!record(value) || value.id !== topicId || (value.default_subscription !== "opt_in" && value.default_subscription !== "opt_out")) {
      throw new MarketingProviderError("provider_contract_invalid");
    }
    return value.default_subscription;
  },
  async getTopic(id, topicId, apiKey) {
    let after: string | null = null;
    for (let page = 0; page < 5; page++) {
      const value = await marketingProviderRequest(`/contacts/${identifier(id)}/topics?limit=100${after ? `&after=${after}` : ""}`, apiKey);
      if (!record(value) || !Array.isArray(value.data) || typeof value.has_more !== "boolean") throw new MarketingProviderError("provider_contract_invalid");
      const topic = value.data.find((entry: unknown) => record(entry) && entry.id === topicId);
      if (record(topic) && (topic.subscription === "opt_in" || topic.subscription === "opt_out")) return topic.subscription;
      if (!value.has_more || value.data.length === 0) break;
      const last = value.data.at(-1);
      if (!record(last)) break;
      after = identifier(last.id);
    }
    throw new MarketingProviderError("provider_contract_invalid");
  },
};
