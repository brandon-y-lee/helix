import Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deployment: vi.fn(), sandboxDeployment: vi.fn(), merchant: vi.fn(), rpc: vi.fn(), session: vi.fn(),
  dispute: vi.fn(), charge: vi.fn(), refunds: vi.fn(), sandbox: vi.fn(),
}));
const secret = "whsec_live_receiver_fixture";
const accountId = "acct_HelixLiveFixture";
const canonical = "https://www.helixskin.us";
const hook = "https://helixskin-dev-payments.vercel.app";
const businessSandboxAccount = "acct_BusinessTestMerchant";
const businessSandboxSigner = "whsec_development_receiver_fixture";
vi.mock("@/lib/checkout/business-origin", async (original) => ({
  ...await original<typeof import("@/lib/checkout/business-origin")>(), isBusinessSandboxDeployment: mocks.sandboxDeployment,
}));
vi.mock("@/lib/release/deployment-authorization", () => ({ productionDeploymentAuthorized: mocks.deployment }));
vi.mock("@/lib/stripe/live-provider", async (original) => ({
  ...await original<typeof import("@/lib/stripe/live-provider")>(),
  verifyBusinessStripeAccount: mocks.merchant,
  readBusinessStripeBinding: (environment: "live" | "business_sandbox") => ({
    stripe: { webhooks: Stripe.webhooks, disputes: { retrieve: mocks.dispute },
      charges: { retrieve: mocks.charge }, refunds: { list: mocks.refunds } },
    accountId: environment === "live" ? accountId : businessSandboxAccount, environment,
    webhookSecret: environment === "live" ? secret : businessSandboxSigner,
  }),
}));
vi.mock("@/lib/orders/live-settlement", () => ({ reconcileBusinessCheckoutSession: mocks.session }));
vi.mock("@/lib/stripe/webhook", () => ({ processStripeWebhookEvent: mocks.sandbox }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({ rpc: mocks.rpc }) }));
import { GET, POST } from "@/app/api/webhooks/stripe/route";
import { BUSINESS_SANDBOX_STOREFRONT_ORIGIN } from "@/lib/checkout/business-origin";

function snapshot(type = "checkout.session.completed") {
  const [kind, id] = type === "charge.refunded" ? ["charge", "ch_LiveCharge"]
    : type === "charge.dispute.created" ? ["dispute", "dp_LiveDispute"] : ["checkout.session", "cs_live_Session"];
  return { id: "evt_OrderEvent", object: "event", type, livemode: true, api_version: "2026-06-24.dahlia",
    data: { object: { id, object: kind, livemode: true } } };
}

function request(event = snapshot(), options: { origin?: string; signer?: string; alter?: boolean } = {}) {
  const payload = JSON.stringify(event);
  const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: options.signer ?? secret });
  return new Request((options.origin ?? canonical) + "/api/webhooks/stripe", {
    method: "POST", body: options.alter ? payload + "\n" : payload, headers: { "stripe-signature": signature },
  });
}

const refund = (id: string, amount: number, status = "succeeded") => ({
  object: "refund", id, amount, currency: "usd", payment_intent: "pi_LivePayment", charge: "ch_LiveCharge", status,
});
const metadata = { order_id: "e441f8ec-ec3c-4fe5-b545-4be13bb19573", attempt_id: "fa1b26dd-18bf-47a6-8c49-499afd1cf616",
  binding_nonce: "b939fa03-d451-4226-9424-a08c46106a8d", schema: "checkout_v2", environment: "live" };
const intent = { object: "payment_intent", id: "pi_LivePayment", livemode: true, metadata,
  latest_charge: "ch_LiveCharge", amount: 3000, amount_received: 3000, status: "succeeded", currency: "usd" };
const dispute = { object: "dispute", id: "dp_LiveDispute", livemode: true, charge: "ch_LiveCharge", payment_intent: intent.id };
const charged = { object: "charge", id: "ch_LiveCharge", livemode: true, paid: true, captured: true,
  status: "succeeded", currency: "usd", payment_intent: intent, amount: 3000,
  amount_captured: 3000, amount_refunded: 1000, refunded: false };
const refundTarget = { orderId: metadata.order_id, attemptId: metadata.attempt_id, paymentIntentId: intent.id,
  totalCents: 3000, currency: "USD", status: "paid" };
