import { afterEach, expect, it, vi } from "vitest";
const service = vi.hoisted(() => ({ synchronizeMarketingContacts: vi.fn(), reconcileMarketingImports: vi.fn() }));
vi.mock("@/lib/marketing/service", () => service);
vi.mock("@/lib/marketing/storage", () => ({ marketingServiceStorage: {} }));
vi.mock("@/lib/marketing/provider", () => ({ resendMarketingContacts: {} }));
import { GET } from "@/app/api/internal/marketing-sync/route";
const secret = "synthetic-marketing-worker-secret-12345";
function request(auth = true) { return new Request("https://helixskin.vercel.app/api/internal/marketing-sync", { headers: auth ? { Authorization: `Bearer ${secret}` } : {} }); }
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
it("requires the private worker credential before claiming any preference work", async () => {
  vi.stubEnv("HELIX_EMAIL_DISPATCH_SECRET", secret); vi.stubEnv("HELIX_MARKETING_SYNC_ENABLED", "true");
  expect((await GET(request(false))).status).toBe(401);
  expect(service.reconcileMarketingImports).not.toHaveBeenCalled();
  expect(service.synchronizeMarketingContacts).not.toHaveBeenCalled();
});
it("keeps admission disabled by default and continues restrictive repair when new signup and sends are paused", async () => {
  vi.stubEnv("HELIX_EMAIL_DISPATCH_SECRET", secret);
  expect((await GET(request())).status).toBe(200);
  expect(service.synchronizeMarketingContacts).not.toHaveBeenCalled();
  vi.stubEnv("HELIX_MARKETING_SYNC_ENABLED", "true"); vi.stubEnv("HELIX_MARKETING_ENABLED", "false"); vi.stubEnv("HELIX_EMAIL_DISPATCH_ENABLED", "false");
  service.reconcileMarketingImports.mockResolvedValue({ claimed: 0, completed: 0, deferred: 0 });
  service.synchronizeMarketingContacts.mockResolvedValue({ claimed: 1, synced: 1, deferred: 0 });
  const response = await GET(request());
  expect(response.status).toBe(200);
  expect(service.reconcileMarketingImports.mock.invocationCallOrder[0]).toBeLessThan(service.synchronizeMarketingContacts.mock.invocationCallOrder[0]);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});
it("does not expose a provider error or private recipient in worker failures", async () => {
  vi.stubEnv("HELIX_EMAIL_DISPATCH_SECRET", secret); vi.stubEnv("HELIX_MARKETING_SYNC_ENABLED", "true");
  service.reconcileMarketingImports.mockRejectedValue(new Error("private@example.test re_private"));
  const response = await GET(request());
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("private@example.test");
});
