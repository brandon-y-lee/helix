// @vitest-environment node
import { syntheticMainContext } from "./helpers/supabase-target";
import { createHash } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { handleProductionIntake, type IntakeDependencies } from "@/lib/support/production/intake";
import { productionConfig, type ProductionEnvironment } from "@/lib/support/production/config";
import { deployedIntake } from "@/lib/support/production/runtime";

const id = "00000000-0000-4000-8000-000000000001";
const env: ProductionEnvironment = {
  ...syntheticMainContext, VERCEL: "1", VERCEL_ENV: "production", HELIX_PRODUCTION_SUPPORT_ORIGIN: "https://www.helixskin.us",
  HELIX_PRODUCTION_SUPPORT_PROJECT_REF: "erasogmsqpgiirovubjh",
  HELIX_PRODUCTION_SUPPORT_PROJECT_URL: "https://erasogmsqpgiirovubjh.supabase.co",
  HELIX_PRODUCTION_SUPPORT_CONTRACT_ID: id,
  HELIX_PRODUCTION_SUPPORT_SERVICE_ROLE_KEY: "synthetic-dedicated-service-credential-32-chars",
  HELIX_PRODUCTION_SUPPORT_ABUSE_SECRET: "synthetic-abuse-secret-32-characters-only",
  HELIX_PRODUCTION_SUPPORT_ADMISSION_ENABLED: "true", HELIX_PRODUCTION_SUPPORT_WORKER_ENABLED: "true",
  HELIX_PRODUCTION_SUPPORT_FULL_MEDIA_QUALIFIED: "true", HELIX_PRODUCTION_SUPPORT_ISOLATION_QUALIFIED: "true",
  HELIX_PRODUCTION_SUPPORT_OPERATIONS_QUALIFIED: "true",
  HELIX_PRODUCTION_SUPPORT_PHOTO_BUCKET: "support-production-private",
};
const input = { submissionId: id, name: "Synthetic visitor", email: "visitor@example.invalid", inquiryType: "general",
  subject: "Synthetic subject", body: "Synthetic message only", photos: [], uploadCapability: "a".repeat(64) };
function request(body: unknown = input, headers: Record<string, string> = {}, origin = "https://www.helixskin.us") {
  return new Request(`${origin}/api/support/production/intake`, { method: "POST", headers: {
    origin, "content-type": "application/json", "x-vercel-forwarded-for": "192.0.2.2", ...headers }, body: JSON.stringify(body) });
}
function dependencies(overrides: Partial<IntakeDependencies> = {}): IntakeDependencies {
  return { env, fullMediaImplemented: () => true,
    contract: vi.fn().mockResolvedValue({ projectRef: env.HELIX_PRODUCTION_SUPPORT_PROJECT_REF, contractId: id, photoBucket: "support-production-private", photoWorkerLimit: 1,
      admissionEnabled: true, workerEnabled: true, fullMediaQualified: true, isolationQualified: true, operationsQualified: true }),
    submit: vi.fn().mockResolvedValue({ inquiryId: id, submissionId: id, outboxId: id, status: "saved", photoStatus: "declared", reservedBytes: 0 }),
    ...overrides };
}
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it("keeps deployed availability closed with operational admission disabled despite completed source", async () => {
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value!);
  vi.stubEnv("HELIX_PRODUCTION_SUPPORT_ADMISSION_ENABLED", "false");
  vi.stubEnv("NODE_ENV", "test");
  const network = vi.fn(); vi.stubGlobal("fetch", network);
  const response = await deployedIntake(new Request("https://www.helixskin.us/api/support/production/intake"));
  expect(await response.json()).toEqual({ available: false, photosAvailable: false });
  expect((await deployedIntake(request())).status).toBe(503);
  expect(network).not.toHaveBeenCalled();
});

