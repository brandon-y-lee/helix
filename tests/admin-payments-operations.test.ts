import { describe, expect, it } from "vitest";
import { presentPaymentOperations } from "@/lib/admin/payments/presentation";
import type { PaymentOperations } from "@/lib/payments/inbox";

const now = Date.parse("2026-09-19T02:00:00Z");
export const operations: PaymentOperations = {
  accountId: "acct_1Tm9WRFEzyaKzdmq", environment: "sandbox", observedAt: "2026-09-19T01:59:59Z",
  heartbeat: { startedAt: "2026-09-19T01:54:00Z", completedAt: "2026-09-19T01:55:00Z", processedCount: 1, failureCount: 0 },
  counts: { pending: 2, processing: 1, processed: 5, ignored: 0, dead_letter: 1 },
  oldestPendingAt: "2026-09-19T01:44:59Z", items: [], incidents: [], refunds: [],
};

describe("payment operations presentation", () => {
  it("derives heartbeat and overdue warnings from the current read time", () => {
    const current = presentPaymentOperations(operations, now);
    expect(current.health).toEqual({ heartbeatStale: false, heartbeatAgeSeconds: 300, oldestPendingAgeSeconds: 901, overdue: true, queueDepth: 3 });
    expect(presentPaymentOperations(operations, now + 1_000).health.heartbeatStale).toBe(true);
  });
  it.each([null, "invalid", "2026-09-19T02:00:01Z"])("does not report a healthy scheduler from missing or invalid completion %s", (completedAt) => {
    expect(presentPaymentOperations({ ...operations, heartbeat: { ...operations.heartbeat, completedAt } }, now).health.heartbeatStale).toBe(true);
  });

  it("observes the exact overdue and stale boundaries without rounding away failures", () => {
    const exact = { ...operations, oldestPendingAt: "2026-09-19T01:45:00Z" };
    expect(presentPaymentOperations(exact, now).health.overdue).toBe(false);
    expect(presentPaymentOperations(exact, now + 1).health.overdue).toBe(true);
    expect(presentPaymentOperations(exact, now + 1).health.heartbeatStale).toBe(true);
  });

  it("keeps only operational fields and never passes private order or customer details through", () => {
    const source = {
      ...operations, rawPayload: "raw-payload", customerEmail: "customer@example.test",
      heartbeat: { ...operations.heartbeat, secret: "scheduler-secret" },
      items: [{ id: "11111111-1111-4111-8111-111111111111", eventId: "evt_example", eventType: "refund.updated", objectId: "re_example", state: "pending", attempts: 1, lifetimeAttempts: 2, version: 3, receivedAt: "2026-09-19T01:00:00Z", nextAttemptAt: "2026-09-19T02:01:00Z", processedAt: null, incidentCode: "refund_requires_action", replayEligible: true, provenance: "webhook", orderId: "private-order", billingAddress: "private-address" }],
      incidents: [{ id: "22222222-2222-4222-8222-222222222222", itemId: "11111111-1111-4111-8111-111111111111", code: "refund_requires_action", createdAt: "2026-09-19T01:59:00Z", resolvedAt: null, providerMessage: "private-message" }],
      refunds: [{ refundId: "re_example", chargeId: "ch_example", paymentIntentId: "pi_example", orderId: "private-order", amountCents: 2500, currency: "usd", status: "requires_action", observedAt: "2026-09-19T01:59:00Z", succeededPreviously: true, customerEmail: "customer@example.test" }],
    } as unknown as PaymentOperations;
    const result = presentPaymentOperations(source, now);
    const serialized = JSON.stringify(result);
    for (const disallowed of ["raw-payload", "customer@example.test", "scheduler-secret", "private-order", "private-address", "private-message"]) {
      expect(serialized).not.toContain(disallowed);
    }
    expect(result.refunds[0]).toEqual({ refundId: "re_example", chargeId: "ch_example", paymentIntentId: "pi_example", amountCents: 2500, currency: "usd", status: "requires_action", observedAt: "2026-09-19T01:59:00Z", succeededPreviously: true });
    expect(result.incidents[0].code).toBe("refund_requires_action");
    expect(result.health.heartbeatStale).toBe(false);
  });

});
