import { beforeEach, describe, expect, it, vi } from "vitest";
const storage = vi.hoisted(() => ({ rpc: vi.fn(), maybeSingle: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({ rpc: storage.rpc }) }));
import {
  bindCheckoutPaymentSession, CheckoutPaymentStorageError, finalizeVerifiedCheckoutPayment,
  getCheckoutPaymentException, isLegacyCheckoutOrder, readVerifiedCheckoutDelivery, loadCheckoutPaymentContract, prepareCheckoutPaymentContract,
  recordCheckoutPaymentException, resolveCheckoutPaymentExceptions, type CheckoutContractTerms,
} from "@/lib/orders/payment-contracts";
import type { AcceptedCheckoutContract, VerifiedCheckoutPaymentFacts } from "@/lib/checkout/payment-verification";

const accepted: AcceptedCheckoutContract = {
  version: "checkout_v2", legacyEligible: false, orderId: "order-a", attemptId: "attempt-a", sessionId: "cs_test_a",
  accountId: "acct_1Tm9WRFEzyaKzdmq", apiVersion: "2026-06-24.dahlia", environment: "sandbox", currency: "USD",
  customerId: null, lines: [{ productId: "product-a", productSlug: "serum", variantKey: "30ml", quantity: 1, unitAmountCents: 2500 }],
  merchandiseSubtotalCents: 2500, discountCents: 0, shippingCents: 500, preTaxTotalCents: 3000,
  couponId: null, shippingRateId: "shr_test", freeShipping: false, automaticTaxEnabled: false, taxBehavior: "unspecified",
};
const facts: VerifiedCheckoutPaymentFacts = {
  orderId: accepted.orderId, attemptId: accepted.attemptId, sessionId: accepted.sessionId, contractVersion: accepted.version,
  paymentIntentId: "pi_test", customerId: null, customerEmail: null, paymentMethodType: "card", currency: "USD", merchandiseSubtotalCents: 2500,
  discountCents: 0, shippingCents: 500, taxCents: 0, totalCents: 3000, shippingName: "Test Recipient",
  shippingAddress: { line1: "1 Test St", line2: null, city: "Test", state: "CA", postal_code: "90001", country: "US" },
  billingAddress: null, taxBreakdown: [],
};
const exception = { code: "amount_mismatch" as const, paymentStatus: "paid" as const, paymentIntentId: "pi_test", amountCents: 3001 };
beforeEach(() => { vi.resetAllMocks(); storage.rpc.mockResolvedValue({ data: null, error: null }); });

