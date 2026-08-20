import { describe, expect, it, vi } from "vitest";
import {
  CHECKOUT_CANCELLED_CART_PATH,
  buildCheckoutCancelUrl,
  isCheckoutCancelledSearchParams,
} from "@/lib/orders/checkout-cancel";

const navigation = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
}));

vi.mock("next/navigation", () => navigation);

import CheckoutCancelPage from "@/app/checkout/cancel/page";

describe("checkout cancellation routing", () => {
  it("builds a cart cancel URL without public order identifiers", () => {
    const url = buildCheckoutCancelUrl("https://helix.test");
    const parsed = new URL(url);

    expect(parsed.pathname).toBe("/cart");
    expect(parsed.searchParams.get("checkout")).toBe("cancelled");
    expect(parsed.searchParams.has("order_id")).toBe(false);
    expect(parsed.searchParams.has("session_id")).toBe(false);
    expect(parsed.searchParams.has("payment_intent")).toBe(false);
    expect(parsed.search).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    );
  });

  it("recognizes only the generic cancelled cart signal", () => {
    expect(isCheckoutCancelledSearchParams({ checkout: "cancelled" })).toBe(true);
    expect(isCheckoutCancelledSearchParams({ checkout: ["cancelled"] })).toBe(true);
    expect(isCheckoutCancelledSearchParams({ checkout: "order-123" })).toBe(false);
    expect(isCheckoutCancelledSearchParams({})).toBe(false);
  });

  it("redirects the legacy cancel page to cart without preserving query ids", () => {
    expect(() => CheckoutCancelPage()).toThrow(
      `redirect:${CHECKOUT_CANCELLED_CART_PATH}`,
    );
    expect(navigation.redirect).toHaveBeenCalledWith(CHECKOUT_CANCELLED_CART_PATH);
  });
});
