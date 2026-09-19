import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import { createHash } from "node:crypto";
import type { AcceptedCheckoutContract } from "@/lib/checkout/payment-verification";

const boundary = vi.hoisted(() => ({
  cookieGet: vi.fn(), cookieSet: vi.fn(), identity: vi.fn(),
  retrieveSession: vi.fn(), createSession: vi.fn(), expireSession: vi.fn(), retrieveShipping: vi.fn(),
  createCustomer: vi.fn(), retrieveAccount: vi.fn(), listLineItems: vi.fn(),
  authorizeReceipt: vi.fn(), rpc: vi.fn(), from: vi.fn(),
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
    checkout: { sessions: { retrieve: boundary.retrieveSession, create: boundary.createSession, expire: boundary.expireSession, listLineItems: boundary.listLineItems } },
    accounts: { retrieve: boundary.retrieveAccount },
    shippingRates: { retrieve: boundary.retrieveShipping },
    customers: { create: boundary.createCustomer },
  }),
}));

import { cancelPendingCheckoutFromCookie, checkoutErrorResponseMessage, createStripeCheckoutSession, getOrderConfirmationBySession } from "@/lib/orders/server";
import { CHECKOUT_RECEIPT_COOKIE, GUEST_CART_COOKIE } from "@/lib/customer-state-identifiers";
import { CHECKOUT_CANCEL_COOKIE } from "@/lib/orders/checkout-cancel";

const cartId = "00000000-0000-4000-8000-000000000041";
const orderId = "00000000-0000-4000-8000-000000000042";
const sessionId = "cs_test_owned_session";
const accountId = "acct_1Tm9WRFEzyaKzdmq";
const attemptId = "00000000-0000-4000-8000-000000000046";
const guestToken = Buffer.alloc(32, 1).toString("base64url");
const refreshToken = "00000000-0000-4000-8000-000000000045";
const order = { id: orderId, cart_id: cartId, user_id: null, status: "pending_payment",
  stripe_checkout_session_id: sessionId, total_cents: 5500, merchandise_subtotal_cents: 5500,
  discount_cents: 0, shipping_cents: 0, tax_cents: 0, shipping_address: {}, shipping_name: null,
  reward_points_earned: 0, reward_points_redeemed: 0, metadata: {}, order_number: "HX-42" };
const orderLine = { id: "line-1", product_id: "product-1", product_slug: "super-serum",
  product_name: "Super Serum", variant_key: "30ml", variant_label: "30 mL", quantity: 1,
  unit_price_cents: 5500, line_subtotal_cents: 5500 };

function paymentContract(overrides: Partial<AcceptedCheckoutContract> = {}): AcceptedCheckoutContract {
  return { version: "checkout_v1", legacyEligible: true, orderId, attemptId: null, sessionId,
    accountId, apiVersion: "2026-06-24.dahlia", environment: "sandbox", currency: "USD",
    customerId: null, lines: [{ productId: "product-1", productSlug: "super-serum",
      variantKey: "30ml", quantity: 1, unitAmountCents: 5500 }], merchandiseSubtotalCents: 5500,
    discountCents: 0, shippingCents: 0, preTaxTotalCents: 5500, couponId: null,
    shippingRateId: null, freeShipping: true, automaticTaxEnabled: false, taxBehavior: "unspecified", ...overrides };
}

function providerSession() {
  return { object: "checkout.session", id: sessionId, status: "open", payment_status: "unpaid", livemode: false,
    mode: "payment", currency: "usd", client_reference_id: orderId, amount_total: 5500,
    metadata: { order_id: orderId, environment: "sandbox", schema: "checkout_v1" }, payment_intent: null,
    expires_at: Math.floor(Date.now() / 1000) + 1800,
    url: "https://checkout.stripe.com/c/pay/private", payment_method_types: ["card"] } satisfies Partial<Stripe.Checkout.Session>;
}

