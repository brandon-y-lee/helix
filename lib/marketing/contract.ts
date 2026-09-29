import { isEmailAddress, type EmailEnvironment } from "@/lib/email/config";

export const MARKETING_PURPOSES = ["marketing_confirmation", "welcome_initial", "welcome_education"] as const;
export type MarketingPurpose = typeof MARKETING_PURPOSES[number];
export type MarketingTemplateContract = {
  version: "welcome_v1";
  siteOrigin: string;
  from: string;
  replyTo: string;
  postalAddress: string;
  topicId: string;
  templates: Record<MarketingPurpose, { id: string; sha256: string }>;
};
export type MarketingReceipt = {
  schemaVersion: 1;
  subscriberId: string;
  generation: number;
  revision: number;
  confirmationToken?: string;
  preferenceToken?: string;
  templateContract: MarketingTemplateContract;
};
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const CAPABILITY = /^[A-Za-z0-9_-]{43}$/;
export const isMarketingPurpose = (value: string): value is MarketingPurpose => MARKETING_PURPOSES.some((purpose) => purpose === value);
function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
function only(value: Record<string, unknown>, keys: string[]) { return Object.keys(value).every((key) => keys.includes(key)); }

export function parseMarketingTemplateContract(value: unknown): MarketingTemplateContract {
  if (!object(value) || !only(value, ["version", "siteOrigin", "from", "replyTo", "postalAddress", "topicId", "templates"])
    || value.version !== "welcome_v1" || typeof value.siteOrigin !== "string" || typeof value.from !== "string"
    || typeof value.replyTo !== "string" || !isEmailAddress(value.replyTo) || typeof value.postalAddress !== "string"
    || value.postalAddress.trim().length < 5 || value.postalAddress.length > 500 || /[\r\n<>]/.test(value.postalAddress)
    || typeof value.topicId !== "string" || !UUID.test(value.topicId) || !object(value.templates)
    || !only(value.templates, [...MARKETING_PURPOSES])) throw new Error("Marketing template approval is incomplete.");
  const origin = new URL(value.siteOrigin);
  const sender = isEmailAddress(value.from) ? value.from : value.from.match(/^[^<>\r\n]{1,100} <([^<>\s]+)>$/)?.[1];
  if (origin.origin !== value.siteOrigin || origin.protocol !== "https:" || origin.username || origin.password
    || !sender || !isEmailAddress(sender)) throw new Error("Marketing identity is invalid.");
  for (const purpose of MARKETING_PURPOSES) {
    const entry = value.templates[purpose];
    if (!object(entry) || !only(entry, ["id", "sha256"]) || typeof entry.id !== "string" || !UUID.test(entry.id)
      || typeof entry.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw new Error("Marketing template approval is incomplete.");
  }
  return value as MarketingTemplateContract;
}
export function readMarketingTemplateContract(env: EmailEnvironment) {
  const raw = env.HELIX_EMAIL_MARKETING_CONTRACT ?? "";
  if (raw.length > 16_384) throw new Error("Marketing template approval is invalid.");
  return parseMarketingTemplateContract(JSON.parse(raw));
}
export function parseMarketingReceipt(value: unknown): MarketingReceipt {
  if (!object(value) || value.schemaVersion !== 1 || typeof value.subscriberId !== "string" || !UUID.test(value.subscriberId)
    || !Number.isSafeInteger(value.generation) || Number(value.generation) < 1 || !Number.isSafeInteger(value.revision)
    || Number(value.revision) < 1 || (value.confirmationToken !== undefined && (typeof value.confirmationToken !== "string" || !CAPABILITY.test(value.confirmationToken)))
    || (value.preferenceToken !== undefined && (typeof value.preferenceToken !== "string" || !CAPABILITY.test(value.preferenceToken)))) {
    throw new Error("Marketing message context is invalid.");
  }
  return { ...value, templateContract: parseMarketingTemplateContract(value.templateContract) } as MarketingReceipt;
}
