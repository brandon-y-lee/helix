import Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deployment: vi.fn(), merchant: vi.fn(), rpc: vi.fn(), session: vi.fn(),
  charge: vi.fn(), refunds: vi.fn(), sandbox: vi.fn(),
}));
const secret = "whsec_live_receiver_fixture";
const accountId = "acct_HelixLiveFixture";
const canonical = "https://www.helixskin.us";
vi.mock("@/lib/release/deployment-authorization", () => ({ productionDeploymentAuthorized: mocks.deployment }));
vi.mock("@/lib/stripe/live-provider", async (original) => ({
  ...await original<typeof import("@/lib/stripe/live-provider")>(),
  verifyLiveStripeAccount: mocks.merchant,
  readLiveStripeBinding: () => ({
    stripe: { webhooks: Stripe.webhooks, charges: { retrieve: mocks.charge }, refunds: { list: mocks.refunds } },
    accountId, environment: "live", webhookSecret: secret,
  }),
}));
vi.mock("@/lib/orders/live-settlement", () => ({ reconcileLiveCheckoutSession: mocks.session }));
vi.mock("@/lib/stripe/webhook", () => ({ processStripeWebhookEvent: mocks.sandbox }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({ rpc: mocks.rpc }) }));
import { POST } from "@/app/api/webhooks/stripe/route";

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
const charged = { object: "charge", id: "ch_LiveCharge", livemode: true, paid: true, captured: true,
  status: "succeeded", currency: "usd", payment_intent: "pi_LivePayment", amount: 3000,
  amount_captured: 3000, amount_refunded: 1000, refunded: false };
const refundTarget = { paymentIntentId: "pi_LivePayment", totalCents: 3000, currency: "USD", status: "paid" };

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("CHECKOUT_MODE", "live");
  mocks.deployment.mockResolvedValue(true);
  mocks.merchant.mockResolvedValue({ accountId });
  mocks.session.mockResolvedValue("processed");
  mocks.charge.mockResolvedValue(charged);
  mocks.refunds.mockResolvedValue({ data: [refund("re_Fixture", 1000)], has_more: false });
  mocks.rpc.mockImplementation(async (name: string) => {
    const results: Record<string, unknown> = { claim_live_stripe_event: "claimed", finish_live_stripe_event: true,
      read_live_checkout_refund_target: refundTarget, record_live_checkout_refund: "partial" };
    if (!(name in results)) throw new Error("unexpected RPC");
    return { data: results[name], error: null };
  });
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
    expect(claim).toEqual(["claim_live_stripe_event", {
      p_account_id: accountId, p_event_id: "evt_OrderEvent", p_event_type: "checkout.session.completed",
      p_object_id: "cs_live_Session", p_lease_id: expect.any(String),
    }]);
    expect(finish).toEqual(["finish_live_stripe_event", { p_account_id: accountId, p_event_id: "evt_OrderEvent",
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
    expect(mocks.rpc.mock.calls.at(-1)?.[1]).toMatchObject({ p_outcome: "exception", p_code: expect.any(String) });
    expect(mocks.session).not.toHaveBeenCalled();
  });

  it.each([1000, 3000])("reconciles the authenticated cumulative successful cents (%d)", async (amount) => {
    if (amount === 3000) {
      mocks.rpc.mockResolvedValueOnce({ data: "claimed", error: null })
        .mockResolvedValueOnce({ data: refundTarget, error: null })
        .mockResolvedValueOnce({ data: "refunded", error: null })
        .mockResolvedValueOnce({ data: true, error: null });
    }
    mocks.charge.mockResolvedValue({ ...charged, amount_refunded: amount, refunded: amount === charged.amount });
    mocks.refunds.mockResolvedValueOnce({ data: [refund("re_Failed", 500, "failed")], has_more: true })
      .mockResolvedValueOnce({ data: [refund("re_Paid", amount)], has_more: false });
    expect((await POST(request(snapshot("charge.refunded")))).status).toBe(200);
    expect(mocks.refunds).toHaveBeenLastCalledWith({ charge: "ch_LiveCharge", limit: 100, starting_after: "re_Failed" });
    expect(mocks.rpc).toHaveBeenCalledWith("record_live_checkout_refund", {
      p_account_id: accountId, p_charge_id: "ch_LiveCharge", p_payment_intent_id: "pi_LivePayment",
      p_refunded_cents: amount, p_currency: "USD",
    });
  });
  it.each(["pending", "duplicate refund ID", "test charge", "foreign charge", "test refund reference", "wrong currency", "unmatched payment"])(
    "does not mark a live Order refunded on %s", async (failure) => {
      if (failure === "pending") mocks.refunds.mockResolvedValue({ data: [refund("re_Pending", 1000, "pending")], has_more: false });
      if (failure === "duplicate refund ID") mocks.refunds.mockResolvedValue({ data: [refund("re_A", 500), refund("re_A", 500)], has_more: false });
      if (failure === "test charge") mocks.charge.mockResolvedValue({ ...charged, livemode: false });
      if (failure === "foreign charge") mocks.refunds.mockResolvedValue({ data: [{ ...refund("re_A", 1000), charge: "ch_Other" }], has_more: false });
      if (failure === "test refund reference") mocks.refunds.mockResolvedValue({ data: [{
        ...refund("re_A", 1000), payment_intent: { id: charged.payment_intent, livemode: false },
      }], has_more: false });
      if (failure === "wrong currency") mocks.charge.mockResolvedValue({ ...charged, currency: "eur" });
      if (failure === "unmatched payment") mocks.rpc.mockResolvedValueOnce({ data: "claimed", error: null }).mockResolvedValueOnce({ data: null, error: null }).mockResolvedValue({ data: true, error: null });
      const response = await POST(request(snapshot("charge.refunded")));
      expect(mocks.rpc.mock.calls.some(([name]) => name === "record_live_checkout_refund")).toBe(false);
      const outcome = mocks.rpc.mock.calls.at(-1)?.[1].p_outcome;
      expect(["retryable", "exception"]).toContain(outcome);
      if (outcome === "retryable") expect(response.status).toBeGreaterThanOrEqual(500);
    },
  );
});