function cachedSession(session: ReturnType<typeof providerSession>) {
  return { kind: "session", id: session.id, status: session.status, payment_status: session.payment_status,
    expires_at: session.expires_at, url: session.url, livemode: session.livemode, payment_method_types: session.payment_method_types };
}

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
  vi.resetAllMocks();
  vi.stubEnv("CHECKOUT_ENABLED", "true");
  vi.stubEnv("STRIPE_ACCOUNT_ID", "acct_1Tm9WRFEzyaKzdmq");
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_boundary");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_boundary");
  boundary.identity.mockResolvedValue(null);
  boundary.retrieveAccount.mockResolvedValue({ id: accountId });
  boundary.listLineItems.mockResolvedValue({ object: "list", data: [], has_more: false });
  boundary.authorizeReceipt.mockReturnValue(false);
  boundary.cookieGet.mockImplementation((name: string) => name === GUEST_CART_COOKIE ? { value: guestToken } : undefined);
  boundary.retrieveSession.mockResolvedValue(providerSession());
  boundary.from.mockImplementation((table: string) => queryResult(table === "orders" ? order : []));
  boundary.rpc.mockImplementation(async (name: string, args) => {
    const storage = storageResult(name, args);
    if (storage) return storage;
    if (name === "resolve_active_cart") return { data: [{ cart_id: "another-cart", user_id: null, status: "active" }], error: null };
    const refresh = refreshResult(name);
    if (refresh) return refresh;
    throw new Error(`Unexpected database operation: ${name}`);
  });
});
afterEach(() => vi.unstubAllEnvs());

function storageResult(name: string, args: Record<string, unknown> = {}) {
  if (name === "authorize_checkout_receipt") return { data: boundary.authorizeReceipt(args), error: null };
  if (name === "read_checkout_payment_contract") return { data: paymentContract(), error: null };
  if (name === "read_checkout_payment_exception") return { data: null, error: null };
  if (name === "bind_guest_checkout_receipt") return { data: { allowed: true, reused: false,
    expires_at: new Date(Date.now() + 86_400_000).toISOString(), retry_after_seconds: 0 }, error: null };
  if (name === "prepare_checkout_payment_contract") return { data: { ...paymentContract(),
    ...(args.p_terms as Record<string, unknown>), version: "checkout_v2", legacyEligible: false, attemptId, sessionId: null,
  }, error: null };
  if (["bind_checkout_payment_session", "record_checkout_payment_exception"].includes(name)) return { data: true, error: null };
  return null;
}

function allowOwnedReceipt() {
  boundary.authorizeReceipt.mockImplementation((args) => args.p_account_id === accountId
    && args.p_order_id === orderId && args.p_session_id === sessionId
    && args.p_guest_token_hash === createHash("sha256").update(guestToken).digest("hex"));
}

function refreshResult(name: string) {
  if (name === "claim_checkout_refresh") return { data: { allowed: true, token: refreshToken, cached: null, retry_after_seconds: 0 }, error: null };
  if (["finish_checkout_refresh", "cache_created_checkout_session"].includes(name)) return { data: true, error: null };
  return null;
}

