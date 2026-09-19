import type { PaymentOperations } from "@/lib/payments/inbox";
import type { PaymentOperationsView } from "@/lib/admin/payments/types";

function ageSeconds(value: string | null, now: number): number | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp <= now
    ? Math.floor((now - timestamp) / 1_000)
    : null;
}

/** Explicit allowlist keeps stored private facts out of the operator client. */
export function presentPaymentOperations(
  source: PaymentOperations,
  now = Date.now(),
): PaymentOperationsView {
  const heartbeatAgeSeconds = ageSeconds(source.heartbeat.completedAt, now);
  const oldestPendingAgeSeconds = ageSeconds(source.oldestPendingAt, now);
  return {
    accountId: source.accountId,
    environment: source.environment,
    observedAt: new Date(now).toISOString(),
    heartbeat: {
      startedAt: source.heartbeat.startedAt,
      completedAt: source.heartbeat.completedAt,
      processedCount: source.heartbeat.processedCount,
      failureCount: source.heartbeat.failureCount,
    },
    counts: {
      pending: source.counts.pending, processing: source.counts.processing,
      processed: source.counts.processed, ignored: source.counts.ignored,
      dead_letter: source.counts.dead_letter,
    },
    oldestPendingAt: source.oldestPendingAt,
    items: source.items.map((item) => ({
      id: item.id, eventId: item.eventId, eventType: item.eventType, objectId: item.objectId,
      state: item.state, attempts: item.attempts, lifetimeAttempts: item.lifetimeAttempts,
      version: item.version, receivedAt: item.receivedAt, nextAttemptAt: item.nextAttemptAt,
      processedAt: item.processedAt, incidentCode: item.incidentCode,
      replayEligible: item.replayEligible, provenance: item.provenance,
    })),
    incidents: source.incidents.map((incident) => ({
      id: incident.id, itemId: incident.itemId, code: incident.code,
      createdAt: incident.createdAt, resolvedAt: incident.resolvedAt,
    })),
    refunds: source.refunds.map((refund) => ({
      refundId: refund.refundId, chargeId: refund.chargeId, paymentIntentId: refund.paymentIntentId,
      amountCents: refund.amountCents, currency: refund.currency, status: refund.status,
      observedAt: refund.observedAt, succeededPreviously: refund.succeededPreviously,
    })),
    health: {
      heartbeatStale: heartbeatAgeSeconds === null || now - Date.parse(source.heartbeat.completedAt!) > 300_000,
      heartbeatAgeSeconds,
      oldestPendingAgeSeconds,
      overdue: oldestPendingAgeSeconds !== null && now - Date.parse(source.oldestPendingAt!) > 900_000,
      queueDepth: source.counts.pending + source.counts.processing,
    },
  };
}
