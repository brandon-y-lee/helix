import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { EmailDeliveryStorage, EmailIntent } from "@/lib/email/types";

async function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
  const abort = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => { abort.abort(); reject(new Error("Email storage is temporarily unavailable.")); }, 3_000);
  });
  try {
    // A timed-out mutation may have committed. Never replay it here; the stable
    // intent, lease and attempt identity preserve recovery after interruption.
    const { data, error } = await Promise.race([createSupabaseAdminClient().rpc(name, args).abortSignal(abort.signal), deadline]);
    if (error) throw new Error("Email storage is temporarily unavailable.");
    return data;
  } finally { clearTimeout(timer); abort.abort(); }
}
function intent(value: unknown): EmailIntent {
  if (!value || typeof value !== "object" || !("id" in value) || !("environment" in value)
    || value.environment !== "sandbox" || !("purpose" in value) || !["order_confirmation", "order_tracking", "support_acknowledgement", "support_reply", "marketing_confirmation", "welcome_initial", "welcome_education", "product_availability", "product_waitlist_recovery"].includes(String(value.purpose))
    || !("leaseToken" in value) || typeof value.leaseToken !== "string"
    || !("idempotencyKey" in value) || typeof value.idempotencyKey !== "string"
    || !("recipient" in value) || typeof value.recipient !== "string") {
    throw new Error("Email storage returned an invalid delivery intent.");
  }
  return value as EmailIntent;
}
export const emailDeliveryStorage: EmailDeliveryStorage = {
  async claim(leaseToken, limit) {
    const data = await rpc("claim_email_intents", { p_environment: "sandbox", p_lease_token: leaseToken, p_limit: limit });
    if (!Array.isArray(data) || data.length > limit) throw new Error("Email storage returned invalid work.");
    const claimed = data.map(intent);
    const ready: EmailIntent[] = [];
    for (const candidate of claimed) {
      if (candidate.purpose !== "product_availability" || candidate.requestPayload) {
        ready.push(candidate);
        continue;
      }
      // Catalog names and public URLs can change after the transition. Refresh
      // only before the first immutable provider request is prepared.
      const value = await rpc("refresh_product_notification_email", { p_id: candidate.id, p_lease_token: candidate.leaseToken });
      if (value === null) continue;
      const refreshed = intent(value);
      if (refreshed.id !== candidate.id || refreshed.leaseToken !== candidate.leaseToken || refreshed.purpose !== candidate.purpose) {
        throw new Error("Email storage returned an invalid delivery intent.");
      }
      ready.push(refreshed);
    }
    return ready;
  },
  async prepare(id, leaseToken, payload) {
    const data = await rpc("prepare_email_attempt", { p_id: id, p_lease_token: leaseToken, p_request_payload: payload });
    return data ? intent(data) : null;
  },
  async finish(id, leaseToken, outcome) {
    return (await rpc("finish_email_attempt", { p_id: id, p_lease_token: leaseToken,
      p_outcome: outcome.kind, p_provider_email_id: outcome.kind === "accepted" ? outcome.id : null,
      p_error_code: outcome.kind === "accepted" ? null : outcome.code })) === true;
  },
};

export type EmailDeliveryEvent = {
  eventId: string; messageId: string; providerEmailId: string; eventType: string;
  occurredAt: string; sender: string; recipient: string;
};
export async function recordEmailDeliveryEvent(event: EmailDeliveryEvent): Promise<void> {
  await rpc("record_email_delivery_event", { p_event_id: event.eventId, p_environment: "sandbox",
    p_message_id: event.messageId, p_provider_email_id: event.providerEmailId, p_event_type: event.eventType,
    p_occurred_at: event.occurredAt, p_sender: event.sender, p_recipient: event.recipient });
}