it("fails missing/disabled/wrong-target/context configuration before database or provider network", async () => {
  for (const change of [
    { HELIX_PRODUCTION_SUPPORT_ADMISSION_ENABLED: undefined }, { VERCEL: undefined }, { VERCEL_ENV: "preview" },
    { HELIX_PRODUCTION_SUPPORT_ORIGIN: "https://helixskin.us" },
    { HELIX_PRODUCTION_SUPPORT_PROJECT_URL: "https://wrongprojecttargetxx.supabase.co" },
    { HELIX_PRODUCTION_SUPPORT_PROJECT_REF: "zyfkunnpnlmgvrojmrbg", HELIX_PRODUCTION_SUPPORT_PROJECT_URL: "https://zyfkunnpnlmgvrojmrbg.supabase.co" },
    { HELIX_PRODUCTION_SUPPORT_SERVICE_ROLE_KEY: undefined, SUPABASE_SERVICE_ROLE_KEY: "fallback-must-not-work" },
  ]) {
    const deps = dependencies({ env: { ...env, ...change } });
    expect((await handleProductionIntake(request(), deps)).status).toBe(503);
    expect(deps.contract).not.toHaveBeenCalled(); expect(deps.submit).not.toHaveBeenCalled();
  }
  expect(() => productionConfig({ ...env, VERCEL_ENV: "development" })).toThrow();
});

it("rejects wrong origin, host, method or stored contract before private content persistence", async () => {
  for (const req of [request(input, { origin: "https://attacker.invalid" }), request(input, {}, "https://helixskin.us"),
    new Request("https://www.helixskin.us/api/support/production/intake", { method: "PUT" })]) {
    const deps = dependencies();
    expect((await handleProductionIntake(req, deps)).status).toBeGreaterThanOrEqual(400);
    expect(deps.contract).not.toHaveBeenCalled(); expect(deps.submit).not.toHaveBeenCalled();
  }
  const deps = dependencies({ contract: vi.fn().mockResolvedValue({ projectRef: "another-project", contractId: id }) });
  expect((await handleProductionIntake(request(), deps)).status).toBe(503);
  expect(deps.submit).not.toHaveBeenCalled();
});

it("returns a durable saved receipt, never Inbox delivery, and hashes capability/source/email separately", async () => {
  const deps = dependencies();
  const response = await handleProductionIntake(request(), deps);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true, receipt: { inquiryId: id, submissionId: id, status: "saved", photoStatus: "declared" } });
  expect(response.headers.get("cache-control")).toContain("no-store");
  const saved = vi.mocked(deps.submit).mock.calls[0][0];
  expect(saved.capabilityHash).toBe(createHash("sha256").update(input.uploadCapability).digest("hex"));
  expect(saved.sourceHash).toMatch(/^[a-f0-9]{64}$/); expect(saved.emailHash).not.toBe(saved.sourceHash);
  expect(JSON.stringify(saved)).not.toContain(input.uploadCapability);
  expect(saved).not.toHaveProperty("orderId");
});

it("rejects controls/header injection, extra account fields, invalid manifests and budget overflow", async () => {
  const photo = { uploadId: id, contentType: "image/jpeg", byteSize: 10 * 1024 * 1024 };
  const invalid = [ { ...input, name: "Visitor\r\nBcc: x@invalid.test" }, { ...input, body: "bad\u0000body" },
    { ...input, email: "a@example.invalid\nother" }, { ...input, orderId: id }, { ...input, photos: [photo, photo] },
    { ...input, photos: [{ ...photo, byteSize: photo.byteSize + 1 }] }, { ...input, photos: [{ ...photo, contentType: "image/svg+xml" }] },
    { ...input, photos: [{ ...photo, filename: "attacker.jpg" }] }, { ...input, photos: Array(6).fill(photo) },
    { ...input, photos: [photo, { ...photo, uploadId: id.replace(/1$/, "2") }, { ...photo, uploadId: id.replace(/1$/, "3"), byteSize: 1 }] },
    { ...input, uploadCapability: "short" }, { ...input, body: "x".repeat(10_001) } ];
  for (const body of invalid) {
    const deps = dependencies(); expect((await handleProductionIntake(request(body), deps)).status).toBe(400);
    expect(deps.submit).not.toHaveBeenCalled();
  }
});

