// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  headers: vi.fn<() => Promise<Headers>>(),
  reset: vi.fn(),
  signUp: vi.fn(),
  merge: vi.fn(),
  changed: vi.fn(),
  redirect: vi.fn(),
}));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => ({ auth: { resetPasswordForEmail: mocks.reset, signUp: mocks.signUp } }) }));
vi.mock("@/lib/cart/server", () => ({ mergeGuestCartIntoCurrentUser: mocks.merge }));
vi.mock("@/lib/cart/auth-sync", () => ({ markCartIdentityChanged: mocks.changed }));
import { forgotPasswordAction, signUpAction } from "@/app/account/actions";
function form(email = "person@example.test") {
  const data = new FormData();
  data.set("email", email);
  data.set("password", "synthetic-password");
  return data;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.headers.mockResolvedValue(new Headers({ origin: "https://evil.example" }));
  vi.stubEnv("HELIX_EMAIL_SITE_ORIGIN", "https://helixskin.vercel.app");
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
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
    vi.stubEnv("HELIX_EMAIL_SITE_ORIGIN", "https://www.helixskin.us");
    mocks.reset.mockResolvedValue({ error: null });
    await forgotPasswordAction({ status: "idle" }, form());
    expect(mocks.reset).toHaveBeenCalledWith("person@example.test", { redirectTo: "https://www.helixskin.us/auth/callback?next=%2Faccount%2Freset-password" });
  });
  it("falls back to the configured public domain when the account email override is unset", async () => {
    vi.stubEnv("HELIX_EMAIL_SITE_ORIGIN", "");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://helixskin.us");
    mocks.signUp.mockResolvedValue({ data: { session: null }, error: null });
    await signUpAction({ status: "idle" }, form());
    expect(mocks.signUp).toHaveBeenCalledWith(expect.objectContaining({ options: expect.objectContaining({ emailRedirectTo: "https://helixskin.us/auth/callback?next=%2Faccount" }) }));
  });
});

const devOrigin = "https://helixskin.vercel.app";
const devHost = "helixskin.vercel.app";
const prodOrigin = "https://www.helixskin.us";
const prodBackend = "https://erasogmsqpgiirovubjh.supabase.co";
const childBackend = "https://zyfkunnpnlmgvrojmrbg.supabase.co";

function configurePreview() {
  vi.stubEnv("VERCEL", "1");
  vi.stubEnv("VERCEL_PROJECT_ID", "prj_N9nyPL9SixJHOROIovS8PDQ9aKny");
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("VERCEL_TARGET_ENV", "preview");
  vi.stubEnv("VERCEL_GIT_COMMIT_REF", "dev");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", childBackend);
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", devOrigin);
  vi.stubEnv("HELIX_EMAIL_SITE_ORIGIN", devOrigin);
  vi.stubEnv("HELIX_DEV_AUTH_RETURN_ORIGIN", devOrigin);
  mocks.headers.mockResolvedValue(new Headers({ host: devHost, origin: devOrigin }));
}

async function submitBoth(email: string) {
  const signup = await signUpAction({ status: "idle" }, form(email));
  const recovery = await forgotPasswordAction({ status: "idle" }, form(email));
  return { signup, recovery };
}

async function expectHeld() {
  const first = await submitBoth("first@example.test");
  expect(await submitBoth("second@example.test")).toEqual(first);
  expect(mocks.signUp).not.toHaveBeenCalled();
  expect(mocks.reset).not.toHaveBeenCalled();
  for (const state of [first.signup, first.recovery]) {
    expect(state.status).toBe("error");
    expect(state.message).toMatch(/unavailable/i);
    expect(state.message).not.toMatch(/check your (email|inbox)|example.test/i);
  }
  expect(mocks.merge).not.toHaveBeenCalled();
  expect(mocks.changed).not.toHaveBeenCalled();
}

async function expectBothCallbacks(origin: string) {
  const email = "person@example.test";
  const { signup, recovery } = await submitBoth(email);
  expect(signup.status).toBe("success");
  expect(recovery.status).toBe("success");
  expect(mocks.signUp).toHaveBeenCalledOnce();
  expect(mocks.signUp).toHaveBeenCalledWith(expect.objectContaining({
    email, options: expect.objectContaining({ emailRedirectTo: origin + "/auth/callback?next=%2Faccount" }),
  }));
  expect(mocks.reset).toHaveBeenCalledOnce();
  expect(mocks.reset).toHaveBeenCalledWith(email, {
    redirectTo: origin + "/auth/callback?next=%2Faccount%2Freset-password",
  });
}

describe("signup and recovery return-host ownership", () => {
  beforeEach(() => {
    mocks.signUp.mockResolvedValue({ data: { session: null }, error: null });
    mocks.reset.mockResolvedValue({ error: null });
  });

  it.each([
    ["HELIX_DEV_AUTH_RETURN_ORIGIN", undefined],
    ["HELIX_DEV_AUTH_RETURN_ORIGIN", "https://other.example"],
    ["VERCEL_ENV", undefined],
    ["VERCEL_PROJECT_ID", undefined],
    ["VERCEL_PROJECT_ID", "prj_other"],
    ["VERCEL_GIT_COMMIT_REF", "feature/foo"],
    ["VERCEL_TARGET_ENV", "production"],
    ["NEXT_PUBLIC_SUPABASE_URL", prodBackend],
    ["NEXT_PUBLIC_HELIX_SUPABASE_TARGET", "production"],
    ["NEXT_PUBLIC_SITE_URL", prodOrigin],
    ["HELIX_EMAIL_SITE_ORIGIN", prodOrigin],
  ] as const)("holds both calls when %s is %s, even for canonical request headers", async (key, value) => {
    configurePreview();
    vi.stubEnv(key, value);
    await expectHeld();
  });

  it.each<{ label: string; headers: Record<string, string> }>([
    { label: "missing Host", headers: { origin: devOrigin } },
    { label: "missing Origin", headers: { host: devHost } },
    { label: "foreign Origin", headers: { host: devHost, origin: "https://other.example" } },
    { label: "immutable deployment", headers: { host: "helix-synthetic.vercel.app", origin: "https://helix-synthetic.vercel.app" } },
    { label: "spoofed forwarded headers", headers: { host: "other.example", origin: devOrigin, "x-forwarded-host": devHost, "x-forwarded-proto": "https" } },
  ])("holds both calls for $label even after opt-in", async ({ headers }) => {
    configurePreview();
    mocks.headers.mockResolvedValue(new Headers(headers));
    await expectHeld();
  });

  it("sends both callbacks to the qualified development host after explicit opt-in", async () => {
    configurePreview();
    await expectBothCallbacks(devOrigin);
  });

  it("keeps both production callbacks on the reviewed origin with untrusted request headers", async () => {
    configurePreview();
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("VERCEL_TARGET_ENV", "production");
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "main");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", prodBackend);
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", prodOrigin);
    vi.stubEnv("HELIX_EMAIL_SITE_ORIGIN", prodOrigin);
    vi.stubEnv("HELIX_DEV_AUTH_RETURN_ORIGIN", undefined);
    mocks.headers.mockResolvedValue(new Headers({ host: devHost, origin: devOrigin }));
    await expectBothCallbacks(prodOrigin);
  });

  it("keeps both callbacks on the configured loopback origin in local development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3100");
    await expectBothCallbacks("http://localhost:3100");
  });
});
