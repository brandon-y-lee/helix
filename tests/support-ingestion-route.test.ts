import { beforeEach, afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ run: vi.fn().mockResolvedValue({ messages: 1 }) }));
vi.mock("@/lib/support/inbound", () => ({ dispatchSupportIngestion: mocks.run }));
import { POST } from "@/app/api/internal/support-ingest/route";
const secret = "synthetic-support-ingest-secret-32-characters";
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("HELIX_SUPPORT_INGEST_SECRET", secret); });
afterEach(() => vi.unstubAllEnvs());
it("requires the independent worker credential before claiming private incoming work", async () => {
  const request = (token: string) => new Request("https://helixskin.vercel.app/api/internal/support-ingest", { method: "POST", headers: { authorization: token } });
  expect((await POST(request("Bearer wrong"))).status).toBe(401);
  expect(mocks.run).not.toHaveBeenCalled();
  const response = await POST(request(`Bearer ${secret}`));
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(mocks.run).toHaveBeenCalledOnce();
});
