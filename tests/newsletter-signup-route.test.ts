import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { POST } from "@/app/api/marketing/newsletter/route";
import { BUSINESS_SANDBOX_STOREFRONT_ORIGIN, HELIX_VERCEL_PROJECT_ID } from "@/lib/supabase/project-safety";

const { client, rpc, authorize, abortSignal } = vi.hoisted(() => ({
  client: vi.fn(),
  rpc: vi.fn(),
  authorize: vi.fn(),
  abortSignal: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: client }));
vi.mock("@/lib/release/deployment-authorization", () => ({ productionDeploymentAuthorized: authorize }));

const production = "https://www.helixskin.us";
const dev = BUSINESS_SANDBOX_STOREFRONT_ORIGIN;

function request(target = production, body: unknown = { email: " Footer@Example.invalid " }, headers = {}) {
  return new Request(target + "/api/marketing/newsletter", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json", origin: target, "x-vercel-forwarded-for": "192.0.2.2", ...headers },
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "synthetic-key");
  authorize.mockResolvedValue(true);
  client.mockReturnValue({ rpc });
  rpc.mockReturnValue({ abortSignal });
  abortSignal.mockResolvedValue({ data: "added", error: null });
});
afterEach(() => vi.unstubAllEnvs());

it("accepts only a normalized address with a pseudonymous, bounded storage call", async () => {
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(await response.json()).toEqual({ outcome: "added" });
  expect(rpc).toHaveBeenCalledExactlyOnceWith("sign_up_for_newsletter", {
    p_email: "footer@example.invalid",
    p_requester_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
  });
  expect(abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
});

it("keeps the canonical, isolated dev and unauthorised origins separate", async () => {
  authorize.mockResolvedValue(false);
  expect((await POST(request())).status).toBe(403);
  expect((await POST(request(dev))).status).toBe(403);
  expect((await POST(request(production, { email: "x@example.invalid" }, { origin: "https://other.invalid" }))).status).toBe(403);
  expect(client).not.toHaveBeenCalled();

  vi.stubEnv("VERCEL", "1");
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("VERCEL_PROJECT_ID", HELIX_VERCEL_PROJECT_ID);
  vi.stubEnv("VERCEL_GIT_COMMIT_REF", "codex/558-verified-dev-preview");
  expect((await POST(request(dev))).status).toBe(200);
  expect(client).toHaveBeenCalledTimes(1);
});

it("fails closed for invalid payloads or missing trusted rate-limit input", async () => {
  expect((await POST(request(production, { email: "invalid" }))).status).toBe(400);
  expect((await POST(request(production, { email: "x@example.invalid", consent: true }))).status).toBe(400);
  expect((await POST(request(production, { email: "x".repeat(2000) }))).status).toBe(413);
  expect((await POST(request(production, { email: "x@example.invalid" }, { "x-vercel-forwarded-for": "" }))).status).toBe(503);
  expect(client).not.toHaveBeenCalled();
});

it("reports a repeat signup without returning the address", async () => {
  abortSignal.mockResolvedValue({ data: "already_added", error: null });
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ outcome: "already_added" });
});

it("reports rate rejection and unavailable storage without claiming signup", async () => {
  abortSignal.mockResolvedValueOnce({ data: "limited", error: null }).mockResolvedValueOnce({ data: null, error: new Error("private") });
  for (const status of [429, 503]) {
    const response = await POST(request());
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ ok: false });
  }
});
