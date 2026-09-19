import type Stripe from "stripe";
import type { VerifiedCheckoutPaymentFacts } from "@/lib/checkout/payment-verification";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const boundary = vi.hoisted(() => ({
  cookieGet: vi.fn(), cookieSet: vi.fn(), identity: vi.fn(),
  retrieveSession: vi.fn(), expireSession: vi.fn(), retrieveBundle: vi.fn(), rpc: vi.fn(), from: vi.fn(),
  authorizeReceipt: vi.fn(), loadContract: vi.fn(), finalizePayment: vi.fn(),
  recordException: vi.fn(), getException: vi.fn(), resolveExceptions: vi.fn(), isLegacyOrder: vi.fn(), verifiedDelivery: vi.fn(),
  workerRun: vi.fn(), workerClaim: vi.fn(), workerFinish: vi.fn(), workerHeartbeat: vi.fn(), workerIncident: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: boundary.cookieGet, set: boundary.cookieSet }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({
  getCurrentIdentity: boundary.identity, getCurrentUser: boundary.identity,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ from: boundary.from, rpc: boundary.rpc }),
}));
vi.mock("@/lib/stripe/server", () => ({
  getStripeClient: () => ({ checkout: { sessions: { retrieve: boundary.retrieveSession, expire: boundary.expireSession } } }),
}));
vi.mock("@/lib/stripe/payment-verification", () => ({
  retrieveCheckoutPaymentProviderBundle: boundary.retrieveBundle,
  verifyStripeAccount: vi.fn(),
}));

vi.mock("@/lib/orders/receipt-access", () => ({
  authorizeCheckoutReceipt: boundary.authorizeReceipt,
  ensureGuestReceiptBinding: vi.fn(),
}));
vi.mock("@/lib/orders/payment-contracts", () => ({
  loadCheckoutPaymentContract: boundary.loadContract,
  finalizeVerifiedCheckoutPayment: boundary.finalizePayment,
  recordCheckoutPaymentException: boundary.recordException,
  getCheckoutPaymentException: boundary.getException,
  resolveCheckoutPaymentExceptions: boundary.resolveExceptions,
  isLegacyCheckoutOrder: boundary.isLegacyOrder,
  readVerifiedCheckoutDelivery: boundary.verifiedDelivery,
}));
vi.mock("@/lib/payments/inbox", () => ({
  claimPaymentWorkerRun: boundary.workerRun, claimPaymentEvents: boundary.workerClaim,
  finishPaymentEvent: boundary.workerFinish, finishPaymentWorkerRun: boundary.workerHeartbeat,
  recordPaymentEventIncident: boundary.workerIncident, recordPaymentRefundObservations: vi.fn(),
}));

import { getOrderConfirmationBySession, getOrdersForCurrentUser, reconcileCheckoutSession, cancelPendingCheckoutFromCookie } from "@/lib/orders/server";
import { CHECKOUT_CANCEL_COOKIE } from "@/lib/orders/checkout-cancel";
import { checkoutPaymentFixture } from "@/tests/fixtures/checkout-payment-verification";
import { runPaymentWorker } from "@/lib/payments/worker";

const orderId = "00000000-0000-4000-8000-000000000410";
const cartId = "00000000-0000-4000-8000-000000000411";
const sessionId = "cs_test_private_receipt";
const accountUserId = "00000000-0000-4000-8000-000000000412";
const order = {
  id: orderId, cart_id: cartId, user_id: accountUserId,
  order_number: "HX-410", status: "pending_payment", checkout_environment: "sandbox",
  stripe_checkout_session_id: sessionId, stripe_payment_intent_id: "pi_private",
  stripe_customer_id: "cus_private", customer_email: "owner@example.test",
  merchandise_subtotal_cents: 2500, discount_cents: 0, shipping_cents: 700,
  tax_cents: 0, total_cents: 3200, currency: "USD", metadata: { private_token: "must-not-leak" },
  reward_points_earned: 0, reward_points_redeemed: 0, reward_discount_cents: 0,
  shipping_name: null, shipping_address: {}, billing_address: {},
  created_at: "2026-09-18T12:00:00.000Z", paid_at: null,
};

