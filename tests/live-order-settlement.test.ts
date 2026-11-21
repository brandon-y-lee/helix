import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BusinessStripeBinding } from "@/lib/stripe/live-provider";

const edges = vi.hoisted(() => ({
  rpc: vi.fn(), provider: vi.fn(), verify: vi.fn(), verifyBinding: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({ rpc: edges.rpc }) }));
vi.mock("@/lib/stripe/payment-verification", () => ({ retrieveCheckoutPaymentProviderBundle: edges.provider }));
vi.mock("@/lib/checkout/payment-verification", async (original) => ({
  ...await original<typeof import("@/lib/checkout/payment-verification")>(),
  verifyCheckoutPayment: edges.verify, verifyBusinessCheckoutBinding: edges.verifyBinding,
}));
import { reconcileBusinessCheckoutSession } from "@/lib/orders/live-settlement";

const orderId = "00000000-0000-4000-8000-000000000001";
const attemptId = "00000000-0000-4000-8000-000000000002";
const bindingNonce = "00000000-0000-4000-8000-000000000003";
const sessionId = "cs_live_Fixture";
const accountId = "acct_LiveFixture";
const binding = { environment: "live", accountId } as BusinessStripeBinding;
const contract = {
  version: "checkout_v2", legacyEligible: false, environment: "live", currency: "USD",
  orderId, attemptId, sessionId, accountId, bindingNonce, apiVersion: "2026-06-24.dahlia",
  customerId: null, couponId: null, offerId: null, shippingRateId: null, freeShipping: true,
  automaticTaxEnabled: false, taxBehavior: "exclusive", merchandiseSubtotalCents: 5000,
  discountCents: 0, shippingCents: 0, preTaxTotalCents: 5000,
  lines: [{ lineId: "00000000-0000-4000-8000-000000000004", productId: "super-serum", productSlug: "super-serum", variantKey: "30ml", quantity: 2, unitAmountCents: 2500 }],
};
function provider() {
  return { environment: "live", accountId, session: { id: sessionId, client_reference_id: orderId,
    metadata: { order_id: orderId, attempt_id: attemptId, binding_nonce: bindingNonce } } };
}
function storage(results: Record<string, unknown>) {
  edges.rpc.mockImplementation(async (name: string) => {
    if (!(name in results)) throw new Error("Unexpected storage operation");
    return { data: results[name], error: null };
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  edges.provider.mockResolvedValue(provider());
  edges.verifyBinding.mockReturnValue(true);
  edges.verify.mockReturnValue({ status: "paid", facts: { orderId, attemptId, sessionId, contractVersion: "checkout_v2" } });
});

describe("settlement of live Orders", () => {
  it("settles an original business sandbox Session through the test merchant and explicit database mode", async () => {
    const environment = "business_sandbox";
    const sandboxBinding = { environment, accountId: "acct_BusinessSandbox" } as BusinessStripeBinding;
    const sandboxId = "cs_test_Session";
    const sandboxTerms = { ...contract, environment, sessionId: sandboxId, accountId: sandboxBinding.accountId };
    edges.provider.mockResolvedValue({ ...provider(), environment, accountId: sandboxBinding.accountId,
      session: { ...provider().session, id: sandboxId } });
    edges.verify.mockReturnValue({ status: "paid", facts: { orderId, attemptId, sessionId: sandboxId, contractVersion: "checkout_v2" } });
    storage({ read_business_checkout_order_id: orderId, read_business_checkout_payment_contract: sandboxTerms,
      finalize_business_checkout_payment: "paid" });
    await expect(reconcileBusinessCheckoutSession(sandboxId, sandboxBinding)).resolves.toBe("processed");
    for (const [, args] of edges.rpc.mock.calls) expect(args).toMatchObject({
      p_account_id: sandboxBinding.accountId, p_environment: environment,
    });
  });
  it.each(["paid", "already_paid", "refunded"])("uses the verified facts and existing merchant-scoped Order exactly once (%s)", async terminal => {
    storage({ read_business_checkout_order_id: orderId, read_business_checkout_payment_contract: contract, finalize_business_checkout_payment: terminal });
    await expect(reconcileBusinessCheckoutSession(sessionId, binding)).resolves.toBe("processed");
    expect(edges.rpc).toHaveBeenCalledWith("finalize_business_checkout_payment", {
      p_environment: "live", p_account_id: accountId, p_order_id: orderId, p_attempt_id: attemptId, p_session_id: sessionId,
      p_facts: { orderId, attemptId, sessionId, contractVersion: "checkout_v2" },
    });
    expect(edges.rpc.mock.calls.map(([name]) => name)).toEqual([
      "read_business_checkout_order_id", "read_business_checkout_payment_contract", "finalize_business_checkout_payment",
    ]);
  });

  it("holds a known Order with missing provider metadata", async () => {
    const result = provider();
    edges.provider.mockResolvedValue({ ...result, session: { ...result.session, client_reference_id: null, metadata: null } });
    storage({ read_business_checkout_order_id: orderId });
    await expect(reconcileBusinessCheckoutSession(sessionId, binding)).resolves.toBe("exception");
    expect(edges.rpc).toHaveBeenCalledTimes(1);
  });

  it.each([
    { environment: "sandbox" }, { accountId: "acct_OtherFixture" },
    { bindingNonce: "00000000-0000-4000-8000-000000000009" }, { sessionId: "cs_live_Other" },
    { version: "checkout_v1", legacyEligible: true },
  ])("never finalizes outside the stored account, mode, attempt and Session binding", async replacement => {
    storage({ read_business_checkout_order_id: orderId, read_business_checkout_payment_contract: { ...contract, ...replacement } });
    await expect(reconcileBusinessCheckoutSession(sessionId, binding)).resolves.toBe("exception");
    expect(edges.verify).not.toHaveBeenCalled();
    expect(edges.rpc).toHaveBeenCalledTimes(2);
  });

  it("ignores an unrelated Stripe purchase only when the account has no matching local Order", async () => {
    const result = provider();
    edges.provider.mockResolvedValue({ ...result, session: { ...result.session, client_reference_id: null, metadata: {} } });
    storage({ read_business_checkout_order_id: null });
    await expect(reconcileBusinessCheckoutSession(sessionId, binding)).resolves.toBe("ignored");
    expect(edges.rpc).toHaveBeenCalledTimes(1);
  });

  it("never admits an Order based on signed provider metadata alone", async () => {
    storage({ read_business_checkout_order_id: null, read_pending_business_checkout_contract: null });
    await expect(reconcileBusinessCheckoutSession(sessionId, binding)).resolves.toBe("exception");
    expect(edges.verify).not.toHaveBeenCalled();
    expect(edges.rpc).toHaveBeenCalledTimes(2);
  });

  it("recovers a lost create response only against a previously sent matching Attempt and complete provider quote", async () => {
    storage({ read_business_checkout_order_id: null, read_pending_business_checkout_contract: { ...contract, sessionId: null },
      bind_recovered_business_checkout_session: true, finalize_business_checkout_payment: "paid" });
    await expect(reconcileBusinessCheckoutSession(sessionId, binding)).resolves.toBe("processed");
    expect(edges.verifyBinding).toHaveBeenCalled();
    expect(edges.rpc).toHaveBeenCalledWith("bind_recovered_business_checkout_session", {
      p_environment: "live", p_account_id: accountId, p_order_id: orderId, p_attempt_id: attemptId, p_session_id: sessionId, p_binding_nonce: bindingNonce,
    });
  });

  it("retains the payment for investigation if recovery cannot verify the quoted lines", async () => {
    storage({ read_business_checkout_order_id: null, read_pending_business_checkout_contract: { ...contract, sessionId: null } });
    edges.verifyBinding.mockReturnValue(false);
    await expect(reconcileBusinessCheckoutSession(sessionId, binding)).resolves.toBe("exception");
    expect(edges.rpc).toHaveBeenCalledTimes(2);
  });

  it("keeps a pending provider outcome retryable without changing an Order", async () => {
    storage({ read_business_checkout_order_id: orderId, read_business_checkout_payment_contract: contract });
    edges.verify.mockReturnValue({ status: "pending" });
    await expect(reconcileBusinessCheckoutSession(sessionId, binding)).resolves.toBe("retryable");
    expect(edges.rpc).toHaveBeenCalledTimes(2);
  });

  it("leaves a lost settlement commit retryable without a payment assertion", async () => {
    storage({ read_business_checkout_order_id: orderId, read_business_checkout_payment_contract: contract,
      finalize_business_checkout_payment: null });
    await expect(reconcileBusinessCheckoutSession(sessionId, binding)).rejects.toThrow("unconfirmed outcome");
  });

  it("records only a verified terminal unpaid result", async () => {
    storage({ read_business_checkout_order_id: orderId, read_business_checkout_payment_contract: contract, record_business_checkout_unpaid: "recorded" });
    edges.verify.mockReturnValue({ status: "expired" });
    await expect(reconcileBusinessCheckoutSession(sessionId, binding)).resolves.toBe("processed");
    expect(edges.rpc).toHaveBeenCalledWith("record_business_checkout_unpaid", {
      p_environment: "live", p_account_id: accountId, p_order_id: orderId, p_attempt_id: attemptId, p_session_id: sessionId, p_outcome: "expired",
    });
  });
});
