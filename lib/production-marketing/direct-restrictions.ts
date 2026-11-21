import "server-only";
import { isEmailAddress } from "@/lib/email/config";
import { mailbox } from "@/lib/production-email-gateway/legacy";
import { productionMarketingUuid } from "./delivery-config";

export type DirectPreference = {
  p_event_id: string;
  p_event_type: string;
  p_occurred_at: string | null;
  p_email: string | null;
  p_global_denied: boolean;
  p_denied_topics: string[];
  p_ambiguous: boolean;
};
export type DirectPreferenceResult = "applied" | "held" | "ignored" | "duplicate" | "paused";
export type DirectReceiptHold = { p_event_id: string; p_message_id: string | null; p_provider_id: string | null };
export type DirectReceiptHoldResult = "held" | "duplicate" | "paused";
export const negativeDelivery = new Set(["email.bounced", "email.complained", "email.suppressed"]);
export const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
export const uuid = (value: unknown): value is string =>
  typeof value === "string" && value.length === 36 && productionMarketingUuid.test(value);

function address(value: unknown) {
  if (typeof value !== "string" || /[\u0000-\u001f\u007f]/u.test(value)) return null;
  const normalized = value.trim().toLowerCase();
  if (!isEmailAddress(normalized)) return null;
  const [local, domain] = normalized.split("@");
  return local.length <= 64 &&
    !local.startsWith(".") &&
    !local.endsWith(".") &&
    !local.includes("..") &&
    domain.split(".").every((label) => label.length <= 63)
    ? normalized
    : null;
}

export const sharedMarketingSender = (sender: unknown) => mailbox(sender) === "hello@helixskin.us";

export function claimsMarketingReceipt(data: unknown): boolean {
  if (!object(data)) return false;
  const tags = data.tags;
  if (Array.isArray(tags)) {
    // Unexpected signed wire shape. Retain a recognizable claim for reconciliation;
    // its values cannot establish a frozen message or recipient.
    return (
      sharedMarketingSender(data.from) &&
      tags.some(
        (row) =>
          object(row) &&
          (row.name === "helix_message_id" ||
            row.name === "helix_contract" ||
            row.name === "helix_purpose" ||
            (row.name === "environment" && row.value === "production")),
      )
    );
  }
  if (!object(tags)) return false;
  if (tags.environment === "production" || Object.hasOwn(tags, "helix_contract")) return true;
  if (tags.helix_environment === "sandbox")
    return Object.hasOwn(tags, "helix_purpose") && sharedMarketingSender(data.from);
  if (Object.hasOwn(tags, "helix_message_id") || Object.hasOwn(tags, "helix_purpose")) return true;
  return (
    sharedMarketingSender(data.from) &&
    Object.keys(tags).some(
      (key) => key.startsWith("helix_") && key !== "helix_support" && !key.startsWith("helix_support_"),
    )
  );
}

/** The verified provider's account-level and Topic opt-outs are negative evidence only.
 * The database owns the immutable address lookup and the pinned Topic. */
export function directPreference(
  type: string,
  raw: unknown,
  id: string,
  occurredAt: string | null,
): DirectPreference | null {
  const topic = type === "contact.topics.updated";
  if (!topic && type !== "contact.created" && type !== "contact.updated") return null;
  const data = object(raw) ? raw : {};
  let ambiguous = false;
  const denied = new Set<string>();
  if (topic) {
    if (Array.isArray(data.topics)) {
      const states = new Map<string, string>();
      for (const row of data.topics) {
        const key = object(row) && typeof row.id === "string" ? row.id.toLowerCase() : null;
        if (!object(row) || !uuid(key) || (row.subscription !== "opt_in" && row.subscription !== "opt_out")) {
          ambiguous = true;
          continue;
        }
        const state = row.subscription;
        if (states.has(key) && states.get(key) !== state) ambiguous = true;
        states.set(key, state);
        if (state === "opt_out") denied.add(key);
      }
      if (denied.size > 100) {
        ambiguous = true;
        denied.clear();
      }
    } else ambiguous = true;
    if (!ambiguous && !denied.size) return null;
  } else {
    if (data.unsubscribed === false) return null;
    ambiguous = data.unsubscribed !== true;
  }
  const global = !topic && data.unsubscribed === true;
  const email = global || (!ambiguous && occurredAt) ? address(data.email) : null;
  return {
    p_event_id: id,
    p_event_type: type,
    p_occurred_at: occurredAt,
    p_email: email,
    p_global_denied: global,
    p_denied_topics: [...denied].sort(),
    p_ambiguous: ambiguous || !occurredAt || !email,
  };
}