function result(data: unknown, error: { message: string } | null = null) {
  const response = { data, error };
  const query = {
    select: vi.fn(() => query), eq: vi.fn(() => query), neq: vi.fn(() => query),
    is: vi.fn(() => query), update: vi.fn((value: unknown) => { void value; return query; }), insert: vi.fn(() => query),
    upsert: vi.fn(() => query), limit: vi.fn(() => query),
    maybeSingle: vi.fn(async () => response), single: vi.fn(async () => response),
    order: vi.fn(() => query),
    then: (resolve: (value: typeof response) => unknown) => Promise.resolve(response).then(resolve),
  };
  return query;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("CHECKOUT_ENABLED", "false");
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_order_verification");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_order_verification");
  vi.stubEnv("STRIPE_ACCOUNT_ID", "acct_1Tm9WRFEzyaKzdmq");
  boundary.identity.mockResolvedValue({ id: accountUserId, email: "owner@example.test" });
  boundary.authorizeReceipt.mockResolvedValue(true);
  boundary.getException.mockResolvedValue(null);
  boundary.isLegacyOrder.mockResolvedValue(false);
  boundary.verifiedDelivery.mockResolvedValue(null);
  boundary.recordException.mockResolvedValue(undefined);
  boundary.resolveExceptions.mockResolvedValue(undefined);
  boundary.cookieGet.mockReturnValue(undefined);
  boundary.workerRun.mockResolvedValue({ token: "worker-run" });
  boundary.workerClaim.mockResolvedValue([]);
  boundary.workerFinish.mockResolvedValue(true);
  boundary.workerHeartbeat.mockResolvedValue(true);
  boundary.workerIncident.mockResolvedValue(true);
  boundary.from.mockImplementation((table: string) => {
    if (table === "orders") return result(order);
    if (table === "order_items") return result([]);
    throw new Error(`Unexpected table ${table}`);
  });
  boundary.rpc.mockImplementation((name: string) => {
    if (name === "resolve_active_cart") return result([]);
    if (name === "claim_checkout_refresh") return result({ allowed: false, token: null, cached: null, retry_after_seconds: 5 });
    throw new Error(`Unexpected operation ${name}`);
  });
});
afterEach(() => vi.unstubAllEnvs());

describe("truthful private account Order history", () => {
  it("marks an unresolved refund exception without rewriting the historical refunded status", async () => {
    const historical = { id: orderId, order_number: "HX-410", status: "refunded", total_cents: 3200,
      reward_points_earned: 32, reward_points_redeemed: 0, created_at: "2026-09-18T12:00:00Z" };
    const query = result([historical]);
    boundary.from.mockReturnValue(query);
    boundary.rpc.mockReturnValue(result([orderId]));
    await expect(getOrdersForCurrentUser()).resolves.toEqual([{ ...historical, verification_required: true }]);
    expect(query.eq).toHaveBeenCalledWith("user_id", accountUserId);
    expect(boundary.rpc).toHaveBeenCalledExactlyOnceWith("read_account_order_payment_exceptions", {
      p_user_id: accountUserId, p_order_ids: [orderId],
    });
    expect(boundary.retrieveBundle).not.toHaveBeenCalled();
    expect(boundary.getException).not.toHaveBeenCalled();
  });
  it("retains ordinary historical statuses with one batch read and exposes no exception details", async () => {
    const statuses = ["pending_payment", "paid", "payment_failed", "cancelled", "refunded"];
    const rows = statuses.map((status, index) => ({ id: `00000000-0000-4000-8000-00000000050${index}`,
      order_number: `HX-${index}`, status, total_cents: 3200, reward_points_earned: 32,
      reward_points_redeemed: 0, created_at: "2026-09-18T12:00:00Z" }));
    boundary.from.mockReturnValue(result(rows));
    boundary.rpc.mockReturnValue(result([]));
    await expect(getOrdersForCurrentUser()).resolves.toEqual(rows.map((row) => ({ ...row, verification_required: false })));
    expect(boundary.rpc).toHaveBeenCalledOnce();
    expect(boundary.getException).not.toHaveBeenCalled();
  });
  it.each([null, {}, ["00000000-0000-4000-8000-000000000499"], [orderId, orderId], [{ id: orderId, private_payload: "secret" }]])(
    "fails closed for malformed or unrequested exception IDs %j", async (exceptionIds) => {
      boundary.from.mockReturnValue(result([order]));
      boundary.rpc.mockReturnValue(result(exceptionIds));
      await expect(getOrdersForCurrentUser()).rejects.toThrow("Failed to verify account payment state");
    },
  );
  it("fails closed when exception storage is unavailable instead of claiming a completed refund", async () => {
    boundary.from.mockReturnValue(result([{ ...order, status: "refunded" }]));
    boundary.rpc.mockReturnValue(result(null, { message: "private exception payload" }));
    await expect(getOrdersForCurrentUser()).rejects.toThrow("Failed to verify account payment state");
    boundary.rpc.mockRejectedValue(new Error("private exception payload"));
    await expect(getOrdersForCurrentUser()).rejects.toThrow("Failed to verify account payment state");
  });
  it("does not read private history for a guest or issue an empty exception batch", async () => {
    boundary.identity.mockResolvedValue(null);
    await expect(getOrdersForCurrentUser()).resolves.toEqual([]);
    expect(boundary.from).not.toHaveBeenCalled(); expect(boundary.rpc).not.toHaveBeenCalled();
    boundary.identity.mockResolvedValue({ id: accountUserId });
    boundary.from.mockReturnValue(result([]));
    await expect(getOrdersForCurrentUser()).resolves.toEqual([]);
    expect(boundary.rpc).not.toHaveBeenCalled();
  });
});

