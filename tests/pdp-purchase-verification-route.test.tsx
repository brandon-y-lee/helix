import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NOT_FOUND"); },
}));

import PdpPurchaseVerificationPage from "@/app/helix-verification/pdp-purchase/page";

beforeEach(() => {
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("HELIX_VERIFICATION_ADAPTER", "1");
});

afterEach(() => vi.unstubAllEnvs());

describe("PDP purchase verification route", () => {
  it.each([undefined, "", "0", "true"])(
    "rejects requests without the explicit local adapter flag: %s",
    async (flag) => {
      vi.stubEnv("HELIX_VERIFICATION_ADAPTER", flag);
      await expect(PdpPurchaseVerificationPage({})).rejects.toThrow("NOT_FOUND");
    },
  );

  it("rejects Vercel even when verification is enabled", async () => {
    vi.stubEnv("VERCEL", "1");
    await expect(PdpPurchaseVerificationPage({})).rejects.toThrow("NOT_FOUND");
  });

  it.each([
    { presentation: "unrecognized" },
    { presentation: "" },
    { presentation: [] },
    { presentation: ["default"] },
    { presentation: ["default", "mobile-pilot"] },
  ])("rejects unsupported presentation queries: $presentation", async ({ presentation }) => {
    await expect(PdpPurchaseVerificationPage({
      searchParams: Promise.resolve({ presentation }),
    })).rejects.toThrow("NOT_FOUND");
  });

  it.each([undefined, "default", "mobile-pilot"])("allows the supported presentation %s", async (presentation) => {
    await expect(PdpPurchaseVerificationPage({
      searchParams: Promise.resolve({ presentation }),
    })).resolves.toBeTruthy();
  });
});
