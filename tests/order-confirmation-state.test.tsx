import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OrderConfirmationView } from "@/components/cart/OrderConfirmationView";
import type { OrderConfirmationDisplay, OrderConfirmationState } from "@/lib/orders/confirmation";

function receipt(state: OrderConfirmationState): OrderConfirmationDisplay {
  return {
    state,
    notice: "Sandbox Checkout — no real charge or fulfillment.",
    retryAfterSeconds: 5,
    order: {
      order_number: "HX-100",
      status: state,
      reward_points_earned: 0,
      reward_points_redeemed: 0,
      merchandise_subtotal_cents: 2500,
      discount_cents: 0,
      shipping_cents: 500,
      tax_cents: 240,
      total_cents: 3240,
    },
    items: [{ product_name: "Super Serum", variant_label: "30 mL", quantity: 1, line_subtotal_cents: 2500 }],
    shipping: null,
  };
}

describe("truthful private Order confirmation", () => {
  it("distinguishes a reported refund from unfinished local reconciliation", () => {
    const confirmation = receipt("exception");
    confirmation.verificationIssue = "refund_reconciliation";
    render(<OrderConfirmationView confirmation={confirmation} />);
    expect(screen.getByRole("heading", { name: "Refund needs verification", level: 1 })).toBeVisible();
    const details = screen.getByRole("region", { name: "Refund verification details" });
    expect(within(details).getByText("Refund records need verification")).toBeVisible();
    expect(within(details).getByRole("status")).toHaveTextContent("Stripe reported a sandbox refund. The Order records still need verification.");
    expect(screen.queryByRole("heading", { name: "Payment refunded" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Payment may have been reported/)).not.toBeInTheDocument();
  });

  it("shows the authorized verified shipping address separately from payment state", () => {
    const confirmation = receipt("paid");
    confirmation.shipping = {
      name: "River Sample",
      line1: "510 Example Avenue",
      line2: "Unit 2",
      city: "San Francisco",
      state: "CA",
      postal_code: "94110",
      country: "US",
    };
    render(<OrderConfirmationView confirmation={confirmation} />);
    const shipping = screen.getByRole("region", { name: "Shipping address" });
    expect(shipping).toHaveTextContent("River Sample");
    expect(shipping).toHaveTextContent("510 Example Avenue");
    expect(shipping).toHaveTextContent("Unit 2");
    expect(shipping).toHaveTextContent("San Francisco, CA 94110");
    expect(shipping).toHaveTextContent("US");
  });

  it("does not present an unverified address as a fixed shipping destination", () => {
    const confirmation = receipt("pending");
    confirmation.shipping = {
      name: "Unverified",
      line1: "510 Example Avenue",
      line2: null,
      city: "San Francisco",
      state: "CA",
      postal_code: "94110",
      country: "US",
    };
    render(<OrderConfirmationView confirmation={confirmation} />);
    expect(screen.queryByRole("region", { name: "Shipping address" })).not.toBeInTheDocument();
    expect(screen.queryByText("Unverified")).not.toBeInTheDocument();
  });

  it.each([
    ["paid", "Sandbox payment verified", "Paid Order details", "Paid"],
    ["failed", "Payment failed", "Payment-failed Order details", "Failed"],
    ["cancelled", "Checkout cancelled", "Cancelled Order details", "Cancelled"],
    ["partially_refunded", "Payment partially refunded", "Partially refunded Order details", "Partially refunded"],
    ["refunded", "Payment refunded", "Refunded Order details", "Refunded"],
    ["exception", "Payment needs verification", "Order verification details", "Needs verification"],
  ] as const)("presents %s with matching heading and accessible status", (state, heading, label, status) => {
    render(<OrderConfirmationView confirmation={receipt(state)} />);
    expect(screen.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    expect(within(screen.getByRole("region", { name: label })).getByText(status)).toBeVisible();
    if (state !== "paid") {
      expect(screen.queryByRole("heading", { name: "Sandbox payment verified" })).not.toBeInTheDocument();
    }
    expect(screen.getByText(/no real charge or fulfillment/)).toBeVisible();
  });
});
