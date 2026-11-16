import { beforeEach, describe, expect, it, vi } from "vitest";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({ rpc }) }));
import {
  admitCheckoutCreation,
  cacheCreatedCheckoutSession,
  claimPaymentRefresh,
  finishPaymentRefresh,
  type CachedCheckoutSession,
} from "@/lib/checkout/admission";

const identity = {
  accountId: "acct_approved",
  orderId: "00000000-0000-4000-8000-000000000001",
  attemptToken: "00000000-0000-4000-8000-000000000002",
  stripeIdempotencyKey: "stripe-session:00000000-0000-4000-8000-000000000001:initial",
};
const snapshot: CachedCheckoutSession = {
  kind: "session", id: "cs_test_owned", status: "open", payment_status: "unpaid",
  expires_at: 1900000000, url: "https://checkout.stripe.com/c/pay/cs_test_owned",
  livemode: false, payment_method_types: ["card"],
};
const target = { kind: "session" as const, orderId: identity.orderId, sessionId: snapshot.id };

describe("durable checkout admission adapter", () => {
  beforeEach(() => rpc.mockReset());
  it("sends only the server claim identity and preserves a quota-free replay", async () => {
    rpc.mockResolvedValue({ data: { allowed: true, replay: true, retry_after_seconds: 0 }, error: null });
    await expect(admitCheckoutCreation(identity)).resolves.toEqual({ replay: true });
    expect(rpc).toHaveBeenCalledWith("admit_checkout_creation", {
      p_account_id: identity.accountId, p_order_id: identity.orderId,
      p_attempt_token: identity.attemptToken, p_stripe_idempotency_key: identity.stripeIdempotencyKey,
    });
  });
  it("returns a bounded public rate error without private database details", async () => {
    rpc.mockResolvedValue({ data: { allowed: false, replay: false, retry_after_seconds: 42 }, error: null });
    await expect(admitCheckoutCreation(identity)).rejects.toMatchObject({ status: 429, retryAfterSeconds: 42 });
    rpc.mockResolvedValue({ data: null, error: { message: "sensitive provider or owner details" } });
    await expect(admitCheckoutCreation(identity)).rejects.toMatchObject({ status: 503 });
    await expect(admitCheckoutCreation(identity)).rejects.not.toThrow("sensitive");
  });
  it.each([null, {}, { allowed: true, replay: "yes" }, { allowed: false, replay: false, retry_after_seconds: -1 }])(
    "fails closed on a malformed create decision %j", async (data) => {
      rpc.mockResolvedValue({ data, error: null });
      await expect(admitCheckoutCreation(identity)).rejects.toMatchObject({ status: 503 });
    },
  );
  it("returns a validated stored state when refresh is deferred", async () => {
    rpc.mockResolvedValue({ data: { allowed: false, token: null, cached: snapshot, retry_after_seconds: 5 }, error: null });
    await expect(claimPaymentRefresh({ accountId: identity.accountId, target })).resolves.toEqual({
      allowed: false, token: null, cached: snapshot, retryAfterSeconds: 5,
    });
  });
  it.each([
    { ...snapshot, livemode: true }, { ...snapshot, customer_email: "private@example.test" },
    { ...snapshot, expires_at: null }, { ...snapshot, payment_method_types: [null] },
  ])("rejects malformed or excessive cached provider facts", async (cached) => {
    rpc.mockResolvedValue({ data: { allowed: false, token: null, cached, retry_after_seconds: 5 }, error: null });
    await expect(claimPaymentRefresh({ accountId: identity.accountId, target })).rejects.toMatchObject({ status: 503 });
  });
  it("rejects a missing lease token on an admitted refresh", async () => {
    rpc.mockResolvedValue({ data: { allowed: true, token: null, cached: null, retry_after_seconds: 0 }, error: null });
    await expect(claimPaymentRefresh({ accountId: identity.accountId, target })).rejects.toMatchObject({ status: 503 });
  });
  it("keeps stale refresh completion explicit and supports failure completion without erasing cache", async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    await expect(finishPaymentRefresh({ accountId: identity.accountId, target, token: identity.attemptToken, snapshot: null })).resolves.toBe(false);
    expect(rpc.mock.calls[0]?.[1]).toMatchObject({ p_snapshot: null, p_refresh_token: identity.attemptToken });
  });
  it("stores only a validated creation snapshot through its claim-qualified boundary", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    await expect(cacheCreatedCheckoutSession({ ...identity, snapshot })).resolves.toBeUndefined();
    expect(rpc.mock.calls[0]?.[0]).toBe("cache_created_checkout_session");
    rpc.mockResolvedValue({ data: false, error: null });
    await expect(cacheCreatedCheckoutSession({ ...identity, snapshot })).rejects.toMatchObject({ status: 503 });
  });
});