describe("private verified Order confirmation", () => {
  it("returns only receipt display fields to the owning account while refresh is deferred", async () => {
    const confirmation = await getOrderConfirmationBySession(sessionId);
    expect(confirmation).toMatchObject({ state: "pending", order: { order_number: "HX-410", total_cents: 3200 } });
    expect(confirmation?.order).not.toHaveProperty("id");
    expect(confirmation?.order).not.toHaveProperty("stripe_checkout_session_id");
    expect(confirmation?.order).not.toHaveProperty("stripe_payment_intent_id");
    expect(confirmation?.order).not.toHaveProperty("user_id");
    expect(confirmation?.order).not.toHaveProperty("metadata");
    expect(boundary.retrieveBundle).not.toHaveBeenCalled();
    expect(boundary.retrieveSession).not.toHaveBeenCalled();
  });
  it("keeps a guest receipt readable after cart clearing and signing in", async () => {
    boundary.from.mockImplementation((table: string) => {
      if (table === "orders") return result({ ...order, user_id: null });
      if (table === "order_items") return result([]);
      throw new Error(`Unexpected table ${table}`);
    });
    boundary.identity.mockResolvedValue({ id: "new-account", email: "owner@example.test" });
    await expect(getOrderConfirmationBySession(sessionId)).resolves.toMatchObject({ state: "pending", order: { order_number: "HX-410" } });
    expect(boundary.authorizeReceipt).toHaveBeenCalledWith({ orderId, sessionId,
      accountId: "acct_1Tm9WRFEzyaKzdmq", verifiedUserId: "new-account" });
    expect(boundary.rpc.mock.calls.some(([name]) => name === "resolve_active_cart")).toBe(false);
  });
  it("reveals nothing and performs no provider work for a rejected receipt", async () => {
    boundary.authorizeReceipt.mockResolvedValue(false);
    await expect(getOrderConfirmationBySession(sessionId)).resolves.toBeNull();
    expect(boundary.retrieveBundle).not.toHaveBeenCalled();
    expect(boundary.retrieveSession).not.toHaveBeenCalled();
    expect(boundary.rpc).not.toHaveBeenCalled();
    expect(boundary.loadContract).not.toHaveBeenCalled();
    expect(boundary.from).toHaveBeenCalledTimes(1);
    expect(boundary.from.mock.results[0].value.select).toHaveBeenCalledWith("id");
  });
  it("does not use trusted background discovery for an unknown browser Session", async () => {
    boundary.from.mockImplementation((table: string) => {
      if (table === "orders") return result(null);
      throw new Error(`Unexpected table ${table}`);
    });
    await expect(getOrderConfirmationBySession(sessionId)).resolves.toBeNull();
    expect(boundary.retrieveBundle).not.toHaveBeenCalled();
    expect(boundary.retrieveSession).not.toHaveBeenCalled();
    expect(boundary.authorizeReceipt).not.toHaveBeenCalled();
    expect(boundary.isLegacyOrder).not.toHaveBeenCalled();
    expect(boundary.rpc).not.toHaveBeenCalled();
  });

  it("does not reveal a known Session when receipt access is denied and provider configuration is invalid", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "invalid-provider-configuration");
    boundary.authorizeReceipt.mockResolvedValue(false);
    await expect(getOrderConfirmationBySession(sessionId)).resolves.toBeNull();
    expect(boundary.retrieveBundle).not.toHaveBeenCalled();
    expect(boundary.retrieveSession).not.toHaveBeenCalled();
    expect(boundary.rpc).not.toHaveBeenCalled();
    expect(boundary.loadContract).not.toHaveBeenCalled();
  });

  it("describes an unresolved provider refund without exposing its private exception record", async () => {
    boundary.getException.mockResolvedValue({ code: "full_refund_reconciliation_failed", paymentStatus: "refunded",
      paymentIntentId: "pi_private_refund", amountCents: 3200 });
    const confirmation = await getOrderConfirmationBySession(sessionId);
    expect(confirmation).toMatchObject({ state: "exception", verificationIssue: "refund_reconciliation" });
    expect(confirmation).not.toHaveProperty("exception");
    expect(JSON.stringify(confirmation)).not.toContain("pi_private_refund");
    expect(JSON.stringify(confirmation)).not.toContain("full_refund_reconciliation_failed");
    expect(boundary.retrieveBundle).not.toHaveBeenCalled();
    expect(boundary.finalizePayment).not.toHaveBeenCalled();
  });

});

