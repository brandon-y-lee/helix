import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const boundary = vi.hoisted(() => ({
  cookieGet: vi.fn(), cookieSet: vi.fn(), identity: vi.fn(),
  retrieveSession: vi.fn(), createSession: vi.fn(), expireSession: vi.fn(), retrieveShipping: vi.fn(),
  createCustomer: vi.fn(), rpc: vi.fn(), from: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: boundary.cookieGet, set: boundary.cookieSet }),
  headers: async () => new Headers({ origin: "https://helixskin.vercel.app" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({
  getCurrentIdentity: boundary.identity, getCurrentUser: boundary.identity,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ from: boundary.from, rpc: boundary.rpc }),
}));
vi.mock("@/lib/stripe/server", () => ({
  getStripeClient: () => ({
    checkout: { sessions: { retrieve: boundary.retrieveSession, create: boundary.createSession, expire: boundary.expireSession } },
    shippingRates: { retrieve: boundary.retrieveShipping },
    customers: { create: boundary.createCustomer },
  }),
}));

import { cancelPendingCheckoutFromCookie, checkoutErrorResponseMessage, createStripeCheckoutSession, getOrderConfirmationBySession } from "@/lib/orders/server";
import { GUEST_CART_COOKIE } from "@/lib/customer-state-identifiers";
import { CHECKOUT_CANCEL_COOKIE } from "@/lib/orders/checkout-cancel";

const cartId = "00000000-0000-4000-8000-000000000041";
const orderId = "00000000-0000-4000-8000-000000000042";
const sessionId = "cs_test_owned_session";
const refreshToken = "00000000-0000-4000-8000-000000000045";
const order = { id: orderId, cart_id: cartId, user_id: null, status: "pending_payment",
  stripe_checkout_session_id: sessionId, total_cents: 5500, metadata: {}, order_number: "HX-42" };

function queryResult(data: unknown) {
  const result = { data, error: null };
  const query = {
    select: vi.fn(() => query), eq: vi.fn(() => query),
    neq: vi.fn(() => query), update: vi.fn(() => query), upsert: vi.fn(() => query),
    maybeSingle: vi.fn(async () => result), single: vi.fn(async () => result),
    order: vi.fn(async () => result),
    then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
  };
  return query;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CHECKOUT_ENABLED", "true");
  vi.stubEnv("STRIPE_ACCOUNT_ID", "acct_1Tm9WRFEzyaKzdmq");
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_boundary");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_boundary");
  boundary.identity.mockResolvedValue(null);
  boundary.cookieGet.mockImplementation((name: string) => name === GUEST_CART_COOKIE ? { value: "guest-bearer" } : undefined);
  boundary.retrieveSession.mockResolvedValue({ id: sessionId, status: "open", payment_status: "unpaid", livemode: false,
    expires_at: Math.floor(Date.now() / 1000) + 1800, url: "https://checkout.stripe.com/c/pay/private", payment_method_types: ["card"] });
  boundary.from.mockImplementation((table: string) => queryResult(table === "orders" ? order : []));
  boundary.rpc.mockImplementation(async (name: string) => {
    if (name === "resolve_active_cart") return { data: [{ cart_id: "another-cart", user_id: null, status: "active" }], error: null };
    const refresh = refreshResult(name);
    if (refresh) return refresh;
    throw new Error(`Unexpected database operation: ${name}`);
  });
});
afterEach(() => vi.unstubAllEnvs());

function refreshResult(name: string) {
  if (name === "claim_checkout_refresh") return { data: { allowed: true, token: refreshToken, cached: null, retry_after_seconds: 0 }, error: null };
  if (["finish_checkout_refresh", "cache_created_checkout_session"].includes(name)) return { data: true, error: null };
  return null;
}

