import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { rpc, cookieStore } = vi.hoisted(() => ({
  rpc: vi.fn(), cookieStore: { get: vi.fn(), set: vi.fn() },
}));
vi.mock("next/headers", () => ({ cookies: async () => cookieStore }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({ rpc }) }));

import { authorizeCheckoutReceipt, ensureGuestReceiptBinding } from "@/lib/orders/receipt-access";
import { CHECKOUT_RECEIPT_COOKIE, GUEST_CART_COOKIE } from "@/lib/customer-state-identifiers";

const input = { accountId: "acct_1Tm9WRFEzyaKzdmq", orderId: "00000000-0000-4000-8000-000000000001" };
const guestToken = Buffer.alloc(32, 1).toString("base64url");
const now = new Date("2026-09-19T01:00:00.000Z");
const expiresAt = "2026-09-20T01:00:00.000Z";

describe("guest receipt cookie and storage boundary", () => {
  beforeEach(() => {
    vi.useFakeTimers(); vi.setSystemTime(now); vi.stubEnv("NODE_ENV", "production");
    rpc.mockReset(); cookieStore.get.mockReset(); cookieStore.set.mockReset();
    cookieStore.get.mockImplementation((name: string) => name === GUEST_CART_COOKIE ? { value: guestToken } : undefined);
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

  it("binds a hashed random capability before issuing the private root-path hosted cookie", async () => {
    let resolveBinding: (result: unknown) => void = () => {};
    rpc.mockImplementation(() => new Promise((resolve) => { resolveBinding = resolve; }));
    const binding = ensureGuestReceiptBinding(input);
    await Promise.resolve(); await Promise.resolve();
    expect(cookieStore.set).not.toHaveBeenCalled();
    resolveBinding({ data: { allowed: true, reused: false, expires_at: expiresAt, retry_after_seconds: 0 }, error: null });
    await binding;
    expect(cookieStore.set).toHaveBeenCalledOnce();
    const [name, token, options] = cookieStore.set.mock.calls[0];
    expect(name).toBe("helix_checkout_receipt");
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
    expect(options).toEqual({ httpOnly: true, secure: true, sameSite: "lax", path: "/", expires: new Date(expiresAt) });
    expect(rpc).toHaveBeenCalledWith("bind_guest_checkout_receipt", {
      p_account_id: input.accountId, p_order_id: input.orderId,
      p_guest_token_hash: "56d5fa7333f6d747db42c239407e5da4c32f4c79f35d092b134fd35a402d9c5c",
      p_existing_token_hash: null,
      p_candidate_token_hash: createHash("sha256").update(token).digest("hex"),
    });
    expect(JSON.stringify(rpc.mock.calls)).not.toContain(token);
    expect(JSON.stringify(rpc.mock.calls)).not.toContain(guestToken);
  });

  it("reuses a valid browser capability without rotating or extending its cookie", async () => {
    const receiptToken = Buffer.alloc(32, 2).toString("base64url");
    cookieStore.get.mockImplementation((name: string) => ({ value: name === GUEST_CART_COOKIE ? guestToken : receiptToken }));
    rpc.mockResolvedValue({ data: { allowed: true, reused: true, expires_at: "2026-09-19T01:01:00.000Z", retry_after_seconds: 0 }, error: null });
    await expect(ensureGuestReceiptBinding(input)).resolves.toBeUndefined();
    expect(rpc.mock.calls[0][1].p_existing_token_hash).toBe(createHash("sha256").update(receiptToken).digest("hex"));
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it.each([
    null,
    { allowed: true, reused: false, expires_at: "invalid", retry_after_seconds: 0 },
    { allowed: true, reused: false, expires_at: now.toISOString(), retry_after_seconds: 0 },
    { allowed: true, reused: false, expires_at: "2026-09-21T01:00:00.000Z", retry_after_seconds: 0 },
    { allowed: true, reused: true, expires_at: expiresAt, retry_after_seconds: 0 },
    { allowed: false, reused: false, expires_at: null, retry_after_seconds: 61 },
  ])("fails closed without a cookie on invalid storage decisions %j", async (data) => {
    rpc.mockResolvedValue({ data, error: null });
    await expect(ensureGuestReceiptBinding(input)).rejects.toMatchObject({ status: 503 });
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it("preserves bounded issuance backoff and redacts storage or cookie failures", async () => {
    rpc.mockResolvedValue({ data: { allowed: false, reused: false, expires_at: null, retry_after_seconds: 45 }, error: null });
    await expect(ensureGuestReceiptBinding(input)).rejects.toMatchObject({ status: 429, retryAfterSeconds: 45 });
    rpc.mockRejectedValue(new Error("private database detail"));
    await expect(ensureGuestReceiptBinding(input)).rejects.toMatchObject({ status: 503 });
    rpc.mockResolvedValue({ data: { allowed: true, reused: false, expires_at: expiresAt, retry_after_seconds: 0 }, error: null });
    cookieStore.set.mockImplementation(() => { throw new Error("private cookie detail"); });
    await expect(ensureGuestReceiptBinding(input)).rejects.toMatchObject({ status: 503 });
    await expect(ensureGuestReceiptBinding(input)).rejects.not.toThrow("private");
  });

  it.each([undefined, "bad", "a".repeat(4097), "A".repeat(42) + "B"])("rejects unproven guest cookies without storage or cookie writes", async (token) => {
    cookieStore.get.mockReturnValue(token ? { value: token } : undefined);
    rpc.mockResolvedValue({ data: { allowed: true, reused: false, expires_at: expiresAt, retry_after_seconds: 0 }, error: null });
    await expect(ensureGuestReceiptBinding(input)).rejects.toMatchObject({ status: 503 });
    expect(rpc).not.toHaveBeenCalled();
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it("reads a guest receipt independently of cart contents or a login transition without setting cookies", async () => {
    const receiptToken = Buffer.alloc(32, 2).toString("base64url");
    cookieStore.get.mockImplementation((name: string) => name === CHECKOUT_RECEIPT_COOKIE ? { value: receiptToken } : undefined);
    rpc.mockResolvedValue({ data: true, error: null });
    const view = { ...input, sessionId: "cs_test_owned", verifiedUserId: null };
    await expect(authorizeCheckoutReceipt(view)).resolves.toBe(true);
    const userId = "00000000-0000-4000-8000-000000000002";
    await expect(authorizeCheckoutReceipt({ ...view, verifiedUserId: userId })).resolves.toBe(true);
    expect(rpc).toHaveBeenLastCalledWith("authorize_checkout_receipt", {
      p_account_id: input.accountId, p_order_id: input.orderId,
      p_session_id: view.sessionId, p_user_id: userId,
      p_receipt_token_hash: "6c1d63bbdab437c54368cbbd8886a886a79ad977297e265eebf1f5f5f01533b9",
      p_guest_token_hash: null,
    });
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it("returns the same neutral denial for storage failure, malformed authority, and no ownership proof", async () => {
    const view = { ...input, sessionId: "cs_test_owned", verifiedUserId: null };
    rpc.mockRejectedValue(new Error("private database detail"));
    await expect(authorizeCheckoutReceipt(view)).resolves.toBe(false);
    rpc.mockResolvedValue({ data: "true", error: null });
    await expect(authorizeCheckoutReceipt(view)).resolves.toBe(false);
    rpc.mockResolvedValue({ data: true, error: { message: "private database detail" } });
    await expect(authorizeCheckoutReceipt(view)).resolves.toBe(false);
    rpc.mockReset(); cookieStore.get.mockReturnValue({ value: "malformed" });
    await expect(authorizeCheckoutReceipt(view)).resolves.toBe(false);
    expect(rpc).not.toHaveBeenCalled();
    expect(cookieStore.set).not.toHaveBeenCalled();
  });
});
