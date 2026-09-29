// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ verifyOtp: vi.fn(), merge: vi.fn(), changed: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => ({ auth: { verifyOtp: mocks.verifyOtp } }) }));
vi.mock("@/lib/cart/server", () => ({ mergeGuestCartIntoCurrentUser: mocks.merge }));
vi.mock("@/lib/cart/auth-sync", () => ({ markCartIdentityChanged: mocks.changed }));
import { GET, HEAD, POST } from "@/app/auth/confirm/route";
const origin = "https://helixskin.vercel.app";
const token = "abcdef0123456789";
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("HELIX_EMAIL_SITE_ORIGIN", origin); });
afterEach(() => vi.unstubAllEnvs());
const post = (type = "email", next = "/account") => new NextRequest(`${origin}/auth/confirm`, { method: "POST", headers: { origin, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token_hash: token, type, next }) });

describe("account email confirmation", () => {
  it("does not consume a link when an email scanner fetches it", async () => {
    const response = await GET(new NextRequest(`${origin}/auth/confirm?token_hash=${token}&type=email`));
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('method="post"');
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("referrer-policy")).toBe("strict-origin");
    expect(response.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
    expect(mocks.merge).not.toHaveBeenCalled();
  });
  it("verifies the provider token only after confirmation and preserves the cart transition", async () => {
    mocks.verifyOtp.mockResolvedValue({ data: { session: { user: { id: "account" } } }, error: null });
    const response = await POST(post());
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`${origin}/account`);
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ token_hash: token, type: "email" });
    expect(mocks.merge).toHaveBeenCalledOnce();
    expect(mocks.changed).toHaveBeenCalledOnce();
  });
  it("keeps HEAD scanner requests verification-free", async () => {
    expect((await HEAD()).status).toBe(200);
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });
  it("does not use the current browser's cart when secure email change awaits its second confirmation", async () => {
    mocks.verifyOtp.mockResolvedValue({ data: { session: null }, error: null });
    const response = await POST(post("email_change"));
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("other address");
    expect(mocks.merge).not.toHaveBeenCalled();
    expect(mocks.changed).not.toHaveBeenCalled();
  });
  it("routes recovery to the password form regardless of a supplied destination", async () => {
    mocks.verifyOtp.mockResolvedValue({ data: { session: {} }, error: null });
    expect((await POST(post("recovery", "https://evil.example"))).headers.get("location")).toBe(`${origin}/account/reset-password`);
  });
  it.each(["otp_expired", "otp_disabled"])("keeps %s and reused token failures private and does not merge carts", async (code) => {
    mocks.verifyOtp.mockResolvedValue({ data: { session: null }, error: { code } });
    const response = await POST(post());
    expect(response.headers.get("location")).toBe(`${origin}/account/sign-in?error=expired-link`);
    expect(mocks.merge).not.toHaveBeenCalled();
  });
  it("returns a generic provider outage without exposing tokens or provider details", async () => {
    mocks.verifyOtp.mockRejectedValue(new Error(`secret=${token}`));
    const response = await POST(post());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain(token);
  });
  it.each([500, 503, 429])("does not mislabel a returned provider %s failure as an expired link", async (status) => {
    mocks.verifyOtp.mockResolvedValue({ data: { session: null }, error: { status, message: `secret=${token}` } });
    const response = await POST(post());
    expect(response.status).toBe(status === 429 ? 429 : 503);
    expect(response.headers.get("location")).toBeNull();
    expect(await response.text()).not.toContain(token);
    expect(mocks.merge).not.toHaveBeenCalled();
  });
  it.each([null, "https://evil.example", "null"])("rejects a disallowed Origin %s before verifying", async (requestOrigin) => {
    const request = post();
    if (requestOrigin) request.headers.set("origin", requestOrigin); else request.headers.delete("origin");
    expect((await POST(request)).status).toBe(403);
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });
  it("rejects unknown OTP types, duplicate fields and oversized posts", async () => {
    expect((await POST(post("sms"))).status).toBe(400);
    for (const body of [`token_hash=${token}&type=email&type=recovery`, `token_hash=${"a".repeat(5000)}&type=email`]) {
      const request = new NextRequest(`${origin}/auth/confirm`, { method: "POST", headers: { origin, "content-type": "application/x-www-form-urlencoded" }, body });
      expect((await POST(request)).status).toBe(400);
    }
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });
  it("escapes hidden return destinations and keeps terminal redirects on Helix", async () => {
    const response = await GET(new NextRequest(`${origin}/auth/confirm?token_hash=${token}&type=email&next=${encodeURIComponent('/account?value=" autofocus onfocus="alert(1)')} `));
    expect(await response.text()).not.toContain('value="/account?value="');
    mocks.verifyOtp.mockResolvedValue({ data: { session: {} }, error: null });
    expect((await POST(post("email", "/%09/evil.example"))).headers.get("location")).toBe(`${origin}/account`);
  });
});
