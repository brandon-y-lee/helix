import { describe, expect, it, vi } from "vitest";
import { runCleanupAttempts } from "@/scripts/db/rewards-contract-cleanup";

describe("rewards contract verifier cleanup", () => {
  it("attempts every cleanup target before reporting aggregate failure", async () => {
    const attempts = [
      { label: "Order", run: vi.fn().mockRejectedValue(new Error("first failure")) },
      { label: "referee", run: vi.fn().mockResolvedValue(undefined) },
      { label: "referrer", run: vi.fn().mockRejectedValue(new Error("last failure")) },
    ];

    await expect(runCleanupAttempts(attempts)).rejects.toThrow(
      "Remote cleanup failed for Order, referrer.",
    );
    expect(attempts[0].run).toHaveBeenCalledOnce();
    expect(attempts[1].run).toHaveBeenCalledOnce();
    expect(attempts[2].run).toHaveBeenCalledOnce();
  });
});