function paidFixture() {
  const fixture = checkoutPaymentFixture();
  fixture.accepted.orderId = orderId;
  fixture.accepted.sessionId = sessionId;
  fixture.provider.session.id = sessionId;
  fixture.provider.session.client_reference_id = orderId;
  fixture.provider.session.metadata = { ...fixture.provider.session.metadata, order_id: orderId };
  (fixture.provider.session.payment_intent as Stripe.PaymentIntent).metadata.order_id = orderId;
  const pendingOrder = { ...order, user_id: null, merchandise_subtotal_cents: 5000,
    shipping_cents: 500, total_cents: 5500, stripe_customer_id: "cus_1", stripe_payment_intent_id: "pi_1" };
  const paidOrder = { ...pendingOrder, status: "paid", paid_at: "2026-09-18T12:01:00.000Z" };
  boundary.from.mockImplementation((table: string) => {
    if (table === "orders") return result(pendingOrder);
    if (table === "order_items") return result([]);
    if (table === "payment_attempts") return result({ metadata: {} });
    throw new Error(`Unexpected table ${table}`);
  });
  boundary.rpc.mockImplementation((name: string) => {
    if (name === "qualify_referral_for_paid_order" || name === "clear_paid_order_cart") return result(true);
    throw new Error(`Unexpected operation ${name}`);
  });
  boundary.loadContract.mockResolvedValue(fixture.accepted);
  boundary.retrieveBundle.mockResolvedValue(fixture.provider);
  boundary.finalizePayment.mockResolvedValue(paidOrder);
  return { ...fixture, pendingOrder, paidOrder };
}