it("persists the full five-photo declaration without minting or uploading media", async () => {
  const photos = Array.from({ length: 5 }, (_, index) => ({ uploadId: id.replace(/1$/, String(index + 1)),
    contentType: ["image/jpeg", "image/png", "image/webp"][index % 3], byteSize: 4 * 1024 * 1024 }));
  const d = dependencies();
  expect((await handleProductionIntake(request({ ...input, photos }), d)).status).toBe(200);
  expect(vi.mocked(d.submit).mock.calls[0][0].photos).toEqual(photos);
  expect(d.submit).toHaveBeenCalledOnce();
});

it("requires the trusted Vercel IP and never falls back to attacker proxy headers", async () => {
  const deps = dependencies();
  expect((await handleProductionIntake(request(input, { "x-vercel-forwarded-for": "", "x-forwarded-for": "192.0.2.3" }), deps)).status).toBe(503);
  expect(deps.submit).not.toHaveBeenCalled();
});

it("does not interpret malformed truthy stored gates as qualification", async () => {
  const d = dependencies();
  d.contract = vi.fn().mockResolvedValue({ projectRef: env.HELIX_PRODUCTION_SUPPORT_PROJECT_REF, contractId: id,
    admissionEnabled: "false", workerEnabled: true, fullMediaQualified: true, isolationQualified: true, operationsQualified: true });
  expect((await handleProductionIntake(request(), d)).status).toBe(503);
  expect(d.submit).not.toHaveBeenCalled();
});

it("bounds streamed bytes and stalled bodies, and never calls submit after a failed transaction", async () => {
  const deps = dependencies();
  const huge = request({ ...input, body: "x".repeat(49 * 1024) });
  expect((await handleProductionIntake(huge, deps)).status).toBe(413);
  expect(deps.submit).not.toHaveBeenCalled();
  vi.useFakeTimers();
  try {
    const stalled = new Request("https://www.helixskin.us/api/support/production/intake", { method: "POST", duplex: "half",
      headers: { origin: "https://www.helixskin.us", "content-type": "application/json" }, body: new ReadableStream({ start() {} }) } as RequestInit);
    const pending = handleProductionIntake(stalled, deps);
    await vi.advanceTimersByTimeAsync(5_001);
    expect((await pending).status).toBe(408);
    expect(deps.submit).not.toHaveBeenCalled();
  } finally { vi.useRealTimers(); }
  const failure = dependencies({ submit: vi.fn().mockRejectedValue(new Error("private visitor@example.invalid diagnostic")) });
  const response = await handleProductionIntake(request(), failure);
  expect(response.status).toBe(503); expect(await response.text()).not.toContain("visitor");
});
it("exposes only the exact public Storage binding after full stored identity and bucket qualification", async () => {
  const deps = dependencies();
  const result = await handleProductionIntake(new Request("https://www.helixskin.us/api/support/production/intake"), deps);
  expect(await result.json()).toEqual({available:true,photosAvailable:true,uploadBinding:{origin:env.HELIX_PRODUCTION_SUPPORT_PROJECT_URL,bucket:"support-production-private"}});
  const wrong = dependencies({env:{...env,HELIX_PRODUCTION_SUPPORT_PHOTO_BUCKET:"helix-support-photos"}});
  expect(await (await handleProductionIntake(new Request("https://www.helixskin.us/api/support/production/intake"), wrong)).json()).toEqual({available:false,photosAvailable:false});
});

it("refuses availability and admission without bounded nonzero stored photo worker capacity", async () => {
  for (const limit of [undefined, null, 0, -1, 17, 1.5, "1", true]) {
    const deps = dependencies();
    const contract = await deps.contract(productionConfig(env));
    vi.mocked(deps.contract).mockResolvedValue({ ...contract as object, photoWorkerLimit: limit });
    const availability = await handleProductionIntake(new Request("https://www.helixskin.us/api/support/production/intake"), deps);
    expect(await availability.json()).toEqual({ available: false, photosAvailable: false });
    expect((await handleProductionIntake(request(), deps)).status).toBe(503);
    expect(deps.submit).not.toHaveBeenCalled();
  }
});
