import { afterEach, expect, it, vi } from "vitest";
const client = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => client }));
import { marketingRequestStorage } from "@/lib/marketing/storage";
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });
it("bounds an unresolved preference write without replaying the mutation", async () => {
  vi.useFakeTimers();
  let signal: AbortSignal | undefined;
  client.rpc.mockReturnValue({ abortSignal(value: AbortSignal) { signal = value; return new Promise(() => {}); } });
  const work = marketingRequestStorage.confirm("C".repeat(43), "P".repeat(43), "welcome");
  const rejected = expect(work).rejects.toThrow("temporarily unavailable");
  await vi.advanceTimersByTimeAsync(3_000);
  await rejected;
  expect(signal?.aborted).toBe(true);
  expect(client.rpc).toHaveBeenCalledTimes(1);
});
it("returns a completed write without leaving a deadline timer", async () => {
  vi.useFakeTimers();
  client.rpc.mockReturnValue({ abortSignal: () => Promise.resolve({ data: { status: "confirmed" }, error: null }) });
  expect(await marketingRequestStorage.confirm("C".repeat(43), "P".repeat(43), "welcome")).toEqual({ status: "confirmed" });
  expect(client.rpc).toHaveBeenCalledWith("confirm_marketing_subscription_scoped", expect.objectContaining({p_scope:"welcome"}));
  expect(vi.getTimerCount()).toBe(0);
});
