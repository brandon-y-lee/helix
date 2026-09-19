import { describe, expect, it } from "vitest";
import { extractPaymentEventEnvelope, normalizePaymentEventEnvelope, PaymentEventError } from "@/lib/payments/events";

const accountId = "acct_1Tm9WRFEzyaKzdmq";
const apiVersion = "2026-06-24.dahlia";

function event(type = "checkout.session.completed", object: Record<string, unknown> = {
  object: "checkout.session", id: "cs_test_session123", livemode: false, payment_intent: "pi_payment123",
}) {
  return {
    object: "event", id: "evt_delivery123", type, api_version: apiVersion,
    created: 1_789_747_200, livemode: false, data: { object },
  };
}

describe("minimal sandbox payment event envelopes", () => {
  it("retains only the signed identity needed to recover a payment", () => {
    const input = event(undefined, {
      object: "checkout.session", id: "cs_test_session123", livemode: false,
      payment_intent: { id: "pi_payment123", object: "payment_intent", livemode: false, customer: "cus_private" },
      customer_email: "private@example.com", metadata: { private: "private" },
      customer_details: { name: "Private Name", address: { line1: "Private Address" } },
    });

    expect(extractPaymentEventEnvelope(input)).toEqual({
      accountId, environment: "sandbox", eventId: "evt_delivery123",
      eventType: "checkout.session.completed", apiVersion,
      createdAt: "2026-09-18T16:00:00.000Z", objectKind: "checkout.session",
      objectId: "cs_test_session123", chargeId: null, paymentIntentId: "pi_payment123",
    });
  });

  it.each([
    "checkout.session.completed", "checkout.session.expired",
    "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed",
  ])("retains %s for current-state reconciliation", (type) => {
    expect(extractPaymentEventEnvelope(event(type)).eventType).toBe(type);
  });

  it("retains a Charge reference without refund amounts or snapshot state", () => {
    expect(extractPaymentEventEnvelope(event("charge.refunded", {
      object: "charge", id: "ch_payment123", livemode: false, payment_intent: null,
      amount_refunded: 500, refunded: false, refunds: { data: [{ id: "re_partial" }] },
    }))).toMatchObject({ objectKind: "charge", objectId: "ch_payment123", chargeId: "ch_payment123", paymentIntentId: null });
  });

  it.each(["refund.created", "refund.updated", "refund.failed"])("accepts %s without an invented Refund livemode field", (type) => {
    expect(extractPaymentEventEnvelope(event(type, {
      object: "refund", id: "re_refund123", charge: "ch_payment123", payment_intent: "pi_payment123", status: "pending",
    }))).toMatchObject({ eventType: type, objectKind: "refund", objectId: "re_refund123", chargeId: "ch_payment123", paymentIntentId: "pi_payment123" });
  });

  it("preserves non-card refund and Charge identifiers for legacy asynchronous payments", () => {
    expect(extractPaymentEventEnvelope(event("refund.updated", {
      object: "refund", id: "pyr_refund123", charge: { id: "py_payment123", object: "charge", livemode: false }, payment_intent: null,
    }))).toMatchObject({ objectId: "pyr_refund123", chargeId: "py_payment123" });
  });

  it.each([{}, { account: accountId }, { context: accountId }, { account: accountId, context: accountId }])(
    "accepts direct delivery in only the approved account context", (identity) => {
      expect(extractPaymentEventEnvelope({ ...event(), ...identity }).accountId).toBe(accountId);
    },
  );

  it.each([
    { livemode: true }, { livemode: undefined }, { livemode: "false" },
    { account: "acct_foreign" }, { context: "acct_foreign" },
    { context: `${accountId}/acct_other` }, { account: "" }, { context: {} },
  ])("rejects unapproved event context or mode", (change) => {
    expect(() => extractPaymentEventEnvelope({ ...event(), ...change })).toThrowError(PaymentEventError);
  });

  it.each([
    { object: "invoice" }, { id: "evt_" }, { id: "evt_private@example.com" },
    { id: `evt_${"a".repeat(201)}` }, { type: "payment_intent.succeeded" },
    { api_version: "2025-01-01" }, { api_version: null },
    { created: -1 }, { created: 1.2 }, { created: Number.MAX_SAFE_INTEGER },
    { data: null }, { data: { object: null } }, { data: { object: [] } },
  ])("rejects malformed or incompatible envelopes", (change) => {
    expect(() => extractPaymentEventEnvelope({ ...event(), ...change })).toThrowError(PaymentEventError);
  });

  it.each([
    { object: "charge", id: "cs_test_session123", livemode: false },
    { object: "checkout.session", id: "cs_live_session123", livemode: false },
    { object: "checkout.session", id: "cs_test_session123", livemode: true },
    { object: "checkout.session", id: "cs_test_session123" },
    { object: "checkout.session", id: "cs_test_session123", livemode: false, payment_intent: "cus_customer" },
    { object: "checkout.session", id: "cs_test_session123", livemode: false, payment_intent: { id: "pi_payment123", object: "customer", livemode: false } },
    { object: "checkout.session", id: "cs_test_session123", livemode: false, payment_intent: { id: "pi_payment123", object: "payment_intent", livemode: true } },
  ])("rejects mismatched object identity or nested payment mode", (object) => {
    expect(() => extractPaymentEventEnvelope(event(undefined, object))).toThrowError(PaymentEventError);
  });

  it("rejects an explicitly live Refund despite the signed outer sandbox mode", () => {
    expect(() => extractPaymentEventEnvelope(event("refund.created", {
      object: "refund", id: "re_refund123", livemode: true, charge: null, payment_intent: null,
    }))).toThrowError(PaymentEventError);
  });

  it("validates and allowlists an envelope crossing the durable storage boundary", () => {
    const envelope = extractPaymentEventEnvelope(event());
    expect(normalizePaymentEventEnvelope({ ...envelope, secret: "must not persist" })).toEqual(envelope);
    for (const change of [
      { accountId: "acct_other" }, { environment: "live" }, { apiVersion: "old" },
      { objectKind: "charge" }, { chargeId: "ch_other" }, { paymentIntentId: "customer_email" },
      { createdAt: "2026-09-31T00:00:00.000Z" }, { createdAt: "2026-09-18T16:00:00+00:00" },
    ]) expect(() => normalizePaymentEventEnvelope({ ...envelope, ...change })).toThrowError(PaymentEventError);
  });
});
