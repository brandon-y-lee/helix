import "server-only";
import { isEmailAddress } from "@/lib/email/config";
import { mailbox } from "@/lib/production-email-gateway/legacy";
import type { ProductionMarketingEnvironment } from "./contract";
import { productionMarketingUuid } from "./delivery-config";

const contact = "contact.updated";
const topics = "contact.topics.updated";
const delivery = new Set(["email.bounced", "email.complained", "email.suppressed"]);

type Ambiguity = "invalid_contact_deny" | "invalid_restrictive_envelope" | "recipient_ambiguous" | "ownership_conflict";
export type NativeRestriction = {
  p_contract_hash: string | null;
  p_event_id: string;
  p_event_type: string;
  p_occurred_at: string | null;
  p_sender: string | null;
  p_recipient: string | null;
  p_global_denied: boolean;
  p_denied_topic_ids: string[];
  p_ambiguity: Ambiguity | null;
};
export type NativeRestrictionResult = "applied" | "held" | "ignored" | "duplicate";
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

function address(value: unknown, allowDisplay = false) {
  if (typeof value !== "string" || /[\u0000-\u001f\u007f]/u.test(value)) return null;
  const normalized = allowDisplay ? mailbox(value) : value.trim().toLowerCase();
  if (!normalized || !isEmailAddress(normalized)) return null;
  // An additional mailbox must not be hidden in the display name.
  if (allowDisplay && value.includes("<") && value.split("<")[0].includes("@")) return null;
  const [local, domain] = normalized.split("@");
  return local.length <= 64 && !local.startsWith(".") && !local.endsWith(".") &&
    !local.includes("..") && domain.split(".").every(label => label.length <= 63) ? normalized : null;
}

function topicDenials(data: Record<string, unknown>, result: NativeRestriction) {
  if (!Array.isArray(data.topics)) {
    result.p_ambiguity = "invalid_contact_deny";
    return result;
  }
  const states = new Map<string, string>();
  for (const row of data.topics) {
    if (!object(row) || typeof row.id !== "string" || !productionMarketingUuid.test(row.id.toLowerCase()) ||
        (row.subscription !== "opt_in" && row.subscription !== "opt_out")) {
      result.p_ambiguity = "invalid_contact_deny";
      continue;
    }
    const id = row.id.toLowerCase();
    if (states.has(id) && states.get(id) !== row.subscription) result.p_ambiguity = "invalid_contact_deny";
    if (!states.has(id) || row.subscription === "opt_out") states.set(id, row.subscription);
  }
  const denied = [...states].filter(([, state]) => state === "opt_out").map(([id]) => id).sort();
  if (denied.length > 100) result.p_ambiguity = "invalid_contact_deny";
  else result.p_denied_topic_ids = denied;
  return denied.length || result.p_ambiguity ? result : null;
}

export function nativeCallbackIdentity(env: ProductionMarketingEnvironment) {
  const sender = address(env.HELIX_PRODUCTION_MARKETING_NATIVE_SENDER);
  const template = env.HELIX_PRODUCTION_MARKETING_NATIVE_TEMPLATE_ID;
  const digest = env.HELIX_PRODUCTION_MARKETING_NATIVE_CONTRACT_SHA256;
  const qualified = sender && sender === env.HELIX_PRODUCTION_MARKETING_NATIVE_SENDER &&
    /(?:^|\.)helixskin\.us$/.test(sender.split("@")[1]) &&
    typeof template === "string" && productionMarketingUuid.test(template) &&
    typeof digest === "string" && /^[0-9a-f]{64}$/.test(digest);
  return qualified ? { sender, template, digest } : null;
}

/** Project a verified provider observation onto the only fields the restriction RPC accepts.
 * The DB independently verifies the qualified sender/Topic and an existing local identity under lock.
 */
export function nativeRestriction(
  eventType: string, receivedData: unknown, id: string, occurredAt: string | null,
  env: ProductionMarketingEnvironment,
): NativeRestriction | null {
  if (eventType !== contact && eventType !== topics && !delivery.has(eventType)) return null;
  const data = object(receivedData) ? receivedData : {};
  const identity = nativeCallbackIdentity(env);
  const sender = identity?.sender ?? address(env.HELIX_PRODUCTION_MARKETING_NATIVE_SENDER);
  const template = identity?.template ?? env.HELIX_PRODUCTION_MARKETING_NATIVE_TEMPLATE_ID;
  const qualified = identity !== null;
  const result: NativeRestriction = {
    p_contract_hash: identity?.digest ?? null, p_event_id: id, p_event_type: eventType,
    p_occurred_at: occurredAt, p_sender: null, p_recipient: null, p_global_denied: false,
    p_denied_topic_ids: [], p_ambiguity: null,
  };

  if (eventType === contact || eventType === topics) {
    if (eventType === contact) {
      if (data.unsubscribed === false) return null;
      result.p_global_denied = data.unsubscribed === true;
      if (!result.p_global_denied) result.p_ambiguity = "invalid_contact_deny";
    } else if (!topicDenials(data, result)) return null;
    // A clear account-wide opt-out remains restrictive even without a usable
    // event time. Ambiguous preference data can hold dispatch but cannot select a person.
    if (result.p_global_denied || (!result.p_ambiguity && occurredAt)) result.p_recipient = address(data.email);
    if (!result.p_recipient || !occurredAt) result.p_ambiguity = "invalid_contact_deny";
    return result;
  }

  result.p_sender = address(data.from, true);
  const nativeSender = !!sender && sender === result.p_sender;
  const nativeTemplate = !!template && typeof data.template_id === "string" &&
    data.template_id.toLowerCase() === template;
  if ((nativeTemplate && !nativeSender) || (nativeSender && (
    !qualified || (data.template_id != null && !nativeTemplate) || data.broadcast_id != null ||
    (data.tags !== undefined && (!object(data.tags) ||
      Object.keys(data.tags).some(key => key.startsWith("helix_") || key === "environment")))
  ))) {
    result.p_ambiguity = "ownership_conflict";
  } else if (!result.p_sender || !occurredAt) {
    result.p_ambiguity = "invalid_restrictive_envelope";
  } else if (nativeSender) {
    if (typeof data.email_id !== "string" || !productionMarketingUuid.test(data.email_id)) {
      result.p_ambiguity = "invalid_restrictive_envelope";
    } else if (Array.isArray(data.to) && data.to.length === 1 &&
      [data.cc, data.bcc].every(value => value === undefined || (Array.isArray(value) && value.length === 0))) {
      result.p_recipient = address(data.to[0], true);
    }
    if (!result.p_recipient && !result.p_ambiguity) result.p_ambiguity = "recipient_ambiguous";
  }
  // The subscriber's address from definitively unrelated mail is never sent to storage.
  // Even a sender-only observation reaches the DB, so a stale local identity cannot swallow a native denial.
  return result;
}