describe("trusted payment reconciliation", () => {
  it("recovers an early completion after attachment without requiring the browser return", async () => {
    const fixture = paidFixture();
    boundary.authorizeReceipt.mockResolvedValue(false);
    const envelope = { accountId: "acct_1Tm9WRFEzyaKzdmq", environment: "sandbox", eventId: "evt_early",
      eventType: "checkout.session.completed", objectKind: "checkout.session", objectId: sessionId,
      apiVersion: "2026-06-24.dahlia", createdAt: "2026-09-19T01:00:00Z", chargeId: null, paymentIntentId: null };
    const claim = { id: "inbox-early", version: 2, attempts: 1, lifetimeAttempts: 1, leaseToken: "lease-1", envelope };
    boundary.workerClaim.mockResolvedValueOnce([claim]);
    const from = boundary.from.getMockImplementation()!;
    boundary.from.mockImplementation((table: string) => table === "orders" ? result(null) : from(table));
    await expect(runPaymentWorker()).resolves.toMatchObject({ retried: 1, processed: 0 });
    expect(boundary.workerFinish).toHaveBeenLastCalledWith(expect.objectContaining({ disposition: "pending", code: "binding_pending" }));
    expect(boundary.finalizePayment).not.toHaveBeenCalled();

    boundary.from.mockImplementation(from);
    boundary.workerClaim.mockResolvedValueOnce([{ ...claim, version: 3, attempts: 2, lifetimeAttempts: 2, leaseToken: "lease-2" }]);
    await expect(runPaymentWorker()).resolves.toMatchObject({ processed: 1, retried: 0 });
    expect(boundary.finalizePayment).toHaveBeenCalledWith(expect.objectContaining({ accepted: fixture.accepted }));
    expect(boundary.authorizeReceipt).not.toHaveBeenCalled();
    expect(boundary.identity).not.toHaveBeenCalled();
  });
  it("retries the same accepted payment identity after settlement commits before inbox completion", async () => {
    paidFixture();
    const claim = { id: "inbox-crash", version: 2, attempts: 1, lifetimeAttempts: 1, leaseToken: "lease-before-crash",
      envelope: { accountId: "acct_1Tm9WRFEzyaKzdmq", environment: "sandbox", eventId: "evt_delayed_failure",
        eventType: "checkout.session.async_payment_failed", objectKind: "checkout.session", objectId: sessionId,
        apiVersion: "2026-06-24.dahlia", createdAt: "2026-09-18T01:00:00Z", chargeId: null, paymentIntentId: null } };
    boundary.workerClaim.mockResolvedValueOnce([claim]);
    boundary.workerFinish.mockRejectedValueOnce(new Error("crashed after financial commit"));
    await expect(runPaymentWorker()).rejects.toThrow("durable reconciliation");
    expect(boundary.finalizePayment).toHaveBeenCalledOnce();
    expect(boundary.workerIncident).toHaveBeenCalledWith(expect.objectContaining({ code: "storage_unavailable" }));

    boundary.workerClaim.mockResolvedValueOnce([{ ...claim, version: 3, attempts: 2, lifetimeAttempts: 2, leaseToken: "lease-after-crash" }]);
    await expect(runPaymentWorker()).resolves.toMatchObject({ processed: 1 });
    expect(boundary.finalizePayment).toHaveBeenCalledTimes(2);
    expect(boundary.finalizePayment.mock.calls[1]).toEqual(boundary.finalizePayment.mock.calls[0]);
    expect(boundary.rpc.mock.calls.filter(([name]) => name === "clear_paid_order_cart"))
      .toEqual([["clear_paid_order_cart", { p_order_id: orderId }], ["clear_paid_order_cart", { p_order_id: orderId }]]);
    expect(boundary.workerFinish).toHaveBeenLastCalledWith(expect.objectContaining({ disposition: "processed", leaseToken: "lease-after-crash" }));
    expect(boundary.rpc.mock.calls.some(([name]) => name === "fail_checkout_order_from_stripe")).toBe(false);
  });
  it("returns a durable pending outcome when completion arrives before Session attachment", async () => {
    paidFixture();
    boundary.from.mockReturnValue(result(null));
    await expect(reconcileCheckoutSession(sessionId)).resolves.toMatchObject({
      disposition: "pending", code: "binding_pending", order: null,
    });
    expect(boundary.finalizePayment).not.toHaveBeenCalled();
  });
  it("ignores only a currently verified Session explicitly belonging to another application", async () => {
    const { provider } = paidFixture();
    boundary.from.mockReturnValue(result(null));
    provider.session.client_reference_id = null;
    provider.session.metadata = { application: "other-store" };
    await expect(reconcileCheckoutSession(sessionId)).resolves.toMatchObject({ disposition: "pending", code: "binding_pending" });
    (provider.session.payment_intent as Stripe.PaymentIntent).metadata = { application: "other-store" };
    await expect(reconcileCheckoutSession(sessionId)).resolves.toMatchObject({ disposition: "ignored", order: null });
    expect(boundary.finalizePayment).not.toHaveBeenCalled();
    provider.session.metadata = {};
    await expect(reconcileCheckoutSession(sessionId)).resolves.toMatchObject({ disposition: "pending", code: "binding_pending" });
    provider.session.metadata = { application: "other-store", order_id: orderId };
    await expect(reconcileCheckoutSession(sessionId)).resolves.toMatchObject({ disposition: "pending", code: "binding_pending" });
  });
  it("settles a fully verified guest payment without browser access and preserves separate addresses", async () => {
    paidFixture();
    boundary.authorizeReceipt.mockResolvedValue(false);
    boundary.identity.mockResolvedValue(null);
    await expect(reconcileCheckoutSession(sessionId)).resolves.toMatchObject({ disposition: "processed", order: { status: "paid", total_cents: 5500 } });
    expect(boundary.authorizeReceipt).not.toHaveBeenCalled();
    expect(boundary.identity).not.toHaveBeenCalled();
    expect(boundary.finalizePayment).toHaveBeenCalledWith(expect.objectContaining({
      facts: expect.objectContaining({ orderId, sessionId, totalCents: 5500,
        shippingName: "Shipping Recipient",
        shippingAddress: expect.objectContaining({ line1: "10 Shipping Lane", city: "Los Angeles" }),
        billingAddress: expect.objectContaining({ line1: "20 Billing Road", city: "Austin" }),
      }), rewardPointsEarned: 0,
    }));
    expect(boundary.rpc).toHaveBeenCalledWith("clear_paid_order_cart", { p_order_id: orderId });
    expect(boundary.recordException).not.toHaveBeenCalled();
  });
  it("quarantines a paid Session with different Order Lines without granting any benefit", async () => {
    const { provider } = paidFixture();
    provider.lineItems[0].quantity = 3;
    await expect(reconcileCheckoutSession(sessionId)).resolves.toMatchObject({ disposition: "quarantined", order: { status: "pending_payment" } });
    expect(boundary.recordException).toHaveBeenCalledWith({
      orderId, attemptId: "attempt-1", sessionId, code: "line_items_mismatch",
      paymentIntentId: "pi_1", paymentStatus: "paid", amountCents: 5500,
    });
    expect(boundary.finalizePayment).not.toHaveBeenCalled();
    expect(boundary.rpc).not.toHaveBeenCalled();
    expect(boundary.resolveExceptions).not.toHaveBeenCalled();
  });

  it("propagates exception-storage failure so a mismatched payment remains retryable", async () => {
    const { provider } = paidFixture();
    provider.lineItems[0].quantity = 3;
    boundary.recordException.mockRejectedValue(new Error("exception storage unavailable"));
    await expect(reconcileCheckoutSession(sessionId)).rejects.toThrow("exception storage unavailable");
    expect(boundary.finalizePayment).not.toHaveBeenCalled();
    expect(boundary.rpc).not.toHaveBeenCalled();
  });

  it("does not perform settlement effects when paid finalization loses its Session binding", async () => {
    paidFixture();
    boundary.finalizePayment.mockResolvedValue(null);
    await expect(reconcileCheckoutSession(sessionId)).rejects.toThrow("lost its accepted Order binding");
    expect(boundary.recordException).toHaveBeenCalledWith(expect.objectContaining({
      orderId, sessionId, code: "finalization_failed", paymentStatus: "paid", amountCents: 5500,
    }));
    expect(boundary.rpc).not.toHaveBeenCalled();
    expect(boundary.resolveExceptions).not.toHaveBeenCalled();
  });

  it("keeps provider-complete but unpaid payment pending with no settlement effects", async () => {
    const { provider } = paidFixture();
    provider.session.payment_status = "unpaid";
    (provider.session.payment_intent as Stripe.PaymentIntent).status = "processing";
    await expect(reconcileCheckoutSession(sessionId)).resolves.toMatchObject({ disposition: "pending", order: { status: "pending_payment" } });
    expect(boundary.finalizePayment).not.toHaveBeenCalled();
    expect(boundary.rpc).not.toHaveBeenCalled();
    expect(boundary.resolveExceptions).not.toHaveBeenCalled();
  });

  it("propagates a failed processing-state write instead of acknowledging reconciliation", async () => {
    const { provider } = paidFixture();
    provider.session.payment_status = "unpaid";
    (provider.session.payment_intent as Stripe.PaymentIntent).status = "processing";
    const from = boundary.from.getMockImplementation()!;
    boundary.from.mockImplementation((table: string) => {
      if (table !== "payment_attempts") return from(table);
      const query = result({ metadata: {} });
      query.update.mockReturnValue(result(null, { message: "database unavailable" }));
      return query;
    });
    await expect(reconcileCheckoutSession(sessionId)).rejects.toThrow("Failed to record payment processing");
    expect(boundary.finalizePayment).not.toHaveBeenCalled();
    expect(boundary.rpc).not.toHaveBeenCalled();
  });

  it("retains an unresolved exception until failed settlement effects succeed on retry", async () => {
    paidFixture();
    let clearAttempts = 0;
    boundary.rpc.mockImplementation((name: string) => {
      if (name === "qualify_referral_for_paid_order") return result(true);
      if (name === "clear_paid_order_cart") {
        clearAttempts += 1;
        return clearAttempts === 1 ? result(null, { message: "temporary cart write failure" }) : result(true);
      }
      throw new Error(`Unexpected operation ${name}`);
    });
    await expect(reconcileCheckoutSession(sessionId)).rejects.toThrow("Failed to clear paid cart items");
    expect(boundary.recordException).toHaveBeenCalledWith(expect.objectContaining({
      code: "side_effects_failed", paymentStatus: "paid", paymentIntentId: "pi_1", amountCents: 5500,
    }));
    expect(boundary.resolveExceptions).not.toHaveBeenCalled();
    await expect(reconcileCheckoutSession(sessionId)).resolves.toMatchObject({ disposition: "processed", order: { status: "paid" } });
    expect(boundary.resolveExceptions).toHaveBeenCalledWith({ orderId, sessionId });
  });

  it("does not finalize a paid refresh after its shared lease has been replaced", async () => {
    const { provider } = paidFixture();
    provider.session.expires_at = Math.floor(Date.now() / 1000) + 1800;
    provider.session.url = null;
    boundary.rpc.mockImplementation((name: string) => {
      if (name === "claim_checkout_refresh") return result({ allowed: true,
        token: "00000000-0000-4000-8000-000000000413", cached: null, retry_after_seconds: 0 });
      if (name === "finish_checkout_refresh") return result(false);
      throw new Error(`Unexpected operation ${name}`);
    });
    await expect(getOrderConfirmationBySession(sessionId)).resolves.toMatchObject({ state: "pending" });
    expect(boundary.retrieveBundle).toHaveBeenCalledOnce();
    expect(boundary.finalizePayment).not.toHaveBeenCalled();
    expect(boundary.loadContract).not.toHaveBeenCalled();
    expect(boundary.recordException).not.toHaveBeenCalled();
  });

  it("withholds receipt details if access changes during provider reconciliation", async () => {
    const { provider } = paidFixture();
    provider.session.expires_at = Math.floor(Date.now() / 1000) + 1800;
    provider.session.url = null;
    provider.session.payment_status = "unpaid";
    (provider.session.payment_intent as Stripe.PaymentIntent).status = "processing";
    boundary.authorizeReceipt.mockResolvedValueOnce(true).mockResolvedValue(false);
    boundary.rpc.mockImplementation((name: string) => {
      if (name === "claim_checkout_refresh") return result({ allowed: true,
        token: "00000000-0000-4000-8000-000000000413", cached: null, retry_after_seconds: 0 });
      if (name === "finish_checkout_refresh") return result(true);
      throw new Error(`Unexpected operation ${name}`);
    });
    await expect(getOrderConfirmationBySession(sessionId)).resolves.toBeNull();
    expect(boundary.retrieveBundle).toHaveBeenCalledOnce();
    expect(boundary.finalizePayment).not.toHaveBeenCalled();
  });
});


