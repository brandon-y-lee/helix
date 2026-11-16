import "server-only";
import { isEmailAddress, type EmailEnvironment } from "@/lib/email/config";
import { supportReceivingAddress } from "@/lib/support/inbound-config";
import { inboundRpc } from "@/lib/support/inbound-storage";

function mailbox(value: unknown): string {
  if (typeof value !== "string" || value.length > 512 || /[\r\n\0]/.test(value)) return "";
  const address = isEmailAddress(value) ? value : value.match(/^[^<>,;\r\n]{1,200}\s+<([^<>\s]+)>$/)?.[1];
  return address && isEmailAddress(address) ? address.toLowerCase() : "";
}

export async function recordSupportReceivedEvent(eventId: string, data: Record<string, unknown>, receivedAt: string, env: EmailEnvironment): Promise<void> {
  const expected = supportReceivingAddress(env);
  if (!expected) throw new Error("Support receiving is not configured.");
  const recipientFields = [data.to, data.cc ?? [], data.bcc ?? [], data.received_for ?? []];
  if (recipientFields.some((values) => !Array.isArray(values))
    || recipientFields.reduce<number>((total, values) => total + (values as unknown[]).length, 0) > 100) {
    throw new Error("Unsupported receiving recipient set.");
  }
  const recipients = [...new Set(recipientFields.flatMap((values) => (values as unknown[]).map(mailbox)).filter(Boolean))];
  // Resolve the entire bounded set against exact stored routes in the transaction.
  // Header destinations only hold context; fetched content must independently pass
  // the single-recipient, fixed-participant and history checks before acceptance.
  await inboundRpc("record_support_inbound", { p_event_id: eventId, p_provider_email_id: data.email_id,
    p_sender: mailbox(data.from), p_recipients: recipients, p_received_at: receivedAt, p_expected_address: expected });
}
