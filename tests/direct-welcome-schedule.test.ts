import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { GET, HEAD, POST } from "@/app/api/internal/marketing/production/maintenance/route";

const mocks = vi.hoisted(() => ({
  operator: vi.fn(), authorized: vi.fn(), qualification: vi.fn(), cleanup: vi.fn(), dispatch: vi.fn(),
}));
vi.mock("@/lib/admin/capabilities", () => ({ ADMIN_CAPABILITIES: { access: "admin.access" }, checkAdminCapability: mocks.operator }));
vi.mock("@/lib/release/deployment-authorization", () => ({ productionDeploymentAuthorized: mocks.authorized }));
vi.mock("@/lib/production-marketing/storage", () => ({ productionSignupQualification: mocks.qualification }));
vi.mock("@/lib/production-marketing/delivery-storage", () => ({ createProductionMarketingDeliveryStorage: () => ({ cleanup: mocks.cleanup }) }));
vi.mock("@/app/api/internal/marketing/production/dispatch/route", () => ({ POST: mocks.dispatch }));

const site = "https://www.helixskin.us";
const immutable = "https://helix-one.vercel.app";
const path = "/api/internal/marketing/production/maintenance";
const worker = "private-worker-".repeat(3), cron = "schedule-secret-".repeat(3);
const digest = "a".repeat(64), sha = "b".repeat(40);
const binding = { p_contract_hash: digest, p_worker_binding_hash: "c".repeat(64) };
const identity = { projectId: "prj_test", deploymentId: "dpl_One", sourceSha: sha };
const get = (origin = site) => GET(new Request(origin + path));
const tick = (origin = site, token = cron, body?: string) => POST(new Request(origin + path, {
  method: "POST", headers: { authorization: "Bearer " + token }, body,
}));
const canonical = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.resetAllMocks();
  for (const [name, value] of Object.entries({
    HELIX_PRODUCTION_MARKETING_WORKER_TOKEN: worker, CRON_SECRET: cron,
    HELIX_PRODUCTION_MARKETING_DISPATCH_ENABLED: "true", VERCEL_PROJECT_ID: identity.projectId,
    VERCEL_DEPLOYMENT_ID: identity.deploymentId, VERCEL_GIT_COMMIT_SHA: sha, VERCEL_URL: "helix-one.vercel.app",
  })) vi.stubEnv(name, value);
  vi.stubGlobal("fetch", canonical);
  mocks.authorized.mockResolvedValue(true);
  mocks.operator.mockResolvedValue({ status: "allowed", access: { role: "admin" } });
  mocks.qualification.mockReturnValue(binding);
  mocks.dispatch.mockResolvedValue(Response.json({ status: "idle" }));
  canonical.mockResolvedValue(new Response(null, { headers: { "X-Helix-Deployment": identity.deploymentId } }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("the production welcome schedule", () => {
  it("declares one empty Vercel path POST on the storefront", () => {
    const config = JSON.parse(readFileSync("vercel.json", "utf8"));
    expect(config.schedules["confirmed-welcome"]).toEqual({ schedule: "* * * * *", path, requestMethod: "POST" });
  });
  it("returns only the credential binding and exact identity on the held production artifact", async () => {
    const response = await get(immutable);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({ ...identity, ...binding });
    expect(canonical).not.toHaveBeenCalled();
    expect(mocks.cleanup).not.toHaveBeenCalled();
    expect(mocks.dispatch).not.toHaveBeenCalled();
    const readIdentity = await HEAD(new Request(site + path, { headers: { authorization: "Bearer " + worker } }));
    expect(readIdentity.headers.get("x-helix-deployment")).toBe(identity.deploymentId);
    expect(readIdentity.body).toBeNull();
  });
  it("rejects a wrong secret, target, runtime, query, body or overlapping credentials before work", async () => {
    mocks.operator.mockResolvedValueOnce({ status: "unauthenticated" });
    expect((await get()).status).toBe(401);
    mocks.operator.mockResolvedValueOnce({ status: "allowed", access: { role: "catalog_editor" } });
    expect((await get()).status).toBe(403);
    expect((await HEAD(new Request(site + path))).status).toBe(401);
    expect((await tick(site, worker)).status).toBe(401);
    expect((await tick("https://helix-other.vercel.app")).status).toBe(403);
    expect((await get("https://attacker.example")).status).toBe(403);
    expect((await GET(new Request(site + path + "?to=example", { headers: { authorization: "Bearer " + worker } }))).status).toBe(403);
    expect((await tick(site, cron, '{"to":"nobody"}')).status).toBe(400);
    mocks.authorized.mockResolvedValue(false);
    expect((await get(immutable)).status).toBe(403);
    expect((await tick()).status).toBe(403);
    vi.stubEnv("CRON_SECRET", worker);
    expect((await tick(site, worker)).status).toBe(401);
    expect(canonical).not.toHaveBeenCalled();
    expect(mocks.cleanup).not.toHaveBeenCalled();
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });
  it("dispatches one empty, fixed canonical request and never forwards inputs", async () => {
    expect((await tick()).status).toBe(200);
    expect(mocks.dispatch).toHaveBeenCalledTimes(1);
    const [sent] = mocks.dispatch.mock.calls[0] as [Request];
    expect([sent.method, sent.url, sent.body]).toEqual(["POST", site + "/api/internal/marketing/production/dispatch", null]);
    expect(sent.headers.get("authorization")).toBe("Bearer " + worker);
    expect(canonical).not.toHaveBeenCalled();
  });
  it("on a provider hostname checks the canonical deployment before doing work", async () => {
    canonical.mockResolvedValueOnce(new Response(null, { headers: { "X-Helix-Deployment": "dpl_Other" } }));
    expect((await tick(immutable)).status).toBe(409);
    expect(mocks.dispatch).not.toHaveBeenCalled();
    expect((await tick(immutable)).status).toBe(200);
    expect(canonical).toHaveBeenLastCalledWith(site + path, expect.objectContaining({ method: "HEAD", redirect: "error", cache: "no-store" }));
    expect(mocks.dispatch).toHaveBeenCalledTimes(1);
  });
  it("keeps payload erasure available while dispatch is paused", async () => {
    vi.stubEnv("HELIX_PRODUCTION_MARKETING_DISPATCH_ENABLED", "false");
    expect(await (await tick()).json()).toEqual({ status: "paused" });
    expect(mocks.cleanup).toHaveBeenCalledOnce();
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });
  it("keeps an unavailable canonical check or credential binding fail-closed", async () => {
    canonical.mockRejectedValue(new Error("down"));
    mocks.qualification.mockImplementation(() => { throw new Error("missing"); });
    expect((await get(immutable)).status).toBe(503);
    expect((await tick(immutable)).status).toBe(503);
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });
});