describe("verified cancellation outcome", () => {
  it("does not report payment success or clear cancellation capability for a mismatched paid Session", async () => {
    const { provider } = paidFixture();
    provider.session.expires_at = Math.floor(Date.now() / 1000) + 1800;
    provider.session.url = null;
    provider.lineItems[0].quantity = 3;
    boundary.cookieGet.mockImplementation((name: string) => name === CHECKOUT_CANCEL_COOKIE ? { value: orderId } : undefined);
    boundary.rpc.mockImplementation((name: string) => {
      if (name === "claim_checkout_refresh") return result({ allowed: true,
        token: "00000000-0000-4000-8000-000000000413", cached: null, retry_after_seconds: 0 });
      if (name === "finish_checkout_refresh") return result(true);
      throw new Error(`Unexpected operation ${name}`);
    });
    await expect(cancelPendingCheckoutFromCookie()).resolves.toEqual({ status: "processing" });
    expect(boundary.recordException).toHaveBeenCalledWith(expect.objectContaining({ code: "line_items_mismatch" }));
    expect(boundary.finalizePayment).not.toHaveBeenCalled();
    expect(boundary.cookieSet).not.toHaveBeenCalled();
  });

});


describe("owned paid receipt", () => {
  it.each(["paid", "refunded"] as const)("renders only current %s display fields and the physical shipping address", async (currentStatus) => {
    const { provider, pendingOrder, paidOrder } = paidFixture();
    provider.session.expires_at = Math.floor(Date.now() / 1000) + 1800;
    provider.session.url = null;
    let storedOrder: Record<string, unknown> = pendingOrder;
    boundary.from.mockImplementation((table: string) => {
      if (table === "orders") return result(storedOrder);
      if (table === "order_items") return result([{ id: "private-line-id", product_id: "private-product-id",
        product_name: "Super Serum", variant_label: "30 mL", quantity: 2, line_subtotal_cents: 5000,
        product_snapshot: { internal: "private snapshot" },
      }]);
      throw new Error(`Unexpected table ${table}`);
    });
    boundary.finalizePayment.mockImplementation(async ({ facts }: { facts: VerifiedCheckoutPaymentFacts }) => {
      storedOrder = { ...paidOrder, shipping_name: facts.shippingName,
        shipping_address: facts.shippingAddress, billing_address: facts.billingAddress };
      boundary.verifiedDelivery.mockResolvedValue({ shippingName: facts.shippingName,
        shippingAddress: facts.shippingAddress, billingAddress: facts.billingAddress });
      return storedOrder;
    });
    boundary.rpc.mockImplementation((name: string) => {
      if (name === "claim_checkout_refresh") return result({ allowed: true,
        token: "00000000-0000-4000-8000-000000000413", cached: null, retry_after_seconds: 0 });
      if (name === "clear_paid_order_cart") {
        // A concurrent trusted refund can complete after paid finalization.
        storedOrder = { ...storedOrder, status: currentStatus };
        return result(true);
      }
      if (["finish_checkout_refresh", "qualify_referral_for_paid_order"].includes(name)) return result(true);
      throw new Error(`Unexpected operation ${name}`);
    });
    await expect(getOrderConfirmationBySession(sessionId)).resolves.toEqual({
      state: currentStatus, verificationIssue: null, notice: expect.any(String), retryAfterSeconds: 5,
      order: { order_number: "HX-410", status: currentStatus, reward_points_earned: 0, reward_points_redeemed: 0,
        merchandise_subtotal_cents: 5000, discount_cents: 0, shipping_cents: 500, tax_cents: 0, total_cents: 5500 },
      items: [{ product_name: "Super Serum", variant_label: "30 mL", quantity: 2, line_subtotal_cents: 5000 }],
      shipping: { name: "Shipping Recipient", line1: "10 Shipping Lane", line2: null,
        city: "Los Angeles", state: "CA", postal_code: "90001", country: "US" },
    });
  });
});


