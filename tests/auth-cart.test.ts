import { describe, expect, it } from "vitest";
import { signUpErrorMessage } from "@/lib/auth/errors";
import { safeReturnTo } from "@/lib/auth/redirect";
import { validateEmail, validatePassword } from "@/lib/auth/validation";
import { normalizeCartQuantity } from "@/lib/cart/validation";
import { CartError } from "@/lib/cart/types";

describe("safe auth redirects", () => {
  it("allows internal paths", () => {
    expect(safeReturnTo("/account")).toBe("/account");
    expect(safeReturnTo("/products/northpoint-renewal-serum")).toBe(
      "/products/northpoint-renewal-serum",
    );
  });

  it("rejects external or malformed paths", () => {
    expect(safeReturnTo("https://example.com")).toBe("/account");
    expect(safeReturnTo("//example.com")).toBe("/account");
    expect(safeReturnTo("/account\nLocation:https://example.com")).toBe("/account");
  });
});

describe("account validation", () => {
  it("validates email and password shape", () => {
    expect(validateEmail("user@example.com")).toBeNull();
    expect(validateEmail("not-email")).toMatch(/valid email/);
    expect(validatePassword("1234567")).toMatch(/at least 8/);
    expect(validatePassword("12345678")).toBeNull();
  });

  it("maps Supabase signup rate limits to an actionable message", () => {
    expect(
      signUpErrorMessage({
        code: "over_email_send_rate_limit",
        message: "email rate limit exceeded",
        status: 429,
      }),
    ).toMatch(/temporarily rate-limited/i);
  });

  it("keeps unknown signup failures generic", () => {
    expect(signUpErrorMessage({ message: "User already registered" })).toMatch(
      /could not create the account/i,
    );
  });
});

describe("cart validation", () => {
  it("bounds line quantities", () => {
    expect(normalizeCartQuantity(2)).toBe(2);
    expect(normalizeCartQuantity(150)).toBe(99);
    expect(() => normalizeCartQuantity(0)).toThrow(CartError);
    expect(() => normalizeCartQuantity(1.5)).toThrow(CartError);
  });
});
