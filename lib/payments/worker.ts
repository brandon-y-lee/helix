import "server-only";
import {
  claimPaymentWorkerRun, claimPaymentEvents, finishPaymentEvent, finishPaymentWorkerRun,
  recordPaymentRefundObservations, recordPaymentEventIncident, type PaymentLease,
} from "@/lib/payments/inbox";
import { reconcilePaymentEvent, type PaymentReconciliationOutcome } from "@/lib/payments/reconciliation";
import { classifyPaymentFailure } from "@/lib/payments/provider-errors";
import { paymentRetryDelaySeconds } from "@/lib/payments/retry-policy";
import { withPaymentDeadline } from "@/lib/payments/deadline";
import { PaymentLeaseLostError } from "@/lib/payments/lease";

export type PaymentWorkerRunResult = {
  outcome: "completed" | "busy"; processed: number; ignored: number; retried: number; quarantined: number;
};

/** Claims one item at a time; nothing is left running after the response. */
export async function runPaymentWorker(): Promise<PaymentWorkerRunResult> {
  const startedAt = performance.now();
  const workDeadline = startedAt + 35_000;
  return withPaymentDeadline({ deadlineAtMs: startedAt + 40_000 }, async () => {
    const counts = { processed: 0, ignored: 0, retried: 0, quarantined: 0 };
    const run = await withPaymentDeadline({ deadlineAtMs: workDeadline }, claimPaymentWorkerRun);
    if (!run) return { outcome: "busy", ...counts };
    let failed = false;
    try {
      for (let claimed = 0; claimed < 20 && performance.now() < workDeadline; claimed += 1) {
        const items = await withPaymentDeadline({ deadlineAtMs: workDeadline }, () =>
          claimPaymentEvents({ runToken: run.token, limit: 1 }));
        if (!items.length) break;
        const item = items[0];
        const lease: PaymentLease = { runToken: run.token, itemId: item.id,
          leaseToken: item.leaseToken, expectedVersion: item.version };
        let outcome: PaymentReconciliationOutcome;
        try {
          outcome = await withPaymentDeadline({ deadlineAtMs: workDeadline }, () =>
            reconcilePaymentEvent(item.envelope, {
              persistRefundObservations: (observations) => recordPaymentRefundObservations({ ...lease, ...observations }),
            }));
        } catch (error) {
          if (error instanceof PaymentLeaseLostError) throw error;
          outcome = classifyPaymentFailure(error);
        }
        const exhausted = outcome.disposition === "pending" && item.attempts >= 12;
        const disposition = exhausted || outcome.disposition === "quarantined" ? "dead_letter" : outcome.disposition;
        let completed: boolean;
        try {
          completed = await finishPaymentEvent({ ...lease, disposition,
            ...(exhausted ? { code: "attempts_exhausted" as const } : outcome.code ? { code: outcome.code } : {}),
            ...(disposition === "pending" ? { retryAfterSeconds: paymentRetryDelaySeconds(item.attempts, {
              retryAfterSeconds: outcome.retryAfterSeconds,
            }) } : {}),
          });
        } catch {
          // An uncertain finish is never counted as acknowledged. A separate,
          // fenced incident can survive an intermittent completion failure.
          await recordPaymentEventIncident({ ...lease, code: "storage_unavailable" });
          throw new Error("Payment completion could not be retained.");
        }
        if (!completed) throw new PaymentLeaseLostError();
        if (disposition === "dead_letter") counts.quarantined += 1;
        else if (disposition === "pending") counts.retried += 1;
        else counts[disposition] += 1;
      }
    } catch {
      failed = true;
      throw new Error("Payment worker did not complete durable reconciliation.");
    } finally {
      const completed = await finishPaymentWorkerRun({ runToken: run.token,
        processedCount: counts.processed + counts.ignored,
        failureCount: Math.min(20, counts.retried + counts.quarantined + (failed ? 1 : 0)) });
      if (!completed) throw new Error("Payment worker lease is no longer current.");
    }
    return { outcome: "completed", ...counts };
  });
}
