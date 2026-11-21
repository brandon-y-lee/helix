import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CHECKOUT_RECEIPT_COOKIE, GUEST_CART_COOKIE } from "@/lib/customer-state-identifiers";
import { getOrderConfirmationBySession, getOrdersForCurrentUser } from "@/lib/orders/server";

const { cookie, user, rpc, from, stripe } = vi.hoisted(() => ({
  cookie: vi.fn(), user: vi.fn(), rpc: vi.fn(), from: vi.fn(), stripe: vi.fn(),
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: cookie }) }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: user, getCurrentIdentity: user }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({ from, rpc }) }));
vi.mock("@/lib/stripe/server", () => ({ getStripeClient: stripe }));

const account = "acct_SyntheticLive";
const session = "cs_live_receipt";
const userId = "00000000-0000-4000-8000-000000000002";
const receipt = {
  orderId: "00000000-0000-4000-8000-000000000001", orderNumber: "HX-123", createdAt: "2026-11-21T10:00:00.000004Z",
  status: "paid", currency: "USD", merchandiseSubtotalCents: 2000, discountCents: 0, shippingCents: 300,
  taxCents: 200, totalCents: 2500, refundedCents: 700,
  items: [{ productName: "Serum", variantLabel: "30 mL", quantity: 1, unitPriceCents: 2000, lineSubtotalCents: 2000 }],
};
const token = Buffer.alloc(32, 3).toString("base64url");
const sandbox = {
  id: "00000000-0000-4000-8000-000000000010", order_number: "HX-120", status: "paid", total_cents: 400,
  reward_points_earned: 4, reward_points_redeemed: 0, created_at: "2026-11-21T10:00:00.000001+00:00",
};
function sandboxHistory() {
  const query = {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: [sandbox], error: null }),
  };
  from.mockReturnValue(query);
  return query;
}

describe("live receipt and account history", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("VERCEL_PROJECT_ID", "prj_N9nyPL9SixJHOROIovS8PDQ9aKny");
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "main");
    vi.stubEnv("NEXT_PUBLIC_HELIX_SUPABASE_TARGET", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.helixskin.us");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://erasogmsqpgiirovubjh.supabase.co");
    vi.stubEnv("HELIX_STRIPE_LIVE_ACCOUNT_ID", account);
    vi.stubEnv("CHECKOUT_MODE", "sandbox");
    vi.stubEnv("HELIX_STRIPE_LIVE_SECRET_KEY", undefined);
    vi.stubEnv("HELIX_STRIPE_LIVE_WEBHOOK_SECRET", undefined);
    user.mockResolvedValue(null);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("reads only the atomically authorized projection using the hashed guest receipt cookie, with sales closed", async () => {
    cookie.mockImplementation((name: string) => name === CHECKOUT_RECEIPT_COOKIE ? { value: token } : undefined);
    rpc.mockResolvedValue({ data: { ...receipt, shippingAddress: "private address" }, error: null });
    const result = await getOrderConfirmationBySession(session);
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith("read_live_checkout_receipt", {
      p_account_id: account, p_order_id: null, p_session_id: session, p_user_id: null,
      p_receipt_token_hash: createHash("sha256").update(token).digest("hex"),
    });
    expect(result).toMatchObject({ providerMode: "live", state: "partially_refunded", shipping: null,
      order: { order_number: "HX-123", total_cents: 2500, refunded_cents: 700 },
      items: [{ product_name: "Serum", quantity: 1, line_subtotal_cents: 2000 }] });
    expect(JSON.stringify(result)).not.toMatch(/private address|acct_SyntheticLive|cs_live_receipt/);
    expect(from).not.toHaveBeenCalled();
    expect(stripe).not.toHaveBeenCalled();
  });

  it("returns the same denial for a bare Session, cart cookie and a rejected account or expired guest capability", async () => {
    cookie.mockImplementation((name: string) => name === GUEST_CART_COOKIE ? { value: token } : undefined);
    expect(await getOrderConfirmationBySession(session)).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
    user.mockResolvedValue({ id: userId });
    rpc.mockResolvedValue({ data: null, error: null });
    expect(await getOrderConfirmationBySession(session)).toBeNull();
    expect(rpc).toHaveBeenLastCalledWith("read_live_checkout_receipt", expect.objectContaining({ p_user_id: userId, p_receipt_token_hash: null }));
    user.mockResolvedValue(null);
    cookie.mockReturnValue({ value: token });
    expect(await getOrderConfirmationBySession(session)).toBeNull();
    expect(from).not.toHaveBeenCalled();
    expect(stripe).not.toHaveBeenCalled();
  });

  it("merges independently scoped live and sandbox history for the verified account in stable creation order", async () => {
    user.mockResolvedValue({ id: userId });
    const query = sandboxHistory();
    rpc.mockResolvedValue({ data: [receipt], error: null });
    const orders = await getOrdersForCurrentUser();
    expect(query.eq).toHaveBeenCalledWith("checkout_environment", "sandbox");
    expect(query.eq).toHaveBeenCalledWith("user_id", userId);
    expect(rpc).toHaveBeenCalledWith("read_live_checkout_order_history", {
      p_account_id: account, p_user_id: userId, p_limit: 10, p_before_created_at: null, p_before_id: null,
    });
    expect(orders.map(row => row.order_number)).toEqual(["HX-123", "HX-120"]);
    expect(orders[0]).toMatchObject({ providerMode: "live", status: "partially_refunded" });
    expect(stripe).not.toHaveBeenCalled();
    user.mockResolvedValue(null);
    rpc.mockClear(); from.mockClear();
    expect(await getOrdersForCurrentUser()).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it.each([
    ["CHECKOUT_MODE", "live"], ["HELIX_STRIPE_LIVE_WEBHOOK_SECRET", "whsec_synthetic"],
  ])("keeps sandbox history available without a pinned live merchant when %s is set", async (key, value) => {
    vi.stubEnv("HELIX_STRIPE_LIVE_ACCOUNT_ID", undefined);
    vi.stubEnv(key, value);
    user.mockResolvedValue({ id: userId });
    sandboxHistory();
    const results = await Promise.allSettled([getOrderConfirmationBySession(session), getOrdersForCurrentUser()]);
    expect(results).toEqual([
      { status: "fulfilled", value: null }, { status: "fulfilled", value: [{ ...sandbox, providerMode: "sandbox" }] },
    ]);
    expect(from).toHaveBeenCalledTimes(1);
    expect(rpc).not.toHaveBeenCalled();
    expect(stripe).not.toHaveBeenCalled();
  });

  it.each([
    ["HELIX_STRIPE_LIVE_ACCOUNT_ID", "malformed"], ["VERCEL_ENV", "preview"],
  ])("rejects a configured live merchant with invalid %s before any live read", async (key, value) => {
    vi.stubEnv(key, value);
    user.mockResolvedValue({ id: userId });
    sandboxHistory();
    await expect(getOrderConfirmationBySession(session)).rejects.toThrow("could not be verified");
    await expect(getOrdersForCurrentUser()).rejects.toThrow("could not be verified");
    expect(rpc).not.toHaveBeenCalled();
    expect(stripe).not.toHaveBeenCalled();
  });
});
