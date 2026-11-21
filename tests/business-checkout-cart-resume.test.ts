import { createHash } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GUEST_CART_COOKIE } from "@/lib/customer-state-identifiers";
import { BUSINESS_SANDBOX_STOREFRONT_ORIGIN } from "@/lib/checkout/business-origin";

const db = vi.hoisted(() => ({ identity: vi.fn(), rpc: vi.fn(), select: vi.fn(), order: vi.fn(), cart: vi.fn(),
  cookies: new Map<string, string>(), set: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentIdentity: db.identity }));
vi.mock("next/headers", () => ({ cookies: async () => ({
  get: (name: string) => ({ value: db.cookies.get(name) }), set: db.set,
}) }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({
  rpc: db.rpc, from: () => ({ select: db.select }),
}) }));
import { GET } from "@/app/api/cart/route";

const cartId = "12345678-0000-4000-8000-000000000001";
const generation = "12345678-0000-4000-8000-000000000002";
const userId = "12345678-0000-4000-8000-000000000003";
const account = "acct_DevFixture";
const guest = Buffer.alloc(32, 1).toString("base64url");
const receipt = Buffer.alloc(32, 2).toString("base64url");
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const attemptCookie = "helix_checkout_attempt_" + digest(cartId + "/" + generation).slice(0, 32);
const resume = "read_business_checkout_resume";
const row = {id: "line", product_id: "product", variant_key: "30ml", quantity: 1, products: null};
let authorized: unknown, rpcError: unknown;
const read = async (origin = BUSINESS_SANDBOX_STOREFRONT_ORIGIN) => {
  const response = await GET(new Request(origin + "/api/cart"));
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  return response.json();
};
beforeEach(() => {
  vi.resetAllMocks(); db.cookies.clear(); authorized = true; rpcError = null;
  for (const [key, value] of Object.entries({
    VERCEL: "1", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "codex/558-verified-dev-preview",
    VERCEL_PROJECT_ID: "prj_N9nyPL9SixJHOROIovS8PDQ9aKny", NEXT_PUBLIC_HELIX_SUPABASE_TARGET: "development",
    NEXT_PUBLIC_SUPABASE_URL: "https://zyfkunnpnlmgvrojmrbg.supabase.co", CHECKOUT_MODE: "business_sandbox",
    HELIX_STRIPE_DEV_ACCOUNT_ID: account, HELIX_STRIPE_DEV_ADMISSION_ENABLED: "false",
    HELIX_STRIPE_DEV_SECRET_KEY: "rk_test_DevFixture", HELIX_STRIPE_DEV_WEBHOOK_SECRET: "whsec_DevFixture",
  })) vi.stubEnv(key, value);
  db.identity.mockResolvedValue({id: userId});
  db.select.mockReturnValue({eq: () => ({order: db.order})});
  db.order.mockReturnValue({maybeSingle: db.cart});
  db.cart.mockResolvedValue({data: {checkout_generation: generation, cart_items: [row]}, error: null});
  db.rpc.mockImplementation(async (rpc: string) => {
    if (rpc === "resolve_active_cart") return {data: [{cart_id: cartId, status: "active", expired: false}], error: null};
    if (rpc === resume) return {data: authorized, error: rpcError};
    if (rpc === "read_business_checkout_offer") return {data: null, error: null};
    throw new Error("Unexpected RPC");
  });
});
afterEach(() => { vi.unstubAllEnvs(); expect(db.set).not.toHaveBeenCalled(); });