function useCheckoutFixture(overrides: Record<string, unknown> = {}, priceCents = 5500) {
  const activeOrder = { ...order, stripe_checkout_session_id: null, ...overrides };
  const session = providerSession();
  allowOwnedReceipt();
  boundary.createSession.mockImplementation(async (params: Stripe.Checkout.SessionCreateParams) => ({
    ...session, metadata: params.metadata, client_reference_id: params.client_reference_id,
  }));
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
    if (table === "stripe_customers") return queryResult(null);
    if (table === "order_items") return queryResult([{ ...orderLine, unit_price_cents: priceCents, line_subtotal_cents: priceCents }]);
    throw new Error(`Unexpected table: ${table}`);
  });
  boundary.rpc.mockImplementation((name: string, args) => {
    const storage = storageResult(name, args);
    if (storage) return Promise.resolve(storage);
    if (name === "resolve_active_cart") return Promise.resolve({ data: [{ cart_id: cartId, user_id: null, status: "active" }], error: null });
    if (name === "reserve_checkout_order_snapshot_v2") {
      Object.assign(activeOrder, { merchandise_subtotal_cents: args.p_merchandise_subtotal_cents,
        discount_cents: args.p_discount_cents, shipping_cents: args.p_shipping_cents, total_cents: args.p_total_cents });
      return queryResult(activeOrder);
    }
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

function rpcCallOrder(name: string): number {
  const index = boundary.rpc.mock.calls.findIndex(([operation]) => operation === name);
  expect(index, `${name} must be called`).toBeGreaterThanOrEqual(0);
  return boundary.rpc.mock.invocationCallOrder[index];
}

describe("customer checkout admission", () => {
  it("does not disclose or retrieve an order's Session for another guest cart", async () => {
    expect(await getOrderConfirmationBySession(sessionId)).toBeNull();
    expect(boundary.retrieveSession).not.toHaveBeenCalled();
    expect(boundary.retrieveAccount).not.toHaveBeenCalled();
    expect(boundary.from).toHaveBeenCalledExactlyOnceWith("orders");
    expect(boundary.from.mock.results[0].value.select).toHaveBeenCalledExactlyOnceWith("id");
    expect(boundary.rpc).toHaveBeenCalledExactlyOnceWith("authorize_checkout_receipt", expect.objectContaining({
      p_order_id: orderId, p_session_id: sessionId, p_guest_token_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
    }));
  });
  it("continues owned status retrieval with new checkout disabled", async () => {
    vi.stubEnv("CHECKOUT_ENABLED", "false");
    allowOwnedReceipt();
    // Authorization is granted by the receipt RPC, independently of the active cart.
    expect(boundary.authorizeReceipt).not.toHaveBeenCalled();
    const confirmation = await getOrderConfirmationBySession(sessionId);
    expect(confirmation).toMatchObject({ order: { status: "pending_payment" }, state: "pending" });
    expect(boundary.retrieveSession).toHaveBeenCalledWith(sessionId, expect.objectContaining({ expand: expect.any(Array) }), expect.any(Object));
    expect(boundary.listLineItems).toHaveBeenCalledOnce();
  });
  it("creates card-only Sessions and records the actual accepted method policy", async () => {
    useCheckoutFixture();
    const result = await createStripeCheckoutSession();
    expect(result).toMatchObject({ orderId, sessionId });
    expect(boundary.createSession).toHaveBeenCalledWith(expect.objectContaining({ payment_method_types: ["card"] }), expect.any(Object));
    expect(boundary.rpc).toHaveBeenCalledWith("prepare_checkout_payment_contract", expect.objectContaining({
      p_order_id: orderId, p_terms: expect.objectContaining({ accountId, currency: "USD", merchandiseSubtotalCents: 5500 }),
    }));
    expect(boundary.from.mock.calls.some(([table]) => table === "payment_attempts")).toBe(false);
  });
  it("verifies the Stripe account and binds receipt and immutable terms before exposing a new Session", async () => {
    useCheckoutFixture();
    const result = await createStripeCheckoutSession();
    expect(result).toMatchObject({ sessionId });
    expect(boundary.retrieveAccount).toHaveBeenCalledWith(null, {}, expect.objectContaining({ apiVersion: "2026-06-24.dahlia" }));
    const createOrder = boundary.createSession.mock.invocationCallOrder[0];
    expect(boundary.retrieveAccount.mock.invocationCallOrder[0]).toBeLessThan(createOrder);
    expect(rpcCallOrder("bind_guest_checkout_receipt")).toBeLessThan(createOrder);
    expect(rpcCallOrder("prepare_checkout_payment_contract")).toBeLessThan(createOrder);
    expect(boundary.cookieSet).toHaveBeenCalledWith(CHECKOUT_RECEIPT_COOKIE, expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      expect.objectContaining({ httpOnly: true, sameSite: "lax", path: "/", expires: expect.any(Date) }));
    const receiptCookieIndex = boundary.cookieSet.mock.calls.findIndex(([name]) => name === CHECKOUT_RECEIPT_COOKIE);
    expect(boundary.cookieSet.mock.invocationCallOrder[receiptCookieIndex]).toBeLessThan(createOrder);
    expect(boundary.createSession).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({ order_id: orderId, attempt_id: attemptId, schema: "checkout_v2" }),
      payment_intent_data: { metadata: { order_id: orderId, attempt_id: attemptId, schema: "checkout_v2", environment: "sandbox" } },
      line_items: [expect.objectContaining({ quantity: 1, price_data: expect.objectContaining({ unit_amount: 5500,
        product_data: expect.objectContaining({ metadata: expect.objectContaining({ order_line_id: orderLine.id }) }) }) })],
    }), expect.any(Object));
    expect(boundary.rpc).toHaveBeenCalledWith("bind_checkout_payment_session", expect.objectContaining({
      p_order_id: orderId, p_attempt_id: attemptId, p_session_id: sessionId,
    }));
    expect(rpcCallOrder("bind_checkout_payment_session")).toBeGreaterThan(createOrder);
  });
  it("rejects a wrong Stripe account before customer or Session writes", async () => {
    useCheckoutFixture({ user_id: "user-1" });
    boundary.identity.mockResolvedValue({ id: "user-1", email: "customer@example.test" });
    boundary.retrieveAccount.mockResolvedValue({ id: "acct_wrong_sandbox_account" });
    await expect(createStripeCheckoutSession()).rejects.toThrow("Payment provider account could not be verified.");
    expect(boundary.createCustomer).not.toHaveBeenCalled();
    expect(boundary.createSession).not.toHaveBeenCalled();
    expect(boundary.rpc.mock.calls.some(([name]) => name === "prepare_checkout_payment_contract")).toBe(false);
  });
  it("verifies account provenance before creating a returning customer's Stripe mapping", async () => {
    useCheckoutFixture({ user_id: "user-1" });
    boundary.identity.mockResolvedValue({ id: "user-1", email: "customer@example.test" });
    boundary.createCustomer.mockResolvedValue({ id: "cus_test_customer", livemode: false });
    await expect(createStripeCheckoutSession()).resolves.toMatchObject({ sessionId });
    expect(boundary.retrieveAccount.mock.invocationCallOrder[0]).toBeLessThan(boundary.createCustomer.mock.invocationCallOrder[0]);
    expect(boundary.rpc).toHaveBeenCalledWith("prepare_checkout_payment_contract", expect.objectContaining({
      p_terms: expect.objectContaining({ customerId: "cus_test_customer" }),
    }));
    expect(boundary.rpc.mock.calls.some(([name]) => name === "bind_guest_checkout_receipt")).toBe(false);
  });
  it("does not create a Session when immutable payment terms cannot be stored", async () => {
    useCheckoutFixture();
    const original = boundary.rpc.getMockImplementation()!;
    boundary.rpc.mockImplementation((name, ...args) => name === "prepare_checkout_payment_contract"
      ? Promise.resolve({ data: null, error: { message: "private storage failure" } }) : original(name, ...args));
    await expect(createStripeCheckoutSession()).rejects.toThrow("Payment verification is temporarily unavailable.");
    expect(boundary.createSession).not.toHaveBeenCalled();
    expect(boundary.rpc.mock.calls.some(([name]) => name === "bind_checkout_payment_session")).toBe(false);
  });
  it.each([null, sessionId])("does not expose a payable URL when receipt prebinding fails (existing Session: %s)", async (existingSessionId) => {
    useCheckoutFixture({ stripe_checkout_session_id: existingSessionId });
    const original = boundary.rpc.getMockImplementation()!;
    boundary.rpc.mockImplementation((name, ...args) => name === "bind_guest_checkout_receipt"
      ? Promise.resolve({ data: null, error: { message: "receipt storage failure" } }) : original(name, ...args));
    const error = await createStripeCheckoutSession().catch((value: unknown) => value);
    expect(checkoutErrorResponseMessage(error)).toMatchObject({ status: 503 });
    expect(boundary.createSession).not.toHaveBeenCalled();
    expect(boundary.cookieSet).not.toHaveBeenCalledWith(CHECKOUT_CANCEL_COOKIE, expect.anything(), expect.anything());
  });
  it("retains the locally accepted version-two attempt identity when replaying a Session", async () => {
    const recordedKey = `stripe-session:${orderId}:initial`;
    const { session } = useCheckoutFixture({ stripe_checkout_session_id: sessionId, metadata: { stripe_idempotency_key: recordedKey } });
    boundary.retrieveSession.mockResolvedValue({ ...session,
      metadata: { order_id: orderId, environment: "sandbox", schema: "checkout_v2", attempt_id: attemptId } });
    const original = boundary.rpc.getMockImplementation()!;
    boundary.rpc.mockImplementation((name, ...args) => name === "read_checkout_payment_contract"
      ? Promise.resolve({ data: paymentContract({ version: "checkout_v2", legacyEligible: false, attemptId }), error: null })
      : original(name, ...args));
    await expect(createStripeCheckoutSession()).resolves.toMatchObject({ sessionId, url: session.url });
    expect(boundary.createSession).not.toHaveBeenCalled();
    expect(boundary.from.mock.calls.some(([table]) => table === "payment_attempts")).toBe(false);
    expect(boundary.rpc.mock.calls.some(([name]) => name === "prepare_checkout_payment_contract")).toBe(false);
    expect(boundary.rpc).toHaveBeenCalledWith("prepare_checkout_attempt", expect.objectContaining({
      p_detach_session: false, p_stripe_idempotency_key: recordedKey,
    }));
    expect(boundary.cookieSet).toHaveBeenCalledWith(CHECKOUT_RECEIPT_COOKIE, expect.any(String), expect.objectContaining({ path: "/" }));
  });
  it("keeps cancellation processing when Stripe expiration fails without a second unbudgeted read", async () => {
    useCheckoutFixture({ stripe_checkout_session_id: sessionId });
    boundary.cookieGet.mockImplementation((name) => name === CHECKOUT_CANCEL_COOKIE ? { value: orderId }
      : name === GUEST_CART_COOKIE ? { value: guestToken } : undefined);
    boundary.expireSession.mockRejectedValue(new Error("uncertain expiration result"));
    await expect(cancelPendingCheckoutFromCookie()).resolves.toEqual({ status: "processing" });
    expect(boundary.retrieveSession).toHaveBeenCalledOnce();
    expect(boundary.expireSession).toHaveBeenCalledExactlyOnceWith(sessionId,
      expect.objectContaining({ expand: expect.arrayContaining(["payment_intent.payment_method"]) }),
      expect.objectContaining({ timeout: 4000, maxNetworkRetries: 0 }));
    expect(boundary.rpc.mock.calls.filter(([name]) => name === "claim_checkout_refresh")).toHaveLength(1);
    expect(boundary.cookieSet).not.toHaveBeenCalledWith(CHECKOUT_CANCEL_COOKIE, "", expect.any(Object));
  });
  it("cancels an incomplete authentication payment and reaches the atomic reservation release", async () => {
    const userId = "00000000-0000-4000-8000-000000000047";
    const { session, activeOrder } = useCheckoutFixture({ stripe_checkout_session_id: sessionId,
      user_id: userId, reward_points_redeemed: 200, discount_cents: 500, total_cents: 5000 });
    boundary.identity.mockResolvedValue({ id: userId, email: "customer@example.test" });
    boundary.authorizeReceipt.mockImplementation((args) => args.p_order_id === orderId && args.p_user_id === userId);
    boundary.cookieGet.mockImplementation((name) => name === CHECKOUT_CANCEL_COOKIE ? { value: orderId } : undefined);
    const metadata = { order_id: orderId, environment: "sandbox", schema: "checkout_v2", attempt_id: attemptId };
    const intent = { id: "pi_incomplete_authentication", object: "payment_intent", livemode: false,
      currency: "usd", status: "requires_action", customer: "cus_owned_checkout", metadata };
    const open = { ...session, metadata, customer: intent.customer, payment_intent: intent, amount_total: 5000 };
    boundary.retrieveSession.mockResolvedValue(open);
    // Stripe returns IDs for expandable fields unless this request asks for their objects.
    boundary.expireSession.mockImplementation(async (_id: string, params?: Stripe.Checkout.SessionExpireParams) => ({
      ...open, status: "expired", url: null,
      payment_intent: params?.expand?.includes("payment_intent.payment_method") ? { ...intent, status: "canceled" } : intent.id,
    }));
    const originalRpc = boundary.rpc.getMockImplementation()!;
    let exception: { code: string; paymentStatus: string; paymentIntentId: string; amountCents: number } | null = null;
    boundary.rpc.mockImplementation((name, args) => {
      if (name === "read_checkout_payment_contract") return Promise.resolve({ data: paymentContract({
        version: "checkout_v2", legacyEligible: false, attemptId, customerId: intent.customer,
        discountCents: 500, preTaxTotalCents: 5000, couponId: "coupon_points_200",
      }), error: null });
      if (name === "record_checkout_payment_exception") {
        exception = { code: args.p_code, paymentStatus: args.p_payment_status,
          paymentIntentId: args.p_payment_intent_id, amountCents: args.p_amount_cents };
        return Promise.resolve({ data: true, error: null });
      }
      if (name === "read_checkout_payment_exception") return Promise.resolve({ data: exception, error: null });
      if (name === "expire_checkout_order_from_stripe") {
        activeOrder.status = "cancelled";
        return Promise.resolve({ data: true, error: null });
      }
      return originalRpc(name, args);
    });

    await expect(cancelPendingCheckoutFromCookie()).resolves.toEqual({ status: "cancelled" });

    expect(boundary.rpc).toHaveBeenCalledWith("expire_checkout_order_from_stripe", {
      p_order_id: orderId, p_session_id: sessionId, p_reason: "Stripe Checkout expiration",
    });
    expect(boundary.rpc.mock.calls.filter(([name]) => name === "expire_checkout_order_from_stripe")).toHaveLength(1);
    expect(boundary.rpc.mock.calls.some(([name]) => name === "record_checkout_payment_exception" ||
      name === "finalize_verified_checkout_payment" || name === "clear_paid_order_cart" || name === "award_rewards_points")).toBe(false);
    expect(boundary.retrieveSession).toHaveBeenCalledOnce();
    expect(boundary.rpc.mock.calls.filter(([name]) => name === "claim_checkout_refresh")).toHaveLength(1);
    expect(boundary.cookieSet).toHaveBeenCalledWith(CHECKOUT_CANCEL_COOKIE, "", expect.objectContaining({ maxAge: 0, httpOnly: true }));
  });
  it("records contradictory provider ownership instead of expiring an unrelated open Session", async () => {
    const { session } = useCheckoutFixture({ stripe_checkout_session_id: sessionId });
    boundary.cookieGet.mockImplementation((name) => name === CHECKOUT_CANCEL_COOKIE ? { value: orderId }
      : name === GUEST_CART_COOKIE ? { value: guestToken } : undefined);
    boundary.retrieveSession.mockResolvedValue({ ...session,
      metadata: { order_id: "another-order", environment: "sandbox", schema: "checkout_v1" } });
    const original = boundary.rpc.getMockImplementation()!;
    let storedException: { code: string; paymentStatus: string; paymentIntentId: null; amountCents: number } | null = null;
    boundary.rpc.mockImplementation((name, args) => {
      if (name === "record_checkout_payment_exception") {
        storedException = { code: args.p_code, paymentStatus: args.p_payment_status, paymentIntentId: args.p_payment_intent_id, amountCents: args.p_amount_cents };
        return Promise.resolve({ data: true, error: null });
      }
      if (name === "read_checkout_payment_exception") return Promise.resolve({ data: storedException, error: null });
      return original(name, args);
    });
    await expect(cancelPendingCheckoutFromCookie()).resolves.toEqual({ status: "processing" });
    expect(boundary.rpc).toHaveBeenCalledWith("record_checkout_payment_exception", expect.objectContaining({
      p_order_id: orderId, p_session_id: sessionId, p_code: "session_identity_mismatch", p_payment_status: "unpaid",
    }));
    expect(boundary.expireSession).not.toHaveBeenCalled();
    expect(boundary.cookieSet).not.toHaveBeenCalledWith(CHECKOUT_CANCEL_COOKIE, "", expect.any(Object));
  });
  it("retains an existing genuine payment exception when cancellation is requested", async () => {
    useCheckoutFixture({ stripe_checkout_session_id: sessionId });
    boundary.cookieGet.mockImplementation((name) => name === CHECKOUT_CANCEL_COOKIE ? { value: orderId }
      : name === GUEST_CART_COOKIE ? { value: guestToken } : undefined);
    const originalRpc = boundary.rpc.getMockImplementation()!;
    boundary.rpc.mockImplementation((name, args) => name === "read_checkout_payment_exception"
      ? Promise.resolve({ data: { code: "amount_mismatch", paymentStatus: "paid",
        paymentIntentId: "pi_requires_review", amountCents: 5500 }, error: null }) : originalRpc(name, args));

    await expect(cancelPendingCheckoutFromCookie()).resolves.toEqual({ status: "processing" });

    expect(boundary.expireSession).not.toHaveBeenCalled();
    expect(boundary.rpc.mock.calls.some(([name]) => name === "resolve_checkout_payment_exceptions" ||
      name === "expire_checkout_order_from_stripe")).toBe(false);
    expect(boundary.cookieSet).not.toHaveBeenCalledWith(CHECKOUT_CANCEL_COOKIE, "", expect.any(Object));
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
    allowOwnedReceipt();
    const original = boundary.rpc.getMockImplementation()!;
    boundary.rpc.mockImplementation((name, ...args) => name === "claim_checkout_refresh"
      ? Promise.resolve({ data: { allowed: false, token: null, cached: null, retry_after_seconds: 5 }, error: null })
      : original(name, ...args));
    expect(await getOrderConfirmationBySession(sessionId)).toMatchObject({ order: { status: "pending_payment" }, state: "pending" });
    expect(boundary.retrieveSession).not.toHaveBeenCalled();
  });
  it("reuses only an unexpired cached payable URL while replay refresh is deferred", async () => {
    const { session } = useCheckoutFixture({ stripe_checkout_session_id: sessionId });
    const original = boundary.rpc.getMockImplementation()!;
    boundary.rpc.mockImplementation((name, ...args) => name === "claim_checkout_refresh"
      ? Promise.resolve({ data: { allowed: false, token: null, cached: { ...cachedSession(session), payment_method_types: ["afterpay_clearpay"] }, retry_after_seconds: 5 }, error: null })
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
    boundary.cookieGet.mockImplementation((name) => ({ value: name === CHECKOUT_CANCEL_COOKIE ? orderId : guestToken }));
    boundary.retrieveSession.mockRejectedValue(new Error("temporary provider connection failure"));
    await expect(cancelPendingCheckoutFromCookie()).rejects.toThrow("Payment provider could not be reached.");
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
    allowOwnedReceipt();
    const original = boundary.rpc.getMockImplementation()!;
    boundary.rpc.mockImplementation((name, ...args) => name === "claim_checkout_refresh"
      ? Promise.resolve({ data: null, error: { message: "admission store unavailable" } })
      : original(name, ...args));
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
      ? Promise.resolve({ data: { allowed: false, token: null, cached: { ...cachedSession(session), ...state }, retry_after_seconds: 5 }, error: null })
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
    boundary.cookieGet.mockImplementation((name) => ({ value: name === CHECKOUT_CANCEL_COOKIE ? orderId : guestToken }));
    boundary.retrieveSession.mockResolvedValue({ ...session, status: "complete", payment_method_types: ["afterpay_clearpay"] });
    await expect(cancelPendingCheckoutFromCookie()).resolves.toEqual({ status: "processing" });
    expect(boundary.cookieSet).not.toHaveBeenCalledWith(CHECKOUT_CANCEL_COOKIE, "", expect.any(Object));
    expect(boundary.expireSession).not.toHaveBeenCalled();
    expect(boundary.rpc.mock.calls.some(([name]) => name === "admit_checkout_creation")).toBe(false);
    expect(boundary.rpc).toHaveBeenCalledWith("claim_checkout_refresh", expect.objectContaining({ p_kind: "session", p_target_id: sessionId }));
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
