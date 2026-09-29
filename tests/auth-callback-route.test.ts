// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ exchange: vi.fn(), merge: vi.fn(), changed: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => ({ auth: { exchangeCodeForSession: mocks.exchange } }) }));
vi.mock("@/lib/cart/server", () => ({ mergeGuestCartIntoCurrentUser: mocks.merge }));
vi.mock("@/lib/cart/auth-sync", () => ({ markCartIdentityChanged: mocks.changed }));
import { GET } from "@/app/auth/callback/route";
const origin = "https://helixskin.vercel.app";
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("HELIX_EMAIL_SITE_ORIGIN", origin); });
afterEach(() => vi.unstubAllEnvs());
describe("existing PKCE email callbacks", () => {
  it("preserves the provider exchange and cart transition while removing codes from the private redirect", async () => {
    mocks.exchange.mockResolvedValue({ data: { session: {} }, error: null });
    const response = await GET(new NextRequest(`${origin}/auth/callback?code=synthetic-code&next=%2Faccount%2Freset-password`));
    expect(response.headers.get("location")).toBe(`${origin}/account/reset-password`);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(mocks.exchange).toHaveBeenCalledWith("synthetic-code");
    expect(mocks.merge).toHaveBeenCalledOnce();
    expect(mocks.changed).toHaveBeenCalledOnce();
  });
  it("rejects missing and reused codes without changing Cart ownership", async () => {
    const missing = await GET(new NextRequest(`${origin}/auth/callback`));
    expect(missing.headers.get("location")).toBe(`${origin}/account/sign-in?error=invalid-link`);
    expect(mocks.exchange).not.toHaveBeenCalled();
    mocks.exchange.mockResolvedValue({ error: { code: "flow_state_expired" } });
    const expired = await GET(new NextRequest(`${origin}/auth/callback?code=used-code`));
    expect(expired.headers.get("location")).toBe(`${origin}/account/sign-in?error=expired-link`);
    expect(mocks.merge).not.toHaveBeenCalled();
  });
  it("rejects a control-character return URL and uses the reviewed domain", async () => {
    mocks.exchange.mockResolvedValue({ error: null });
    vi.stubEnv("HELIX_EMAIL_SITE_ORIGIN", "https://accounts.example.test");
    const response = await GET(new NextRequest(`https://accounts.example.test/auth/callback?code=code&next=${encodeURIComponent("/\t/evil.example")}`));
    expect(response.headers.get("location")).toBe("https://accounts.example.test/account");
  });
  it("distinguishes temporary provider failure from an expired PKCE link", async () => {
    mocks.exchange.mockResolvedValue({ error: { status: 503, message: "private response" } });
    const response = await GET(new NextRequest(`${origin}/auth/callback?code=secret-code`));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toMatch(/expired|secret-code|private response/);
    expect(mocks.merge).not.toHaveBeenCalled();
  });
});
