import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

import ProductNotificationsVerificationPage from "@/app/helix-verification/product-notifications/page";

beforeEach(() => {
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("HELIX_VERIFICATION_ADAPTER", "1");
});
afterEach(() => vi.unstubAllEnvs());

describe("Product notification verification route", () => {
  it.each([undefined, "", "0", "true"])(
    "rejects requests without the exact local verification flag: %s",
    (flag) => {
      vi.stubEnv("HELIX_VERIFICATION_ADAPTER", flag);
      expect(() => ProductNotificationsVerificationPage()).toThrow("NOT_FOUND");
    },
  );

  it("rejects Vercel even when verification is enabled", () => {
    vi.stubEnv("VERCEL", "1");
    expect(() => ProductNotificationsVerificationPage()).toThrow("NOT_FOUND");
  });

  it("renders the synthetic enrollment interface only in local verification", () => {
    expect(ProductNotificationsVerificationPage()).toBeTruthy();
  });
});
