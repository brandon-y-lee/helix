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

  it("reads an archived live projection with the prior hashed receipt cookie when sales are closed", async () => {
    cookie.mockImplementation((name: string) => name === CHECKOUT_RECEIPT_COOKIE ? { value: token } : undefined);
    rpc.mockResolvedValue({ data: { ...receipt, shippingAddress: "private address" }, error: null });
    const result = await getOrderConfirmationBySession(session);
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith("read_archived_live_checkout_receipt", {
      p_account_id: account, p_session_id: session,
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
    expect(rpc).toHaveBeenLastCalledWith("read_business_checkout_receipt", expect.objectContaining({ p_user_id: userId, p_receipt_token_hash: null }));
    user.mockResolvedValue(null);
    cookie.mockReturnValue({ value: token });
    expect(await getOrderConfirmationBySession(session)).toBeNull();
    expect(from).not.toHaveBeenCalled();
    expect(stripe).not.toHaveBeenCalled();
  });

  it.each(["live", "business_sandbox"] as const)("authorizes the %s Session cookie and discloses only recorded dispatch fields", async environment => {
    const test = environment === "business_sandbox";
    const id = test ? "cs_test_receipt" : session;
    if (test) {
      vi.stubEnv("HELIX_STRIPE_LIVE_ACCOUNT_ID", undefined);
      vi.stubEnv("HELIX_STRIPE_DEV_ACCOUNT_ID", account);
      vi.stubEnv("VERCEL_ENV", "preview");
      vi.stubEnv("VERCEL_GIT_COMMIT_REF", "codex/558-verified-dev-preview");
      vi.stubEnv("NEXT_PUBLIC_HELIX_SUPABASE_TARGET", "development");
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://zyfkunnpnlmgvrojmrbg.supabase.co");
    }
    const receiptCookie = "helix_order_receipt_" + createHash("sha256").update(id).digest("hex").slice(0, 32);
    const hash = createHash("sha256").update(token).digest("hex");
    cookie.mockImplementation((name: string) => name === receiptCookie ? { value: token } : undefined);
    const dispatched = { id: userId, version: 2, state: "dispatched", carrier: "USPS", trackingReference: "TEST",
      dispatchedAt: "2026-11-20T10:00:00Z", deliveredAt: null, items: [{ name: "Serum", quantity: 1 }],
      actorId: "operator-private", correctionReason: "private-note" };
    let authorized = true;
    rpc.mockImplementation((name: string) => {
      if (name === "read_business_checkout_receipt") return { data: { ...receipt, billingAddress: "private-address" }, error: null };
      if (name === "read_business_order_shipments") return { abortSignal: () => ({ data: { environment,
        shipments: [dispatched], delivery: "private-address" }, error: null }) };
      if (name === "authorize_business_checkout_receipt") return { data: authorized, error: null };
      throw new Error("Unexpected receipt RPC");
    });
    const result = await getOrderConfirmationBySession(id);
    expect(result).toMatchObject({ providerMode: environment, manualShipments: { environment, shipments: [{
      carrier: "USPS", trackingReference: "TEST" }] }, shipping: null });
    expect(rpc).toHaveBeenCalledWith("read_business_order_shipments", {
      p_environment: environment, p_account_id: account, p_order_id: receipt.orderId, p_session_id: id, p_user_id: null, p_receipt_token_hash: hash,
    });
    expect(JSON.stringify(result)).not.toMatch(/private-address|private-note|operator-private/);
    expect(JSON.stringify(rpc.mock.calls)).not.toContain(token);
    authorized = false;
    expect(await getOrderConfirmationBySession(id)).toBeNull();
    expect(from).not.toHaveBeenCalled();
    expect(stripe).not.toHaveBeenCalled();
  });

  it("rejects another Session's capability, a generic receipt and a malformed 44-character dev token without historical fallback", async () => {
    vi.stubEnv("HELIX_STRIPE_LIVE_ACCOUNT_ID", undefined);
    vi.stubEnv("HELIX_STRIPE_DEV_ACCOUNT_ID", account);
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "codex/558-verified-dev-preview");
    vi.stubEnv("NEXT_PUBLIC_HELIX_SUPABASE_TARGET", "development");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://zyfkunnpnlmgvrojmrbg.supabase.co");
    const wrongName = "helix_order_receipt_" + createHash("sha256").update("cs_test_other").digest("hex").slice(0, 32);
    cookie.mockImplementation((name: string) => ({ value: [wrongName, GUEST_CART_COOKIE, CHECKOUT_RECEIPT_COOKIE].includes(name) ? token : token+"=" }));
    expect(await getOrderConfirmationBySession("cs_test_intended")).toBeNull();
    expect(await getOrderConfirmationBySession("cs_live_receipt")).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
    expect(stripe).not.toHaveBeenCalled();
  });

  it("does not retry an unaccepted per-Session capability through the archive", async () => {
    cookie.mockReturnValue({ value: token });
    rpc.mockResolvedValue({ data: null, error: null });
    expect(await getOrderConfirmationBySession(session)).toBeNull();
    expect(rpc.mock.calls.map(([name]) => name)).toEqual(["read_business_checkout_receipt"]);
  });

  it("keeps historical-personal orders out of child business history", async () => {
    vi.stubEnv("HELIX_STRIPE_LIVE_ACCOUNT_ID", undefined);
    vi.stubEnv("HELIX_STRIPE_DEV_ACCOUNT_ID", account);
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "codex/558-verified-dev-preview");
    vi.stubEnv("NEXT_PUBLIC_HELIX_SUPABASE_TARGET", "development");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://zyfkunnpnlmgvrojmrbg.supabase.co");
    user.mockResolvedValue({ id: userId });
    rpc.mockResolvedValue({ data: [receipt], error: null });
    expect(await getOrdersForCurrentUser()).toMatchObject([{ providerMode: "business_sandbox", status: "partially_refunded" }]);
    expect(from).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("read_business_checkout_order_history", expect.objectContaining({
      p_account_id: account, p_environment: "business_sandbox", p_user_id: userId,
    }));
  });

  it("merges independently scoped live and sandbox history for the verified account in stable creation order", async () => {
    user.mockResolvedValue({ id: userId });
    const query = sandboxHistory();
    rpc.mockResolvedValue({ data: [receipt], error: null });
    const orders = await getOrdersForCurrentUser();
    expect(query.eq).toHaveBeenCalledWith("checkout_environment", "sandbox");
    expect(query.eq).toHaveBeenCalledWith("user_id", userId);
    expect(rpc).toHaveBeenCalledWith("read_business_checkout_order_history", {
      p_environment: "live", p_account_id: account, p_user_id: userId, p_limit: 10, p_before_created_at: null, p_before_id: null,
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
