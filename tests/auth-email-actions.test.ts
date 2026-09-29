// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ reset: vi.fn(), signUp: vi.fn(), merge: vi.fn(), changed: vi.fn(), redirect: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ origin: "https://evil.example" }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => ({ auth: { resetPasswordForEmail: mocks.reset, signUp: mocks.signUp } }) }));
vi.mock("@/lib/cart/server", () => ({ mergeGuestCartIntoCurrentUser: mocks.merge }));
vi.mock("@/lib/cart/auth-sync", () => ({ markCartIdentityChanged: mocks.changed }));
import { forgotPasswordAction, signUpAction } from "@/app/account/actions";
const form = () => { const data = new FormData(); data.set("email", "person@example.test"); data.set("password", "synthetic-password"); return data; };
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("HELIX_EMAIL_SITE_ORIGIN", "https://helixskin.vercel.app"); vi.spyOn(console, "warn").mockImplementation(() => {}); });
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("account email requests", () => {
  it("gives the same honest recovery response for absent accounts, cooldowns and SMTP failures", async () => {
    mocks.reset.mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ error: { code: "over_email_send_rate_limit", message: "private recipient" } }).mockResolvedValueOnce({ error: { status: 500, message: "smtp secret" } });
    const results = [];
    for (let count = 0; count < 3; count++) results.push(await forgotPasswordAction({ status: "idle" }, form()));
    expect(results[1]).toEqual(results[0]);
    expect(results[2]).toEqual(results[0]);
    expect(results[0].message).not.toContain("will arrive");
    expect(results[0].message).toMatch(/unavailable|delayed/);
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toMatch(/private recipient|smtp secret|person@example/);
    expect(mocks.reset).toHaveBeenCalledWith("person@example.test", { redirectTo: "https://helixskin.vercel.app/auth/callback?next=%2Faccount%2Freset-password" });
    expect(mocks.merge).not.toHaveBeenCalled();
  });
  it("keeps thrown provider failures generic and does not retry or send independently", async () => {
    mocks.reset.mockRejectedValue(new Error("private provider response"));
    expect((await forgotPasswordAction({ status: "idle" }, form())).message).toMatch(/If an account exists/);
    expect(mocks.reset).toHaveBeenCalledOnce();
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain("private provider response");
  });
  it("preserves verification and handles signup cooldowns without creating a session", async () => {
    mocks.signUp.mockResolvedValueOnce({ data: { session: null }, error: null }).mockResolvedValueOnce({ error: { status: 429 } });
    expect((await signUpAction({ status: "idle" }, form())).message).toMatch(/verify the account/);
    expect((await signUpAction({ status: "idle" }, form())).message).toMatch(/rate-limited/);
    expect(mocks.merge).not.toHaveBeenCalled();
    expect(mocks.signUp).toHaveBeenCalledWith(expect.objectContaining({ options: expect.objectContaining({ emailRedirectTo: "https://helixskin.vercel.app/auth/callback?next=%2Faccount" }) }));
  });
  it("uses the reviewed domain after a configuration change without trusting request Origin", async () => {
    vi.stubEnv("HELIX_EMAIL_SITE_ORIGIN", "https://accounts.example.test");
    mocks.reset.mockResolvedValue({ error: null });
    await forgotPasswordAction({ status: "idle" }, form());
    expect(mocks.reset).toHaveBeenCalledWith("person@example.test", { redirectTo: "https://accounts.example.test/auth/callback?next=%2Faccount%2Freset-password" });
  });
  it("preserves loopback callbacks for local development even when hosted email configuration is present", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3100");
    mocks.reset.mockResolvedValue({ error: null });
    await forgotPasswordAction({ status: "idle" }, form());
    expect(mocks.reset).toHaveBeenCalledWith("person@example.test", { redirectTo: "http://localhost:3100/auth/callback?next=%2Faccount%2Freset-password" });
  });
});
