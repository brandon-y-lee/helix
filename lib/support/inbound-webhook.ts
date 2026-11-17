import "server-only";
import { createHash } from "node:crypto";
import { isEmailAddress, type EmailEnvironment } from "@/lib/email/config";
import { supportReceivingAddress } from "@/lib/support/inbound-config";
import { inboundRpc } from "@/lib/support/inbound-storage";

function mailbox(value: unknown): string {
  if (typeof value !== "string" || value.length > 512 || /[\r\n\0]/.test(value)) return "";
  const address = isEmailAddress(value) ? value : value.match(/^[^<>,;\r\n]{1,200}\s+<([^<>\s]+)>$/)?.[1];
  return address && isEmailAddress(address) ? address.toLowerCase() : "";
}

async function hasExactLegacyAliasException(recipients: string[]): Promise<boolean> {
  const other = recipients.filter((address) => address !== "support@helixskin.us");
  if (other.length === 0) return false;
  const hashes = other.map((address) => createHash("sha256").update(address).digest("hex"));
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<false>((resolve) => { timer = setTimeout(() => { controller.abort(); resolve(false); }, 2_000); });
  try {
    // Only opaque exact-address digests enter this read-only resolver. No sender,
    // provider event identity or content is stored while deciding isolation.
    return await Promise.race([inboundRpc("support_legacy_reply_aliases_match", { p_address_hashes: hashes }, controller.signal), deadline]) === true;
  } catch { return false; }
  finally { if (timer) clearTimeout(timer); }
}

export async function recordSupportReceivedEvent(eventId: string, data: Record<string, unknown>, receivedAt: string, env: EmailEnvironment): Promise<void> {
  const recipientFields = [data.to, data.cc === undefined ? [] : data.cc, data.bcc === undefined ? [] : data.bcc,
    data.received_for === undefined ? [] : data.received_for];
  if (recipientFields.some((values) => !Array.isArray(values))
    || recipientFields.reduce<number>((total, values) => total + (values as unknown[]).length, 0) > 100
    || recipientFields.some((values) => (values as unknown[]).some((value) => !mailbox(value)))) {
    throw new Error("Unsupported receiving recipient set.");
  }
  const recipients = [...new Set(recipientFields.flatMap((values) => (values as unknown[]).map(mailbox)))];
  // Native production Inbox exclusion is unconditional, independent of every new
  // production runtime setting. Inspect the ENTIRE normalized envelope first.
  if (recipients.includes("support@helixskin.us") && !await hasExactLegacyAliasException(recipients)) return;
  const expected = supportReceivingAddress(env);
  if (!expected) throw new Error("Support receiving is not configured.");
  // Resolve the entire bounded set against exact stored routes in the transaction.
  // Header destinations only hold context; fetched content must independently pass
  // the single-recipient, fixed-participant and history checks before acceptance.
  await inboundRpc("record_support_inbound", { p_event_id: eventId, p_provider_email_id: data.email_id,
    p_sender: mailbox(data.from), p_recipients: recipients, p_received_at: receivedAt, p_expected_address: expected });
}
