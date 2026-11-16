import "server-only";
import { randomUUID } from "node:crypto";
import { InboundProviderError, type NormalizedReceivedEmail } from "@/lib/support/inbound-provider";
import { readResendInbound, readResendSentMessageId, downloadResendPhoto } from "@/lib/support/inbound-provider";
import { assertEmailEnvironment, type EmailEnvironment } from "@/lib/email/config";
import { inboundStorage } from "@/lib/support/inbound-storage";
import { processSupportPhotos, cleanupSupportPhotos } from "@/lib/support/photo-worker";

export type InboundWork = {
  id: string; providerEmailId: string; inquiryId: string | null; leaseToken: string; deadlineAt: string;
};
export type SupportIngestionDependencies = {
  now(): number;
  claim(leaseToken: string, signal: AbortSignal): Promise<InboundWork[]>;
  read(providerEmailId: string, signal: AbortSignal): Promise<NormalizedReceivedEmail>;
  pendingRfc(inquiryId: string, signal: AbortSignal): Promise<{ intentId: string; providerEmailId: string }[]>;
  readRfc(providerEmailId: string, signal: AbortSignal): Promise<string | null>;
  recordRfc(intentId: string, providerEmailId: string, rfcId: string, signal: AbortSignal): Promise<boolean>;
  finish(work: InboundWork, email: NormalizedReceivedEmail | null, errorCode: string | null, retryable: boolean, signal: AbortSignal): Promise<boolean>;
  nextPhoto(deadline: number, signal: AbortSignal): Promise<"idle" | "ready" | "rejected" | "retry">;
  sweep(deadline: number, signal: AbortSignal): Promise<number>;
};

/** Durable leases survive interruption; the invocation never relies on post-response work. */
export async function runSupportIngestion(deps: SupportIngestionDependencies) {
  const deadline = deps.now() + 45_000;
  const signal = AbortSignal.timeout(45_000);
  const timeForWork = () => !signal.aborted && deps.now() < deadline - 10_000;
  const result = { messages: 0, photos: 0, rejected: 0, deferred: 0, cleaned: 0 };
  for (let index = 0; index < 2 && timeForWork(); index++) {
    const work = (await deps.claim(randomUUID(), signal))[0];
    if (!work) break;
    let email: NormalizedReceivedEmail;
    try {
      email = await deps.read(work.providerEmailId, signal);
      if (work.inquiryId && timeForWork()) {
        for (const message of await deps.pendingRfc(work.inquiryId, signal)) {
          if (!timeForWork()) break;
          const rfcId = await deps.readRfc(message.providerEmailId, signal);
          if (rfcId) await deps.recordRfc(message.intentId, message.providerEmailId, rfcId, signal);
        }
      }
    } catch (error) {
      if (signal.aborted) break; // No release with a stale result; the lease will resume safely.
      const code = error instanceof InboundProviderError ? error.code : "ingestion_failed";
      const retryable = !(error instanceof InboundProviderError) || error.kind !== "permanent";
      await deps.finish(work, null, code, retryable, signal);
      result.deferred++;
      continue;
    }
    if (await deps.finish(work, email, null, false, signal)) result.messages++;
    else result.deferred++;
  }
  for (let index = 0; index < 2 && timeForWork(); index++) {
    const outcome = await deps.nextPhoto(deadline, signal);
    if (outcome === "idle") break;
    if (outcome === "ready") result.photos++;
    else if (outcome === "rejected") result.rejected++;
    else result.deferred++;
  }
  if (timeForWork()) result.cleaned = await deps.sweep(deadline, signal);
  return result;
}

export async function dispatchSupportIngestion(env: EmailEnvironment = process.env) {
  assertEmailEnvironment(env);
  const apiKey = env.RESEND_RECEIVING_API_KEY ?? env.RESEND_API_KEY ?? "";
  const receivingConfigured = /^re_\S+$/.test(apiKey);
  const result = await runSupportIngestion({
    now: Date.now,
    ...inboundStorage,
    claim: receivingConfigured ? inboundStorage.claim : async () => [],
    read: (id, signal) => readResendInbound(id, apiKey, signal),
    readRfc: (id, signal) => readResendSentMessageId(id, apiKey, signal),
    async nextPhoto(deadline, signal) {
      const outcome = await processSupportPhotos({ deadline, signal, allowReceived: receivingConfigured,
        downloadResendPhoto: (id, attachmentId, photoSignal) => downloadResendPhoto(id, attachmentId, apiKey, photoSignal) });
      return outcome.processed ? "ready" : outcome.rejected ? "rejected" : outcome.deferred ? "retry" : "idle";
    },
    async sweep(deadline, signal) { return (await cleanupSupportPhotos({ deadline, signal })).cleaned; },
  });
  return { ...result, receivingConfigured };
}