describe("legacy Session binding recovery", () => {
  it("retains an authenticated legacy payment with a missing binding as an operator exception", async () => {
    const { pendingOrder } = paidFixture();
    const legacyOrder = { ...pendingOrder, stripe_checkout_session_id: null };
    let orderReads = 0;
    boundary.from.mockImplementation((table: string) => {
      if (table === "orders") return result(orderReads++ === 0 ? null : legacyOrder);
      throw new Error(`Unexpected table ${table}`);
    });
    boundary.isLegacyOrder.mockResolvedValue(true);
    boundary.loadContract.mockResolvedValue(null);
    await expect(reconcileCheckoutSession(sessionId)).resolves.toMatchObject({ disposition: "quarantined", order: { id: orderId, status: "pending_payment" } });
    expect(boundary.recordException).toHaveBeenCalledWith({
      orderId, attemptId: null, sessionId, code: "missing_contract",
      paymentIntentId: "pi_1", paymentStatus: "paid", amountCents: 5500,
    });
    expect(boundary.finalizePayment).not.toHaveBeenCalled();
    expect(boundary.rpc).not.toHaveBeenCalled();
    expect(boundary.authorizeReceipt).not.toHaveBeenCalled();
  });
  it("does not acknowledge an unbound Session for a locally unproven legacy Order", async () => {
    paidFixture();
    boundary.from.mockImplementation((table: string) => {
      if (table === "orders") return result(null);
      throw new Error(`Unexpected table ${table}`);
    });
    boundary.isLegacyOrder.mockResolvedValue(false);
    await expect(reconcileCheckoutSession(sessionId)).resolves.toMatchObject({ disposition: "pending", code: "binding_pending" });
    expect(boundary.retrieveBundle).toHaveBeenCalledWith({ sessionId });
    expect(boundary.recordException).not.toHaveBeenCalled();
    expect(boundary.finalizePayment).not.toHaveBeenCalled();
    expect(boundary.rpc).not.toHaveBeenCalled();
  });

  it.each(["order", "environment"])("rejects an unbound Session whose provider %s metadata contradicts the Order reference", async (field) => {
    const { provider } = paidFixture();
    provider.session.metadata = { ...provider.session.metadata,
      ...(field === "order" ? { order_id: "00000000-0000-4000-8000-000000000499" } : { environment: "live" }),
    };
    boundary.from.mockImplementation((table: string) => {
      if (table === "orders") return result(null);
      throw new Error(`Unexpected table ${table}`);
    });
    boundary.isLegacyOrder.mockResolvedValue(true);
    await expect(reconcileCheckoutSession(sessionId)).resolves.toMatchObject({ disposition: "pending", code: "binding_pending" });
    expect(boundary.isLegacyOrder).not.toHaveBeenCalled();
    expect(boundary.recordException).not.toHaveBeenCalled();
    expect(boundary.finalizePayment).not.toHaveBeenCalled();
    expect(boundary.rpc).not.toHaveBeenCalled();
  });

});