function useCheckoutFixture(overrides: Record<string, unknown> = {}, priceCents = 5500) {
  const activeOrder = { ...order, stripe_checkout_session_id: null, ...overrides };
  const session = { id: sessionId, status: "open", payment_status: "unpaid", livemode: false,
    expires_at: Math.floor(Date.now() / 1000) + 1800, url: "https://checkout.stripe.com/c/pay/private",
    payment_method_types: ["card"] };
  boundary.createSession.mockResolvedValue(session);
  boundary.retrieveSession.mockResolvedValue(session);
  boundary.from.mockImplementation((table: string) => {
    if (table === "orders") return queryResult(activeOrder);
    if (table === "carts") return queryResult({ checkout_generation: "00000000-0000-4000-8000-000000000044" });
    if (table === "cart_items") return queryResult([{
      id: "line-1", product_id: "product-1", variant_key: "30ml", quantity: 1,
      products: { id: "product-1", slug: "super-serum", display_name: "Super Serum", product_type: "serum",
        routine_group: "treat", catalog_status: "active", status: "available", product_media: [],
        product_variants: [{ variant_key: "30ml", label: "30 mL", price_cents: priceCents, available: true, inventory_status: "in_stock" }] },
    }]);
    if (table === "payment_attempts") return queryResult(null);
    throw new Error(`Unexpected table: ${table}`);
  });
  boundary.rpc.mockImplementation((name: string) => {
    if (name === "resolve_active_cart") return Promise.resolve({ data: [{ cart_id: cartId, user_id: null, status: "active" }], error: null });
    if (name === "reserve_checkout_order_snapshot_v2") return queryResult(activeOrder);
    if (name === "claim_checkout_attempt") return Promise.resolve({ data: "00000000-0000-4000-8000-000000000043", error: null });
    if (name === "admit_checkout_creation") return Promise.resolve({ data: { allowed: true, replay: false, retry_after_seconds: 0 }, error: null });
    const refresh = refreshResult(name);
    if (refresh) return Promise.resolve(refresh);
    if (["prepare_checkout_attempt", "attach_checkout_session", "release_checkout_attempt", "fail_checkout_attempt"].includes(name)) {
      return Promise.resolve({ data: true, error: null });
    }
    throw new Error(`Unexpected database operation: ${name}`);
  });
  return { session, activeOrder };
}

