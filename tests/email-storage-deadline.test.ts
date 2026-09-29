import { afterEach, expect, it, vi } from "vitest";
const client = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => client }));
import { emailDeliveryStorage } from "@/lib/email/storage";
import type { EmailRequest } from "@/lib/email/types";
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });
it.each(["prepare", "finish"] as const)("bounds uncertain %s persistence without replaying it", async (operation) => {
  vi.useFakeTimers(); let signal: AbortSignal | undefined;
  client.rpc.mockReturnValue({ abortSignal(value: AbortSignal) { signal = value; return new Promise(() => {}); } });
  const work = operation === "prepare" ? emailDeliveryStorage.prepare("id", "lease", {} as EmailRequest)
    : emailDeliveryStorage.finish("id", "lease", { kind: "accepted", id: "provider-id" });
  const rejected = expect(work).rejects.toThrow("temporarily unavailable");
  await vi.advanceTimersByTimeAsync(3_000); await rejected;
  expect(signal?.aborted).toBe(true); expect(client.rpc).toHaveBeenCalledTimes(1);
});
