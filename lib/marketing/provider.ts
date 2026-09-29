import "server-only";
import { isEmailAddress } from "@/lib/email/config";
import { readBoundedBody } from "@/lib/email/provider";
import { UUID } from "@/lib/marketing/contract";
import type { MarketingContactProvider } from "@/lib/marketing/service";

const PROVIDER_ERROR_STATUSES = {
  invalid_idempotency_key: [400], validation_error: [400, 403, 422], missing_api_key: [401], invalid_api_key: [401, 403],
  restricted_api_key: [401, 403], suspended_api_key: [403], invalid_permission: [403], not_found: [404], method_not_allowed: [405],
  concurrent_idempotent_requests: [409], invalid_idempotent_request: [409], resource_locked: [409], invalid_attachment: [422],
  invalid_parameter: [422], missing_required_field: [422], missing_required_parameter: [422], daily_quota_exceeded: [429],
  monthly_quota_exceeded: [429], rate_limit_exceeded: [429], application_error: [500], internal_server_error: [500], service_unavailable: [503],
} as const;
const HTTP_STATUSES = new Set([400, 401, 403, 404, 405, 408, 409, 413, 422, 429, 500, 502, 503, 504]);
export type MarketingProviderEvidence = {
  category: "rate_limited" | "quota_exceeded" | "configuration_rejected" | "provider_unavailable" | "provider_contract_invalid";
  httpStatus: number | null;
  providerName: keyof typeof PROVIDER_ERROR_STATUSES | null;
  retryAfterSeconds: number | null;
};
export class MarketingProviderError extends Error implements MarketingProviderEvidence {
  readonly category: MarketingProviderEvidence["category"];
  readonly httpStatus: number | null;
  readonly providerName: MarketingProviderEvidence["providerName"];
  readonly retryAfterSeconds: number | null;
  constructor(readonly code: "provider_unavailable" | "provider_contract_invalid",
    details: { httpStatus?: number; providerName?: unknown; retryAfter?: string | null } = {}) {
    super("Marketing provider needs operator attention.");
    this.httpStatus = details.httpStatus !== undefined && HTTP_STATUSES.has(details.httpStatus) ? details.httpStatus : null;
    const name = typeof details.providerName === "string" && Object.hasOwn(PROVIDER_ERROR_STATUSES, details.providerName)
      ? details.providerName as keyof typeof PROVIDER_ERROR_STATUSES : null;
    this.providerName = name && PROVIDER_ERROR_STATUSES[name].some((status) => status === this.httpStatus) ? name : null;
    const retryAfter = details.retryAfter;
    this.retryAfterSeconds = typeof retryAfter === "string" && /^\d{1,5}$/.test(retryAfter) && Number(retryAfter) <= 86_400 ? Number(retryAfter) : null;
    // Diagnostic only: no category proves an import was not admitted or authorizes replay.
    this.category = code === "provider_contract_invalid" ? "provider_contract_invalid"
      : this.providerName === "rate_limit_exceeded" ? "rate_limited"
      : this.providerName === "daily_quota_exceeded" || this.providerName === "monthly_quota_exceeded" ? "quota_exceeded"
      : this.httpStatus !== null && [400, 401, 403, 404, 405, 413, 422].includes(this.httpStatus) ? "configuration_rejected"
      : "provider_unavailable";
  }
}
export function marketingProviderEvidence(error: unknown): MarketingProviderEvidence {
  const value = error instanceof MarketingProviderError ? error : new MarketingProviderError("provider_unavailable");
  return { category: value.category, httpStatus: value.httpStatus, providerName: value.providerName, retryAfterSeconds: value.retryAfterSeconds };
}
async function providerDeadline<T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new MarketingProviderError("provider_unavailable")); }, 3_000);
  });
  try { return await Promise.race([operation(controller.signal), deadline]); }
  catch (error) { throw error instanceof MarketingProviderError ? error : new MarketingProviderError("provider_unavailable"); }
  finally { clearTimeout(timer); controller.abort(); }
}
async function responseError(response: Response): Promise<MarketingProviderError> {
  let providerName: unknown;
  try {
    const body: unknown = JSON.parse(await readBoundedBody(response, 16_384));
    if (record(body)) {
      providerName = body.name;
      // An import identity or contradictory body is not an ordinary rate rejection.
      // Keep the HTTP evidence, but never interpret or rebind an identity from an error.
      if (providerName === "rate_limit_exceeded" && (!Object.keys(body).every((key) => ["name", "message", "statusCode"].includes(key))
        || (Object.hasOwn(body, "message") && typeof body.message !== "string")
        || (Object.hasOwn(body, "statusCode") && body.statusCode !== response.status))) providerName = undefined;
    }
  } catch { /* Retain status only when provider error content cannot be safely decoded. */ }
  return new MarketingProviderError("provider_unavailable", { httpStatus: response.status, providerName, retryAfter: response.headers.get("Retry-After") });
}
async function requestJson(path: string, apiKey: string, method: string, body: unknown, maxBytes: number, signal: AbortSignal): Promise<unknown> {
  signal.throwIfAborted();
  const multipart = body instanceof FormData;
  const response = await fetch(`https://api.resend.com${path}`, { method, cache: "no-store", redirect: "error",
    signal, headers: { Authorization: `Bearer ${apiKey}`, ...(!multipart ? { "Content-Type": "application/json" } : {}) },
    ...(body === undefined ? {} : { body: multipart ? body : JSON.stringify(body) }) });
  signal.throwIfAborted();
  if (!response.ok) throw await responseError(response);
  return JSON.parse(await readBoundedBody(response, maxBytes));
}
export async function marketingProviderRequest(path: string, apiKey: string, method = "GET", body?: unknown, maxBytes = 600_000): Promise<unknown> {
  return providerDeadline((signal) => requestJson(path, apiKey, method, body, maxBytes, signal));
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
    return providerDeadline(async (signal) => {
      // A missing Contact is distinct from an outage; do not create on an arbitrary failed read.
      const response = await fetch(`https://api.resend.com/contacts/${encodeURIComponent(idOrEmail)}`, {
        cache: "no-store", redirect: "error", signal, headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (response.status === 404) { await response.body?.cancel(); return null; }
      if (!response.ok) throw await responseError(response);
      const value: unknown = JSON.parse(await readBoundedBody(response, 16_384));
      if (!record(value) || typeof value.email !== "string" || typeof value.unsubscribed !== "boolean") throw new MarketingProviderError("provider_contract_invalid");
      return { id: identifier(value.id), email: value.email, unsubscribed: value.unsubscribed };
    });
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
    // All bounded pages share one deadline; a late response cannot start another fetch.
    return providerDeadline(async (signal) => {
      let after: string | null = null;
      for (let page = 0; page < 5; page++) {
        const value = await requestJson(`/contacts/${identifier(id)}/topics?limit=100${after ? `&after=${after}` : ""}`, apiKey, "GET", undefined, 600_000, signal);
        if (!record(value) || !Array.isArray(value.data) || typeof value.has_more !== "boolean") throw new MarketingProviderError("provider_contract_invalid");
        const topic = value.data.find((entry: unknown) => record(entry) && entry.id === topicId);
        if (record(topic) && (topic.subscription === "opt_in" || topic.subscription === "opt_out")) return topic.subscription;
        if (!value.has_more || value.data.length === 0) break;
        const last = value.data.at(-1);
        if (!record(last)) break;
        after = identifier(last.id);
      }
      throw new MarketingProviderError("provider_contract_invalid");
    });
  },
};