describe("verified legacy delivery", () => {
  it("retains physical delivery verified for an old paid Order when later provider refresh is deferred", async () => {
    const { provider, accepted, paidOrder } = paidFixture();
    accepted.version = "checkout_v1";
    accepted.legacyEligible = true;
    accepted.attemptId = null;
    provider.session.metadata = { order_id: orderId, schema: "checkout_v1", environment: "sandbox" };
    (provider.session.payment_intent as Stripe.PaymentIntent).metadata = { ...provider.session.metadata };
    provider.session.expires_at = Math.floor(Date.now() / 1000) + 1800;
    provider.session.url = null;
    const legacyOrder = { ...paidOrder, shipping_name: "Billing Customer",
      shipping_address: { ...provider.session.customer_details!.address! },
      billing_address: { ...provider.session.customer_details!.address! } };
    let delivery: Pick<VerifiedCheckoutPaymentFacts, "shippingName" | "shippingAddress" | "billingAddress"> | null = null;
    boundary.from.mockImplementation((table: string) => {
      if (table === "orders") return result(legacyOrder);
      if (table === "order_items") return result([]);
      throw new Error(`Unexpected table ${table}`);
    });
    boundary.finalizePayment.mockImplementation(async ({ facts }: { facts: VerifiedCheckoutPaymentFacts }) => {
      delivery = { shippingName: facts.shippingName, shippingAddress: facts.shippingAddress, billingAddress: facts.billingAddress };
      return legacyOrder;
    });
    boundary.verifiedDelivery.mockImplementation(async () => delivery);
    let refreshes = 0;
    boundary.rpc.mockImplementation((name: string) => {
      if (name === "claim_checkout_refresh") {
        refreshes += 1;
        return result(refreshes === 1 ? { allowed: true,
          token: "00000000-0000-4000-8000-000000000413", cached: null, retry_after_seconds: 0 }
          : { allowed: false, token: null, cached: null, retry_after_seconds: 5 });
      }
      if (["finish_checkout_refresh", "qualify_referral_for_paid_order", "clear_paid_order_cart"].includes(name)) return result(true);
      throw new Error(`Unexpected operation ${name}`);
    });
    const expectedReceipt = { state: "paid", shipping: {
      name: "Shipping Recipient", line1: "10 Shipping Lane", city: "Los Angeles", state: "CA", postal_code: "90001",
    } };
    await expect(getOrderConfirmationBySession(sessionId)).resolves.toMatchObject(expectedReceipt);
    await expect(getOrderConfirmationBySession(sessionId)).resolves.toMatchObject(expectedReceipt);
    expect(boundary.retrieveBundle).toHaveBeenCalledOnce();
    expect(boundary.finalizePayment).toHaveBeenCalledOnce();
    expect(legacyOrder.shipping_address.line1).toBe("20 Billing Road");
    expect(legacyOrder.shipping_name).toBe("Billing Customer");
    expect(boundary.recordException).not.toHaveBeenCalled();
  });
  it("omits unverified historical shipping when no immutable delivery facts are available", async () => {
    boundary.from.mockImplementation((table: string) => {
      if (table === "orders") return result({ ...order, status: "paid", shipping_name: "Billing Customer",
        shipping_address: { line1: "20 Billing Road", line2: null, city: "Austin", state: "TX", postal_code: "78701", country: "US" } });
      if (table === "order_items") return result([]);
      throw new Error(`Unexpected table ${table}`);
    });
    await expect(getOrderConfirmationBySession(sessionId)).resolves.toMatchObject({ state: "paid", shipping: null });
    expect(boundary.retrieveBundle).not.toHaveBeenCalled();
    expect(boundary.finalizePayment).not.toHaveBeenCalled();
  });

});
