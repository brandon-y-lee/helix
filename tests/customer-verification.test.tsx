import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
}));

import VerificationLayout from "@/app/helix-verification/layout";
import CustomerVerificationPage from "@/app/helix-verification/customer/[view]/page";

describe("local presentation verification boundary", () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    { adapter: "", vercel: "" },
    { adapter: "1", vercel: "1" },
    { adapter: "1", vercel: "true" },
  ])("rejects ordinary or Vercel execution: %o", ({ adapter, vercel }) => {
    vi.stubEnv("HELIX_VERIFICATION_ADAPTER", adapter);
    vi.stubEnv("VERCEL", vercel);
    expect(() => VerificationLayout({ children: "Synthetic account" }))
      .toThrow("NEXT_NOT_FOUND");
  });

  it("renders only in the isolated local adapter", () => {
    vi.stubEnv("HELIX_VERIFICATION_ADAPTER", "1");
    vi.stubEnv("VERCEL", "");
    expect(VerificationLayout({ children: "Synthetic account" }))
      .toBe("Synthetic account");
  });

  it("rejects a direct customer fixture request outside the adapter", async () => {
    vi.stubEnv("HELIX_VERIFICATION_ADAPTER", "");
    vi.stubEnv("VERCEL", "");
    await expect(CustomerVerificationPage({ params: Promise.resolve({ view: "account" }), searchParams: Promise.resolve({}) }))
      .rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("rejects unknown presentation views and states", async () => {
    vi.stubEnv("HELIX_VERIFICATION_ADAPTER", "1");
    vi.stubEnv("VERCEL", "");
    await expect(CustomerVerificationPage({ params: Promise.resolve({ view: "unknown" }), searchParams: Promise.resolve({}) }))
      .rejects.toThrow("NEXT_NOT_FOUND");
    await expect(CustomerVerificationPage({ params: Promise.resolve({ view: "account" }), searchParams: Promise.resolve({ state: "unknown" }) }))
      .rejects.toThrow("NEXT_NOT_FOUND");
  });
});
