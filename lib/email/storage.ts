import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { EmailDeliveryStorage, EmailIntent } from "@/lib/email/types";

async function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await createSupabaseAdminClient().rpc(name, args);
  if (error) throw new Error("Email storage is temporarily unavailable.");
  return data;
}
function intent(value: unknown): EmailIntent {
  if (!value || typeof value !== "object" || !("id" in value) || !("environment" in value)
    || value.environment !== "sandbox" || !("purpose" in value) || value.purpose !== "order_confirmation"
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
    return data.map(intent);
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
