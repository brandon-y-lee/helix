import { describe, expect, it } from "vitest";
import { paymentRetryDelaySeconds, parseProviderRetryAfter } from "@/lib/payments/retry-policy";

describe("durable payment retry policy", () => {
  it("backs off through the approved series without retry storms", () => {
    expect(Array.from({ length: 12 }, (_, i) => paymentRetryDelaySeconds(i + 1, { random: () => 0 })))
      .toEqual([60, 120, 240, 480, 960, 1920, 3600, 3600, 3600, 3600, 3600, 3600]);
    expect(paymentRetryDelaySeconds(1, { random: () => 1 })).toBe(66);
    expect(paymentRetryDelaySeconds(12, { random: () => 1 })).toBe(3600);
  });
  it("honors longer bounded provider Retry-After without exposing arbitrary headers", () => {
    expect(paymentRetryDelaySeconds(7, { retryAfterSeconds: 7200 })).toBe(7200);
    expect(paymentRetryDelaySeconds(1, { retryAfterSeconds: 5, random: () => 0 })).toBe(60);
    expect(parseProviderRetryAfter("7200")).toBe(7200);
    expect(parseProviderRetryAfter("Fri, 18 Sep 2026 12:02:00 GMT", Date.parse("2026-09-18T12:00:00Z"))).toBe(120);
    for (const value of ["-1", "Infinity", "1.5", "9999999999", "secret provider message", null, 123]) {
      expect(parseProviderRetryAfter(value, Date.parse("2026-09-18T12:00:00Z"))).toBeUndefined();
    }
  });
});