function storedResults(overrides: Record<string, unknown> = {}) {
  mocks.rpc.mockImplementation(async (name: string) => {
    const results: Record<string, unknown> = { claim_business_stripe_event: "claimed", finish_business_stripe_event: true,
      classify_business_checkout_attempt: "matched", read_business_checkout_refund_target: refundTarget,
      record_business_checkout_refund: "partial", ...overrides };
    if (!(name in results)) throw new Error("unexpected RPC");
    return { data: results[name], error: null };
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("CHECKOUT_MODE", "live");
  mocks.deployment.mockResolvedValue(true);
  mocks.sandboxDeployment.mockReturnValue(true);
  mocks.merchant.mockResolvedValue({ accountId });
  mocks.session.mockResolvedValue("processed");
  mocks.dispute.mockResolvedValue(dispute);
  mocks.charge.mockResolvedValue(charged);
  mocks.refunds.mockResolvedValue({ data: [refund("re_Fixture", 1000)], has_more: false });
  storedResults();
});
afterEach(() => vi.unstubAllEnvs());

describe("canonical live Stripe webhook", () => {
  it("settles a signed live Session under the same merchant and lease, without exposing its identifiers", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.text()).not.toContain("cs_live");
    expect(mocks.merchant).toHaveBeenCalledOnce();
    expect(mocks.sandbox).not.toHaveBeenCalled();
    expect(mocks.session).toHaveBeenCalledWith("cs_live_Session", expect.objectContaining({ accountId, environment: "live" }));
    const [claim, finish] = mocks.rpc.mock.calls;
    expect(claim).toEqual(["claim_business_stripe_event", {
      p_environment: "live", p_account_id: accountId, p_event_id: "evt_OrderEvent", p_event_type: "checkout.session.completed",
      p_object_id: "cs_live_Session", p_lease_id: expect.any(String),
    }]);
    expect(finish).toEqual(["finish_business_stripe_event", { p_environment: "live", p_account_id: accountId, p_event_id: "evt_OrderEvent",
      p_lease_id: claim[1].p_lease_id, p_outcome: "processed", p_code: null }]);
  });

  it.each(["host", "deployment", "signer", "changed body", "test mode", "foreign account", "api version", "test object"] as const)(
    "refuses %s before provider or storage effects", async (failure) => {
      const event = snapshot();
      if (failure === "deployment") mocks.deployment.mockResolvedValue(false);
      if (failure === "test mode") event.livemode = false;
      if (failure === "foreign account") Object.assign(event, { account: "acct_Other" });
      if (failure === "api version") event.api_version = "2020-01-01";
      if (failure === "test object") event.data.object.id = "cs_test_WrongMode";
      const response = await POST(request(event, {
        origin: failure === "host" ? "https://helixskin.vercel.app" : canonical,
        signer: failure === "signer" ? "whsec_sandbox" : secret, alter: failure === "changed body",
      }));
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(mocks.merchant).not.toHaveBeenCalled();
      expect(mocks.rpc).not.toHaveBeenCalled();
      expect(mocks.sandbox).not.toHaveBeenCalled();
    },
  );

  it("keeps unverifiable account and storage errors private and retryable", async () => {
    mocks.merchant.mockRejectedValue(new Error("private provider account data"));
    const response = await POST(request());
    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(await response.text()).not.toContain("private provider");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([["processed", 200], ["busy", 500], ["conflict", 500]])(
    "does not settle the Session when the claim is %s", async (claim, status) => {
      mocks.rpc.mockResolvedValue({ data: claim, error: null });
      expect((await POST(request())).status).toBe(status);
      expect(mocks.rpc).toHaveBeenCalledOnce();
      expect(mocks.session).not.toHaveBeenCalled();
    },
  );
  it("returns retryable status after unfinished settlement and when the lease was lost", async () => {
    mocks.session.mockResolvedValue("retryable");
    expect((await POST(request())).status).toBe(500);
    expect(mocks.rpc.mock.calls.at(-1)?.[1]).toMatchObject({ p_outcome: "retryable", p_code: expect.any(String) });
    mocks.rpc.mockResolvedValueOnce({ data: "claimed", error: null }).mockResolvedValueOnce({ data: false, error: null });
    mocks.session.mockResolvedValue("processed");
    expect((await POST(request())).status).toBe(500);
  });
  it("acknowledges an operator exception only after its marker was recorded", async () => {
    const response = await POST(request(snapshot("charge.dispute.created")));
    expect(response.status).toBe(200);
    expect(mocks.dispute).toHaveBeenCalledWith(dispute.id);
    expect(mocks.charge).toHaveBeenCalledWith(charged.id, { expand: ["payment_intent"] });
    expect(mocks.rpc).toHaveBeenCalledWith("classify_business_checkout_attempt", {
      p_environment: "live", p_account_id: accountId, p_order_id: metadata.order_id, p_attempt_id: metadata.attempt_id,
      p_binding_nonce: metadata.binding_nonce, p_payment_intent_id: intent.id,
    });
    expect(mocks.rpc.mock.calls.at(-1)?.[1]).toMatchObject({ p_outcome: "exception", p_code: "dispute_requires_review" });
    expect(mocks.session).not.toHaveBeenCalled();
  });

  it.each([1000, 3000])("reconciles the authenticated cumulative successful cents (%d)", async (amount) => {
    if (amount === 3000) storedResults({ record_business_checkout_refund: "refunded" });
    mocks.charge.mockResolvedValue({ ...charged, amount_refunded: amount, refunded: amount === charged.amount });
    mocks.refunds.mockResolvedValueOnce({ data: [refund("re_Failed", 500, "failed")], has_more: true })
      .mockResolvedValueOnce({ data: [refund("re_Paid", amount)], has_more: false });
    expect((await POST(request(snapshot("charge.refunded")))).status).toBe(200);
    expect(mocks.refunds).toHaveBeenLastCalledWith({ charge: "ch_LiveCharge", limit: 100, starting_after: "re_Failed" });
    expect(mocks.rpc).toHaveBeenCalledWith("record_business_checkout_refund", {
      p_environment: "live", p_account_id: accountId, p_charge_id: "ch_LiveCharge", p_payment_intent_id: "pi_LivePayment",
      p_refunded_cents: amount, p_currency: "USD",
    });
  });
  describe.each(["charge.refunded", "charge.dispute.created"])("%s ownership", (type) => {
    it("acknowledges unrelated merchant activity even for non-USD payments and without an account field", async () => {
      storedResults({ read_business_checkout_refund_target: null });
      mocks.charge.mockResolvedValue({ ...charged, currency: "eur", payment_intent: {
        ...intent, currency: "eur", metadata: { order_id: "ANOTHER-SHOP" },
      } });
      const response = await POST(request(snapshot(type)));
      expect(response.status).toBe(200);
      expect(mocks.charge).toHaveBeenCalledWith(charged.id, { expand: ["payment_intent"] });
      expect(mocks.rpc.mock.calls.at(-1)?.[1]).toMatchObject({ p_outcome: "ignored", p_code: null });
      expect(mocks.refunds).not.toHaveBeenCalled();
    });
    it.each([["unmatched", 200, "ignored"], ["pending", 500, "retryable"], ["conflict", 200, "exception"]])(
      "uses the immutable original attempt to classify %s before any Order effect", async (match, status, outcome) => {
        storedResults({ read_business_checkout_refund_target: null, classify_business_checkout_attempt: match });
        const response = await POST(request(snapshot(type)));
        expect(response.status).toBe(status);
        expect(mocks.rpc).toHaveBeenCalledWith("classify_business_checkout_attempt", {
          p_environment: "live", p_account_id: accountId, p_order_id: metadata.order_id, p_attempt_id: metadata.attempt_id,
          p_binding_nonce: metadata.binding_nonce, p_payment_intent_id: intent.id,
        });
        expect(mocks.rpc.mock.calls.at(-1)?.[1]).toMatchObject({ p_outcome: outcome });
        expect(mocks.refunds).not.toHaveBeenCalled();
      });
    it("holds contradictory identity on a known verified payment", async () => {
      mocks.charge.mockResolvedValue({ ...charged, payment_intent: { ...intent, metadata: {} } });
      expect((await POST(request(snapshot(type)))).status).toBe(200);
      expect(mocks.rpc.mock.calls.at(-1)?.[1]).toMatchObject({ p_outcome: "exception", p_code: "reconciliation_requires_review" });
      expect(mocks.refunds).not.toHaveBeenCalled();
    });
    it("keeps a known payment's conflicting Charge reference out of both refund and dispute handling", async () => {
      mocks.charge.mockResolvedValue({ ...charged, payment_intent: { ...intent, latest_charge: "ch_Unrelated" } });
      expect((await POST(request(snapshot(type)))).status).toBe(200);
      expect(mocks.rpc.mock.calls.at(-1)?.[1]).toMatchObject({ p_outcome: "exception", p_code: "reconciliation_requires_review" });
      expect(mocks.refunds).not.toHaveBeenCalled();
    });
    it("retains a retry when the authenticated provider read fails", async () => {
      (type === "charge.refunded" ? mocks.charge : mocks.dispute).mockRejectedValue(new Error("private detail"));
      const response = await POST(request(snapshot(type)));
      expect(response.status).toBe(500);
      expect(await response.text()).not.toContain("private detail");
      expect(mocks.rpc.mock.calls.at(-1)?.[1]).toMatchObject({ p_outcome: "retryable", p_code: "reconciliation_pending" });
      expect(mocks.refunds).not.toHaveBeenCalled();
    });
  });
  it("can identify a dispute from its verified Charge when the optional dispute PaymentIntent is null", async () => {
    mocks.dispute.mockResolvedValue({ ...dispute, payment_intent: null });
    expect((await POST(request(snapshot("charge.dispute.created")))).status).toBe(200);
    expect(mocks.rpc.mock.calls.at(-1)?.[1]).toMatchObject({ p_outcome: "exception", p_code: "dispute_requires_review" });
  });
  it.each([{ livemode: false }, { id: "dp_Other" }, { payment_intent: "pi_Other" },
    { charge: { id: charged.id, object: "charge", livemode: false } }])(
    "holds an inconsistent authenticated dispute without treating it as a verified Helix dispute", async (change) => {
      mocks.dispute.mockResolvedValue({ ...dispute, ...change });
      expect((await POST(request(snapshot("charge.dispute.created")))).status).toBe(200);
      expect(mocks.rpc.mock.calls.at(-1)?.[1]).toMatchObject({ p_outcome: "exception", p_code: "reconciliation_requires_review" });
      expect(mocks.refunds).not.toHaveBeenCalled();
    });
  it("acknowledges a matching earlier refund after a higher verified total has committed", async () => {
    storedResults({ read_business_checkout_refund_target: { ...refundTarget, refundedCents: 2000 },
      record_business_checkout_refund: "already_recorded" });
    const response = await POST(request(snapshot("charge.refunded")));
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("record_business_checkout_refund", {
      p_environment: "live", p_account_id: accountId, p_charge_id: charged.id, p_payment_intent_id: intent.id,
      p_refunded_cents: 1000, p_currency: "USD",
    });
    expect(mocks.rpc.mock.calls.at(-1)?.[1]).toMatchObject({ p_outcome: "processed", p_code: null });
  });
  it.each(["pending", "duplicate refund ID", "test charge", "foreign charge", "test refund reference", "wrong currency", "unmatched payment"])(
    "does not mark a live Order refunded on %s", async (failure) => {
      if (failure === "pending") mocks.refunds.mockResolvedValue({ data: [refund("re_Pending", 1000, "pending")], has_more: false });
      if (failure === "duplicate refund ID") mocks.refunds.mockResolvedValue({ data: [refund("re_A", 500), refund("re_A", 500)], has_more: false });
      if (failure === "test charge") mocks.charge.mockResolvedValue({ ...charged, livemode: false });
      if (failure === "foreign charge") mocks.refunds.mockResolvedValue({ data: [{ ...refund("re_A", 1000), charge: "ch_Other" }], has_more: false });
      if (failure === "test refund reference") mocks.refunds.mockResolvedValue({ data: [{
        ...refund("re_A", 1000), payment_intent: { id: intent.id, livemode: false },
      }], has_more: false });
      if (failure === "wrong currency") mocks.charge.mockResolvedValue({ ...charged, currency: "eur" });
      if (failure === "unmatched payment") storedResults({ read_business_checkout_refund_target: null,
        classify_business_checkout_attempt: "pending" });
      const response = await POST(request(snapshot("charge.refunded")));
      expect(mocks.rpc.mock.calls.some(([name]) => name === "record_business_checkout_refund")).toBe(false);
      const outcome = mocks.rpc.mock.calls.at(-1)?.[1].p_outcome;
      expect(["retryable", "exception"]).toContain(outcome);
      if (outcome === "retryable") expect(response.status).toBeGreaterThanOrEqual(500);
    },
  );
});

describe("business sandbox receiver on the development child", () => {
  beforeEach(() => vi.stubEnv("CHECKOUT_MODE", "business_sandbox"));
  function sandboxEvent(type: string) {
    const event = snapshot(type);
    event.livemode = false;
    event.data.object.livemode = false;
    event.data.object.id = event.data.object.id.replace("cs_live_", "cs_test_");
    return event;
  }

  it("hands a verified signed Session to the scoped reconciler and claims only its sandbox inbox", async () => {
    const event = sandboxEvent("checkout.session.completed");
    expect((await POST(request(event, { origin: hook, signer: businessSandboxSigner }))).status).toBe(200);
    expect(mocks.session).toHaveBeenCalledWith("cs_test_Session", expect.objectContaining({
      accountId: businessSandboxAccount, environment: "business_sandbox",
    }));
    expect(mocks.rpc.mock.calls[0][1]).toMatchObject({ p_account_id: businessSandboxAccount, p_environment: "business_sandbox" });
    expect(mocks.sandbox).not.toHaveBeenCalled();
  });
  it.each(["live signer", "legacy signer", "wrong branch", "storefront", "live object", "different issuer"])(
    "rejects %s before Stripe or DB access", async failure => {
      const event = sandboxEvent("checkout.session.completed");
      if (failure === "live object") event.data.object.id = "cs_live_Session";
      if (failure === "different issuer") Object.assign(event, { account: accountId });
      if (failure === "wrong branch") mocks.sandboxDeployment.mockReturnValue(false);
      const signer = failure === "legacy signer" ? "whsec_personal_fixture"
        : failure === "live signer" ? secret : businessSandboxSigner;
      const origin = failure === "storefront" ? BUSINESS_SANDBOX_STOREFRONT_ORIGIN : hook;
      expect((await POST(request(event, { origin, signer }))).status).toBeGreaterThanOrEqual(400);
      expect(mocks.merchant).not.toHaveBeenCalled();
      expect(mocks.rpc).not.toHaveBeenCalled();
      expect(mocks.sandbox).not.toHaveBeenCalled();
    });
  it("exposes only POST on the dedicated hook and preserves the production health GET", async () => {
    const route = "/api/webhooks/stripe";
    const onlyPost = await GET(new Request(hook + route));
    expect(onlyPost.status).toBe(405);
    expect(onlyPost.headers.get("allow")).toBe("POST");
    expect(await (await GET(new Request(canonical + route))).json()).toEqual({ ok: true, endpoint: "stripe" });
  });
  it.each(["charge.refunded", "charge.dispute.created"])("reconciles a verified paid test Order for %s", async type => {
    const event = sandboxEvent(type);
    mocks.dispute.mockResolvedValue({ ...dispute, livemode: false });
    mocks.charge.mockResolvedValue({ ...charged, livemode: false, payment_intent: {
      ...intent, livemode: false, metadata: { ...metadata, environment: "business_sandbox" },
    } });
    expect((await POST(request(event, { origin: hook, signer: businessSandboxSigner }))).status).toBe(200);
    if (type === "charge.refunded") {
      expect(mocks.rpc).toHaveBeenCalledWith("record_business_checkout_refund", {
        p_account_id: businessSandboxAccount, p_environment: "business_sandbox", p_charge_id: charged.id,
        p_payment_intent_id: intent.id, p_currency: "USD", p_refunded_cents: 1000,
      });
      expect(mocks.rpc.mock.calls.at(-1)?.[1]).toMatchObject({ p_outcome: "processed" });
    } else {
      expect(mocks.rpc.mock.calls.at(-1)?.[1]).toMatchObject({ p_outcome: "exception", p_code: "dispute_requires_review" });
    }
  });
  it.each(["charge.dispute.created", "charge.refunded"])("retains the scoped %s pending until the same sandbox attempt settles", async type => {
    const event = sandboxEvent(type);
    mocks.dispute.mockResolvedValue({ ...dispute, livemode: false });
    mocks.charge.mockResolvedValue({ ...charged, livemode: false, payment_intent: {
      ...intent, livemode: false, metadata: { ...metadata, environment: "business_sandbox" },
    } });
    storedResults({ read_business_checkout_refund_target: null, classify_business_checkout_attempt: "pending" });
    expect((await POST(request(event, { origin: hook, signer: businessSandboxSigner }))).status).toBe(500);
    expect(mocks.rpc.mock.calls.at(-1)?.[1]).toMatchObject({
      p_account_id: businessSandboxAccount, p_environment: "business_sandbox", p_outcome: "retryable",
    });
    expect(mocks.refunds).not.toHaveBeenCalled();
  });
  it("rejects an expanded live Refund reference on a genuine business sandbox Charge", async () => {
    const event = sandboxEvent("charge.refunded");
    mocks.charge.mockResolvedValue({ ...charged, livemode: false, payment_intent: {
      ...intent, livemode: false, metadata: { ...metadata, environment: "business_sandbox" },
    } });
    mocks.refunds.mockResolvedValue({ data: [{ ...refund("re_Ref", 1000), charge: {
      object: "charge", id: charged.id, livemode: true,
    } }], has_more: false });
    expect((await POST(request(event, { origin: hook, signer: businessSandboxSigner }))).status).toBe(200);
    expect(mocks.rpc.mock.calls.at(-1)?.[1]).toMatchObject({ p_outcome: "exception" });
    expect(mocks.rpc.mock.calls.some(([name]) => name === "record_business_checkout_refund")).toBe(false);
  });
});