it("lets only the authenticated owner resume when new admissions are paused", async () => {
  const cart = await read();
  expect(cart.checkout).toEqual({mode: "business_sandbox", admissionOpen: false, canResume: true});
  expect(db.select).toHaveBeenCalledWith(expect.stringContaining("checkout_generation, cart_items"));
  expect(db.order).toHaveBeenCalledWith("created_at", {ascending: true, referencedTable: "cart_items"});
  expect(db.rpc.mock.calls).toEqual([
    ["resolve_active_cart", {p_user_id: userId, p_guest_token_hash: null, p_create: false}],
    [resume, {p_environment: "business_sandbox", p_account_id: account, p_cart_id: cartId,
      p_checkout_generation: generation, p_user_id: userId, p_guest_cart_hash: null, p_receipt_hash: null, p_allow_send: false}],
  ]);
  for (const value of [cartId, generation, account, userId]) expect(JSON.stringify(cart)).not.toContain(value);
});
it("keeps a prepared guest's held last unit resumable even when the open-offer read returns no stock", async () => {
  vi.stubEnv("HELIX_STRIPE_DEV_ADMISSION_ENABLED", "true");
  db.identity.mockResolvedValue(null); db.cookies.set(GUEST_CART_COOKIE, guest); db.cookies.set(attemptCookie, receipt);
  const cart = await read();
  expect(cart.checkout).toEqual({mode: "business_sandbox", admissionOpen: false, canResume: true});
  expect(db.rpc).toHaveBeenCalledWith("read_business_checkout_offer", {p_environment: "business_sandbox", p_account_id: account});
  expect(db.rpc).toHaveBeenCalledWith(resume, {p_environment: "business_sandbox", p_account_id: account, p_cart_id: cartId,
    p_checkout_generation: generation, p_user_id: null, p_guest_cart_hash: digest(guest), p_receipt_hash: digest(receipt), p_allow_send: true});
  for (const value of [guest, receipt, digest(guest), digest(receipt)]) expect(JSON.stringify(cart)).not.toContain(value);
});
it.each([false, null, {canResume: true}, "true"])("requires a positive service boolean for this owner: %j", async result => {
  authorized = result;
  expect((await read()).checkout).toEqual({mode: "business_sandbox", admissionOpen: false});
});
it("retains the cart on an authorization read error", async () => {
  rpcError = {message: "internal"};
  const cart = await read();
  expect(cart.checkout).toEqual({mode: "business_sandbox", admissionOpen: false});
  expect(cart.lines).toHaveLength(1);
});
it("ignores prepared guest cookies when an authenticated claimant is denied", async () => {
  authorized = false; db.cookies.set(GUEST_CART_COOKIE, guest); db.cookies.set(attemptCookie, receipt);
  expect((await read()).checkout.canResume).toBeUndefined();
  expect(db.rpc.mock.calls.filter(call => call[0] === resume)).toEqual([[resume, expect.objectContaining({
    p_user_id: userId, p_guest_cart_hash: null, p_receipt_hash: null,
  })]]);
});
it("does not query resume for an unprepared guest or create cookies for a fresh visitor", async () => {
  db.identity.mockResolvedValue(null);
  expect((await read()).checkout.canResume).toBeUndefined();
  expect(db.rpc).not.toHaveBeenCalled();
  db.cookies.set(GUEST_CART_COOKIE, guest);
  expect((await read()).checkout.canResume).toBeUndefined();
  expect(db.rpc.mock.calls.map(c => c[0])).toEqual(["resolve_active_cart"]);
});
it.each(["https://helixskin-dev-payments.vercel.app", "https://immutable.vercel.app", "https://www.helixskin.us"])(
  "skips private checkout authorization on %s", async origin => {
    expect((await read(origin)).checkout).toEqual({mode: "closed", admissionOpen: false});
    expect(db.rpc.mock.calls.map(c => c[0])).toEqual(["resolve_active_cart"]);
  });
it("lets storage decide on the existing empty cart's current generation and skips missing generations", async () => {
  db.cart.mockResolvedValueOnce({data: {checkout_generation: generation, cart_items: []}, error: null})
    .mockResolvedValueOnce({data: {checkout_generation: null, cart_items: [row]}, error: null});
  authorized = false;
  expect((await read()).checkout.canResume).toBeUndefined();
  expect((await read()).checkout.canResume).toBeUndefined();
  expect(db.rpc.mock.calls.map(c => c[0])).toEqual(["resolve_active_cart", resume, "resolve_active_cart"]);
});
it.each(["HELIX_STRIPE_DEV_SECRET_KEY", "HELIX_STRIPE_DEV_WEBHOOK_SECRET"])(
  "skips private authorization if the checkout cannot retrieve the Session without %s", async name => {
    vi.stubEnv(name, "");
    expect((await read()).checkout.canResume).toBeUndefined();
    expect(db.rpc.mock.calls.map(c => c[0])).toEqual(["resolve_active_cart"]);
  });
it("identifies the live account separately on its own canonical host and parent", async () => {
  for (const [key, value] of Object.entries({
    VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main", NEXT_PUBLIC_HELIX_SUPABASE_TARGET: "production",
    NEXT_PUBLIC_SITE_URL: "https://www.helixskin.us", NEXT_PUBLIC_SUPABASE_URL: "https://erasogmsqpgiirovubjh.supabase.co",
    CHECKOUT_MODE: "live", HELIX_STRIPE_DEV_ACCOUNT_ID: "", HELIX_STRIPE_LIVE_ACCOUNT_ID: "acct_LiveFixture",
    HELIX_STRIPE_LIVE_SECRET_KEY: "rk_live_Fixture", HELIX_STRIPE_LIVE_WEBHOOK_SECRET: "whsec_LiveFixture",
  })) vi.stubEnv(key, value);
  expect((await read("https://www.helixskin.us")).checkout).toEqual({mode: "live", admissionOpen: false, canResume: true});
  expect(db.rpc).toHaveBeenCalledWith(resume, expect.objectContaining({p_environment: "live", p_account_id: "acct_LiveFixture", p_allow_send: false}));
});