describe("customer checkout admission", () => {
  it("does not disclose or retrieve an order's Session for another guest cart", async () => {
    expect(await getOrderConfirmationBySession(sessionId)).toBeNull();
    expect(boundary.retrieveSession).not.toHaveBeenCalled();
  });
  it("continues owned status retrieval with new checkout disabled", async () => {
    vi.stubEnv("CHECKOUT_ENABLED", "false");
    boundary.rpc.mockImplementation(async (name) => refreshResult(name) ?? { data: [{ cart_id: cartId, user_id: null, status: "active" }], error: null });
    const confirmation = await getOrderConfirmationBySession(sessionId);
    expect(confirmation).toMatchObject({ order: { id: orderId, status: "pending_payment" }, webhookPending: true });
    expect(boundary.retrieveSession).toHaveBeenCalledWith(sessionId);
  });
  it("creates card-only Sessions and records the actual accepted method policy", async () => {
    useCheckoutFixture();
    const result = await createStripeCheckoutSession();
    expect(result).toMatchObject({ orderId, sessionId });
    expect(boundary.createSession).toHaveBeenCalledWith(expect.objectContaining({ payment_method_types: ["card"] }), expect.any(Object));
    const attemptQuery = boundary.from.mock.results.find((_, index) => boundary.from.mock.calls[index][0] === "payment_attempts")?.value;
    expect(attemptQuery.upsert).toHaveBeenCalledWith(expect.objectContaining({ metadata: expect.objectContaining({ payment_method_configuration: "card", payment_method_types: ["card"] }) }), expect.any(Object));
  });
  it("does not send provider writes when shared create admission is exhausted", async () => {
    useCheckoutFixture();
    const previousRpc = boundary.rpc.getMockImplementation()!;
    boundary.rpc.mockImplementation((name, ...args) => name === "admit_checkout_creation"
      ? Promise.resolve({ data: { allowed: false, replay: false, retry_after_seconds: 24 }, error: null })
      : previousRpc(name, ...args));
    const error = await createStripeCheckoutSession().catch((value: unknown) => value);
    expect(checkoutErrorResponseMessage(error)).toMatchObject({ status: 429, retryAfterSeconds: 24 });
    expect(boundary.createSession).not.toHaveBeenCalled();
    expect(boundary.createCustomer).not.toHaveBeenCalled();
    expect(boundary.rpc.mock.calls.some(([name]) => name === "fail_checkout_attempt")).toBe(false);
  });
  it("reuses an accepted open Session when new checkout is disabled", async () => {
    vi.stubEnv("CHECKOUT_ENABLED", "false");
    const { session } = useCheckoutFixture({ stripe_checkout_session_id: sessionId });
    expect(await createStripeCheckoutSession()).toMatchObject({ sessionId, url: session.url });
    expect(boundary.createSession).not.toHaveBeenCalled();
    expect(boundary.rpc.mock.calls.some(([name]) => name === "admit_checkout_creation")).toBe(false);
  });
  it("returns authorized stored pending status when shared refresh is deferred", async () => {
    boundary.rpc.mockImplementation(async (name) => name === "resolve_active_cart"
      ? { data: [{ cart_id: cartId, user_id: null, status: "active" }], error: null }
      : { data: { allowed: false, token: null, cached: null, retry_after_seconds: 5 }, error: null });
    expect(await getOrderConfirmationBySession(sessionId)).toMatchObject({ order: { status: "pending_payment" }, webhookPending: true });
    expect(boundary.retrieveSession).not.toHaveBeenCalled();
  });
  it("reuses only an unexpired cached payable URL while replay refresh is deferred", async () => {
    const { session } = useCheckoutFixture({ stripe_checkout_session_id: sessionId });
    const original = boundary.rpc.getMockImplementation()!;
    boundary.rpc.mockImplementation((name, ...args) => name === "claim_checkout_refresh"
      ? Promise.resolve({ data: { allowed: false, token: null, cached: { ...session, kind: "session", payment_method_types: ["afterpay_clearpay"] }, retry_after_seconds: 5 }, error: null })
      : original(name, ...args));
    expect(await createStripeCheckoutSession()).toMatchObject({ sessionId, url: session.url });
    expect(boundary.retrieveSession).not.toHaveBeenCalled();
    expect(boundary.createSession).not.toHaveBeenCalled();
    const attemptQuery = boundary.from.mock.results.find((_, index) => boundary.from.mock.calls[index][0] === "payment_attempts")?.value;
    expect(attemptQuery.upsert).toHaveBeenCalledWith(expect.objectContaining({ metadata: expect.objectContaining({ payment_method_configuration: "provider_recorded", payment_method_types: ["afterpay_clearpay"] }) }), expect.any(Object));
  });
  it("uses the shared verified shipping quote when provider refresh is deferred", async () => {
    vi.stubEnv("STRIPE_STANDARD_SHIPPING_RATE_ID", "shr_standard");
    useCheckoutFixture({}, 2500);
    const original = boundary.rpc.getMockImplementation()!;
    boundary.rpc.mockImplementation((name, ...args) => name === "claim_checkout_refresh" && args[0]?.p_kind === "shipping_rate"
      ? Promise.resolve({ data: { allowed: false, token: null, cached: { kind: "shipping_rate", id: "shr_standard", amountCents: 700, currency: "usd" }, retry_after_seconds: 5 }, error: null })
      : original(name, ...args));
    await expect(createStripeCheckoutSession()).resolves.toMatchObject({ sessionId });
    expect(boundary.retrieveShipping).not.toHaveBeenCalled();
    expect(boundary.rpc).toHaveBeenCalledWith("reserve_checkout_order_snapshot_v2", expect.objectContaining({ p_shipping_cents: 700, p_total_cents: 3200 }));
  });
  it("coalesces same-key provider retries even though their create quota is free", async () => {
    useCheckoutFixture({ metadata: { stripe_idempotency_key: `stripe-session:${orderId}:initial` } });
    const original = boundary.rpc.getMockImplementation()!;
    boundary.rpc.mockImplementation((name, ...args) => {
      if (name === "admit_checkout_creation") return Promise.resolve({ data: { allowed: true, replay: true, retry_after_seconds: 0 }, error: null });
      if (name === "claim_checkout_refresh") return Promise.resolve({ data: { allowed: false, token: null, cached: null, retry_after_seconds: 5 }, error: null });
      return original(name, ...args);
    });
    const error = await createStripeCheckoutSession().catch((value: unknown) => value);
    expect(checkoutErrorResponseMessage(error)).toMatchObject({ status: 429, retryAfterSeconds: 5 });
    expect(boundary.createSession).not.toHaveBeenCalled();
    expect(boundary.rpc.mock.calls.some(([name]) => name === "fail_checkout_attempt")).toBe(false);
  });
  it("rejects a fully discounted zero-total quote before provider creation", async () => {
    vi.stubEnv("STRIPE_STANDARD_SHIPPING_RATE_ID", "shr_standard");
    vi.stubEnv("STRIPE_REWARD_200_COUPON_ID", "coupon_points_200");
    useCheckoutFixture({}, 500);
    boundary.identity.mockResolvedValue({ id: "user-1", email: "customer@example.test" });
    boundary.retrieveShipping.mockResolvedValue({ id: "shr_standard", livemode: false, fixed_amount: { amount: 0, currency: "usd" } });
    const originalFrom = boundary.from.getMockImplementation()!;
    boundary.from.mockImplementation((table) => table === "rewards_accounts" ? queryResult({ points_balance: 200 }) : originalFrom(table));
    const original = boundary.rpc.getMockImplementation()!;
    boundary.rpc.mockImplementation((name, ...args) => name === "ensure_rewards_account" ? Promise.resolve({ data: null, error: null }) : original(name, ...args));
    const error = await createStripeCheckoutSession({ rewardTierId: "points_200" }).catch((value: unknown) => value);
    expect(checkoutErrorResponseMessage(error)).toEqual({ status: 400, message: "Zero-total sandbox checkout is not supported. Remove the reward or add another item." });
    expect(boundary.createSession).not.toHaveBeenCalled();
    expect(boundary.createCustomer).not.toHaveBeenCalled();
    expect(boundary.rpc.mock.calls.some(([name]) => name === "reserve_checkout_order_snapshot_v2")).toBe(false);
  });
  it("keeps the cancellation capability available after an uncertain provider failure", async () => {
    vi.stubEnv("CHECKOUT_ENABLED", "false");
    useCheckoutFixture({ stripe_checkout_session_id: sessionId });
    boundary.cookieGet.mockImplementation((name) => ({ value: name === CHECKOUT_CANCEL_COOKIE ? orderId : "guest-bearer" }));
    boundary.retrieveSession.mockRejectedValue(new Error("temporary provider connection failure"));
    await expect(cancelPendingCheckoutFromCookie()).rejects.toThrow("temporary provider connection failure");
    expect(boundary.cookieSet).not.toHaveBeenCalledWith(CHECKOUT_CANCEL_COOKIE, "", expect.any(Object));
    expect(boundary.createSession).not.toHaveBeenCalled();
  });
  it("does not overwrite a newer refresh after a retry lease loses ownership", async () => {
    useCheckoutFixture();
    const original = boundary.rpc.getMockImplementation()!;
    boundary.rpc.mockImplementation((name, ...args) => {
      if (name === "admit_checkout_creation") return Promise.resolve({ data: { allowed: true, replay: true, retry_after_seconds: 0 }, error: null });
      if (name === "finish_checkout_refresh") return Promise.resolve({ data: false, error: null });
      return original(name, ...args);
    });
    const error = await createStripeCheckoutSession().catch((value: unknown) => value);
    expect(checkoutErrorResponseMessage(error)).toMatchObject({ status: 503 });
    expect(boundary.createSession).toHaveBeenCalledOnce();
    expect(boundary.rpc.mock.calls.some(([name]) => name === "cache_created_checkout_session")).toBe(false);
    expect(boundary.rpc.mock.calls.some(([name]) => name === "fail_checkout_attempt")).toBe(false);
  });
  it("fails closed and redacts admission storage errors before provider writes", async () => {
    useCheckoutFixture();
    const original = boundary.rpc.getMockImplementation()!;
    boundary.rpc.mockImplementation((name, ...args) => name === "admit_checkout_creation"
      ? Promise.resolve({ data: null, error: { message: "private@example.test database detail" } }) : original(name, ...args));
    const error = await createStripeCheckoutSession().catch((value: unknown) => value);
    expect(checkoutErrorResponseMessage(error)).toMatchObject({ status: 503 });
    expect(JSON.stringify(checkoutErrorResponseMessage(error))).not.toContain("private");
    expect(boundary.createSession).not.toHaveBeenCalled();
    expect(boundary.createCustomer).not.toHaveBeenCalled();
  });
  it("keeps owned stored status available when refresh storage is unavailable", async () => {
    boundary.rpc.mockImplementation(async (name) => name === "resolve_active_cart"
      ? { data: [{ cart_id: cartId, user_id: null, status: "active" }], error: null }
      : { data: null, error: { message: "admission store unavailable" } });
    expect(await getOrderConfirmationBySession(sessionId)).toMatchObject({ order: { status: "pending_payment" } });
    expect(boundary.retrieveSession).not.toHaveBeenCalled();
  });
  it.each([
    { status: "complete", payment_status: "paid", expires_at: 2000000000 },
    { status: "expired", payment_status: "unpaid", expires_at: 1 },
  ])("never finalizes or replaces from cached $status observations", async (state) => {
    const { session } = useCheckoutFixture({ stripe_checkout_session_id: sessionId });
    const original = boundary.rpc.getMockImplementation()!;
    boundary.rpc.mockImplementation((name, ...args) => name === "claim_checkout_refresh"
      ? Promise.resolve({ data: { allowed: false, token: null, cached: { ...session, ...state, kind: "session" }, retry_after_seconds: 5 }, error: null })
      : original(name, ...args));
    const error = await createStripeCheckoutSession().catch((value: unknown) => value);
    expect(checkoutErrorResponseMessage(error)).toMatchObject({ status: 429 });
    expect(boundary.createSession).not.toHaveBeenCalled();
    expect(boundary.rpc.mock.calls.some(([name]) => name === "finalize_paid_checkout_order")).toBe(false);
  });
  it("does not replace a verified expired Session while new checkout is disabled", async () => {
    vi.stubEnv("CHECKOUT_ENABLED", "false");
    const { session } = useCheckoutFixture({ stripe_checkout_session_id: sessionId });
    boundary.retrieveSession.mockResolvedValue({ ...session, status: "expired", expires_at: 1, url: null });
    await expect(createStripeCheckoutSession()).rejects.toThrow("not enabled");
    expect(boundary.createSession).not.toHaveBeenCalled();
    expect(boundary.rpc.mock.calls.some(([name]) => name === "prepare_checkout_attempt")).toBe(false);
  });
  it("does not retrieve shipping or create a Session when refresh has no verified quote", async () => {
    vi.stubEnv("STRIPE_STANDARD_SHIPPING_RATE_ID", "shr_standard");
    useCheckoutFixture({}, 2500);
    const original = boundary.rpc.getMockImplementation()!;
    boundary.rpc.mockImplementation((name, ...args) => name === "claim_checkout_refresh"
      ? Promise.resolve({ data: { allowed: false, token: null, cached: null, retry_after_seconds: 5 }, error: null }) : original(name, ...args));
    const error = await createStripeCheckoutSession().catch((value: unknown) => value);
    expect(checkoutErrorResponseMessage(error)).toMatchObject({ status: 429 });
    expect(boundary.retrieveShipping).not.toHaveBeenCalled();
    expect(boundary.createSession).not.toHaveBeenCalled();
  });
  it("retains cancellation for a previously accepted delayed-method payment", async () => {
    vi.stubEnv("CHECKOUT_ENABLED", "false");
    const { session } = useCheckoutFixture({ stripe_checkout_session_id: sessionId });
    boundary.cookieGet.mockImplementation((name) => ({ value: name === CHECKOUT_CANCEL_COOKIE ? orderId : "guest-bearer" }));
    boundary.retrieveSession.mockResolvedValue({ ...session, status: "complete", payment_method_types: ["afterpay_clearpay"] });
    await expect(cancelPendingCheckoutFromCookie()).resolves.toEqual({ status: "processing" });
    expect(boundary.cookieSet).not.toHaveBeenCalledWith(CHECKOUT_CANCEL_COOKIE, "", expect.any(Object));
    expect(boundary.expireSession).not.toHaveBeenCalled();
    expect(boundary.rpc.mock.calls.some(([name]) => name === "admit_checkout_creation" || name === "claim_checkout_refresh")).toBe(false);
  });
  it("preserves the accepted attempt key when reopening its Session", async () => {
    const recordedKey = `stripe-session:${orderId}:initial`;
    useCheckoutFixture({ stripe_checkout_session_id: sessionId, metadata: { stripe_idempotency_key: recordedKey } });
    await createStripeCheckoutSession();
    expect(boundary.rpc).toHaveBeenCalledWith("prepare_checkout_attempt", expect.objectContaining({
      p_detach_session: false, p_expected_session_id: sessionId, p_stripe_idempotency_key: recordedKey,
    }));
  });
  it("reopens a rewarded Session using its existing reservation despite zero unreserved points", async () => {
    vi.stubEnv("STRIPE_REWARD_200_COUPON_ID", "coupon_points_200");
    useCheckoutFixture({ stripe_checkout_session_id: sessionId, user_id: "user-1" });
    boundary.identity.mockResolvedValue({ id: "user-1", email: "customer@example.test" });
    const originalFrom = boundary.from.getMockImplementation()!;
    boundary.from.mockImplementation((table) => {
      if (table === "rewards_accounts") return queryResult({ points_balance: 0 });
      if (table === "rewards_reservations") return queryResult([{ id: "reservation-existing", status: "applied" }]);
      return originalFrom(table);
    });
    const original = boundary.rpc.getMockImplementation()!;
    boundary.rpc.mockImplementation((name, ...args) => name === "ensure_rewards_account"
      ? Promise.resolve({ data: null, error: null }) : original(name, ...args));

    await expect(createStripeCheckoutSession({ rewardTierId: "points_200" })).resolves.toMatchObject({ sessionId });
    expect(boundary.createSession).not.toHaveBeenCalled();
    expect(boundary.rpc.mock.calls.some(([name]) => name === "reserve_rewards_points")).toBe(false);
  });
  it("blocks new provider writes when transactional reward reservation has insufficient points", async () => {
    vi.stubEnv("STRIPE_REWARD_200_COUPON_ID", "coupon_points_200");
    useCheckoutFixture({ user_id: "user-1" });
    boundary.identity.mockResolvedValue({ id: "user-1", email: "customer@example.test" });
    const originalFrom = boundary.from.getMockImplementation()!;
    boundary.from.mockImplementation((table) => table === "rewards_reservations" ? queryResult([]) : originalFrom(table));
    const original = boundary.rpc.getMockImplementation()!;
    boundary.rpc.mockImplementation((name, ...args) => name === "reserve_rewards_points"
      ? Promise.resolve({ data: null, error: { code: "P0001", message: "Insufficient Available Points Balance" } })
      : original(name, ...args));

    const error = await createStripeCheckoutSession({ rewardTierId: "points_200" }).catch((value: unknown) => value);
    expect(checkoutErrorResponseMessage(error)).toEqual({ status: 400, message: "Selected points reward is no longer available." });
    expect(boundary.rpc).toHaveBeenCalledWith("reserve_rewards_points", expect.objectContaining({ p_order_id: orderId, p_user_id: "user-1", p_points: 200 }));
    expect(boundary.createSession).not.toHaveBeenCalled();
    expect(boundary.createCustomer).not.toHaveBeenCalled();
  });
});