describe("immutable checkout payment storage", () => {
  it("loads separately verified delivery after authorization without rewriting Order history", async () => {
    const delivery = { shippingName: facts.shippingName, shippingAddress: facts.shippingAddress,
      billingAddress: { ...facts.shippingAddress, line1: "9 Separate Billing St" } };
    storage.rpc.mockResolvedValue({ data: delivery, error: null });
    await expect(readVerifiedCheckoutDelivery({ orderId: "order-a", sessionId: "cs_test_a" })).resolves.toEqual(delivery);
    expect(storage.rpc).toHaveBeenCalledWith("read_verified_checkout_delivery", { p_order_id: "order-a", p_session_id: "cs_test_a" });
  });
  it("does not manufacture verified shipping from an absent proof", async () => {
    await expect(readVerifiedCheckoutDelivery({ orderId: "order-a", sessionId: "cs_test_a" })).resolves.toBeNull();
  });
  it("rejects incomplete verified physical delivery and redacts storage failures", async () => {
    storage.rpc.mockResolvedValueOnce({ data: { shippingName: "Name", shippingAddress: null, billingAddress: null }, error: null });
    await expect(readVerifiedCheckoutDelivery({ orderId: "order-a", sessionId: "cs_test_a" })).rejects.toBeInstanceOf(CheckoutPaymentStorageError);
    storage.rpc.mockResolvedValueOnce({ data: null, error: { message: "PII address payload" } });
    await expect(readVerifiedCheckoutDelivery({ orderId: "order-a", sessionId: "cs_test_a" })).rejects.toThrow("Payment verification is temporarily unavailable.");
  });
  it("uses the migration-only legacy Order marker for lost attachment investigation", async () => {
    storage.rpc.mockResolvedValue({ data: true, error: null });
    await expect(isLegacyCheckoutOrder("order-a")).resolves.toBe(true);
    expect(storage.rpc).toHaveBeenCalledWith("is_legacy_checkout_order", { p_order_id: "order-a" });
  });
  it("rejects an ambiguous legacy eligibility lookup", async () => {
    storage.rpc.mockResolvedValue({ data: null, error: null });
    await expect(isLegacyCheckoutOrder("order-a")).rejects.toBeInstanceOf(CheckoutPaymentStorageError);
  });
  it("retains logical attempt identity returned after execution claim rotation", async () => {
    storage.rpc.mockResolvedValue({ data: { ...accepted, sessionId: null }, error: null });
    const terms = Object.fromEntries(Object.entries(accepted).filter(([key]) =>
      !["version", "legacyEligible", "attemptId", "sessionId"].includes(key))) as CheckoutContractTerms;
    const result = await prepareCheckoutPaymentContract({ orderId: "order-a", attemptToken: "rotated-claim", stripeIdempotencyKey: "same-provider-key", terms });
    expect(result.attemptId).toBe("attempt-a");
    expect(result.contract.sessionId).toBeNull();
    expect(storage.rpc).toHaveBeenCalledWith("prepare_checkout_payment_contract", expect.objectContaining({ p_attempt_token: "rotated-claim", p_stripe_idempotency_key: "same-provider-key" }));
  });
  it("treats rejected binding as retryable instead of claiming persistence", async () => {
    storage.rpc.mockResolvedValue({ data: false, error: null });
    await expect(bindCheckoutPaymentSession({ orderId: "order-a", attemptId: "attempt-a", sessionId: "cs_test_a", stripeIdempotencyKey: "key" })).rejects.toBeInstanceOf(CheckoutPaymentStorageError);
  });
  it.each([
    { ...accepted, orderId: "another-order" }, { ...accepted, sessionId: "cs_test_other" },
    { ...accepted, version: "checkout_v1", legacyEligible: false },
    { ...accepted, automaticTaxEnabled: null }, { ...accepted, legacyEligible: true }, { ...accepted, attemptId: null }, { ...accepted, lines: [] },
    { ...accepted, shippingCents: -1 }, { ...accepted, accountId: "acct_other" },
  ])("rejects malformed or unrelated accepted facts", async (value) => {
    storage.rpc.mockResolvedValue({ data: value, error: null });
    await expect(loadCheckoutPaymentContract({ orderId: "order-a", sessionId: "cs_test_a" })).rejects.toBeInstanceOf(CheckoutPaymentStorageError);
  });
  it("does not manufacture eligibility when no local accepted contract exists", async () => {
    await expect(loadCheckoutPaymentContract({ orderId: "order-a", sessionId: "cs_test_a" })).resolves.toBeNull();
  });
  it("rejects mismatched finalization without any database write", async () => {
    await expect(finalizeVerifiedCheckoutPayment({ accepted, facts: { ...facts, attemptId: "replacement" }, rewardPointsEarned: 0 })).rejects.toBeInstanceOf(CheckoutPaymentStorageError);
    expect(storage.rpc).not.toHaveBeenCalled();
  });
  it("preserves a stale database CAS result for reconciliation to handle", async () => {
    storage.rpc.mockReturnValue({ maybeSingle: storage.maybeSingle.mockResolvedValue({ data: null, error: null }) });
    await expect(finalizeVerifiedCheckoutPayment({ accepted, facts, rewardPointsEarned: 0 })).resolves.toBeNull();
  });
  it("redacts provider/database details when exception persistence fails", async () => {
    storage.rpc.mockResolvedValue({ data: null, error: { message: "secret buyer@example.com raw payload" } });
    await expect(recordCheckoutPaymentException({ orderId: "order-a", attemptId: "attempt-a", sessionId: "cs_test_a", ...exception }))
      .rejects.toThrow("Payment verification is temporarily unavailable. Please try again.");
  });
  it("requires exception persistence acknowledgment and returns sanitized observed payment facts", async () => {
    storage.rpc.mockResolvedValueOnce({ data: false, error: null });
    await expect(recordCheckoutPaymentException({ orderId: "order-a", attemptId: "attempt-a", sessionId: "cs_test_a", ...exception })).rejects.toBeInstanceOf(CheckoutPaymentStorageError);
    storage.rpc.mockResolvedValueOnce({ data: exception, error: null });
    await expect(getCheckoutPaymentException({ orderId: "order-a", sessionId: "cs_test_a" })).resolves.toEqual(exception);
  });
  it("resolves only the requested refund failure and checks the write", async () => {
    storage.rpc.mockResolvedValue({ data: true, error: null });
    await resolveCheckoutPaymentExceptions({ orderId: "order-a", sessionId: "cs_test_a", code: "full_refund_reconciliation_failed" });
    expect(storage.rpc).toHaveBeenCalledWith("resolve_checkout_payment_exceptions", { p_order_id: "order-a", p_session_id: "cs_test_a", p_code: "full_refund_reconciliation_failed" });
  });
});
