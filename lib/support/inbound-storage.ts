import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { InboundWork } from "@/lib/support/inbound";
import type { NormalizedReceivedEmail } from "@/lib/support/inbound-provider";

export async function inboundRpc(name: string, args: Record<string, unknown>, signal = AbortSignal.timeout(5_000)): Promise<unknown> {
  const { data, error } = await createSupabaseAdminClient().rpc(name, args).abortSignal(signal);
  if (error) throw new Error("Incoming support storage is temporarily unavailable.");
  return data;
}
export const inboundStorage = {
  async claim(leaseToken: string, signal: AbortSignal): Promise<InboundWork[]> {
    const data = await inboundRpc("claim_support_inbound", { p_lease_token: leaseToken, p_limit: 1 }, signal);
    if (!Array.isArray(data) || data.length > 1 || data.some((row) => !row || typeof row.id !== "string"
      || typeof row.providerEmailId !== "string" || row.leaseToken !== leaseToken
      || (row.inquiryId !== null && typeof row.inquiryId !== "string"))) throw new Error("Invalid incoming support work.");
    return data;
  },
  async pendingRfc(inquiryId: string, signal: AbortSignal): Promise<{ intentId: string; providerEmailId: string }[]> {
    const data = await inboundRpc("get_support_pending_rfc_messages", { p_inquiry_id: inquiryId }, signal);
    if (!Array.isArray(data) || data.length > 5 || data.some((row) => !row || typeof row.intentId !== "string"
      || typeof row.providerEmailId !== "string")) throw new Error("Invalid pending email history.");
    return data;
  },
  async recordRfc(intentId: string, providerEmailId: string, rfcMessageId: string, signal?: AbortSignal): Promise<boolean> {
    return await inboundRpc("record_support_rfc_message", { p_intent_id: intentId, p_provider_email_id: providerEmailId,
      p_rfc_message_id: rfcMessageId }, signal) === true;
  },
  async finish(work: InboundWork, email: NormalizedReceivedEmail | null, errorCode: string | null, retryable: boolean, signal: AbortSignal): Promise<boolean> {
    return await inboundRpc("finish_support_inbound", { p_id: work.id, p_lease_token: work.leaseToken,
      p_email: email, p_error_code: errorCode, p_retryable: retryable }, signal) === true;
  },
};
