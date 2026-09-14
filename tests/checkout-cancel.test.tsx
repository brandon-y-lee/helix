import { describe, expect, it } from "vitest";
import {
  buildCheckoutCancelUrl,
  isCheckoutCancelledSearchParams,
} from "@/lib/orders/checkout-cancel";

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
});
