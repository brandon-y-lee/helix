import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AccountDashboardView } from "@/components/account/AccountDashboardView";
import { OrderConfirmationView } from "@/components/cart/OrderConfirmationView";

describe("customer presentation views", () => {
  it("does not display paid order details when payment status is unverified", () => {
    render(<OrderConfirmationView confirmation={null} />);

    expect(screen.getByRole("heading", { name: "Order status", level: 1 })).toBeVisible();
    expect(screen.getByText("We could not verify this payment status.")).toBeVisible();
    expect(screen.getByRole("link", { name: "Return to cart" })).toHaveAttribute("href", "/cart");
    expect(screen.queryByRole("region", { name: "Paid Order details" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Payment verified" })).not.toBeInTheDocument();
  });

  it("shows supplied historical order amounts and the pending confirmation notice", () => {
    render(
      <OrderConfirmationView
        confirmation={{
          notice: "Sandbox order notice.",
          state: "pending",
          retryAfterSeconds: 5,
          shipping: null,
          order: {
            order_number: "HLX-1001",
            status: "pending",
            reward_points_earned: 0,
            reward_points_redeemed: 500,
            merchandise_subtotal_cents: 6800,
            discount_cents: 500,
            shipping_cents: 600,
            tax_cents: 552,
            total_cents: 7452,
          },
          items: [
            {
              product_name: "Super Serum",
              variant_label: "30 mL",
              quantity: 2,
              line_subtotal_cents: 6800,
            },
          ],
        }}
      />,
    );

    expect(screen.getByRole("heading", { name: "Awaiting payment confirmation", level: 1 })).toBeVisible();
    expect(screen.queryByText("Payment verified")).not.toBeInTheDocument();
    const details = screen.getByRole("region", { name: "Pending Order details" });
    expect(within(details).getByText("HLX-1001")).toBeVisible();
    expect(within(details).getByText("Awaiting confirmation")).toBeVisible();
    expect(within(details).getByRole("status"))
      .toHaveTextContent("Payment has not been verified yet.");
    const items = screen.getByRole("region", { name: "Order items" });
    expect(within(items).getByText("Super Serum")).toBeVisible();
    expect(within(items).getByText("Qty 2")).toBeVisible();
    const totals = screen.getByRole("region", { name: "Order totals" });
    expect(within(totals).getByText("Merchandise").nextElementSibling).toHaveTextContent("$68.00");
    expect(within(totals).getByText("Discount").nextElementSibling).toHaveTextContent("-$5.00");
    expect(within(totals).getByText("Total").nextElementSibling).toHaveTextContent("$74.52");
  });

  it("shows supplied account history and form controls without loading account data", () => {
    render(
      <AccountDashboardView
        email="customer@example.test"
        verified={false}
        orders={[
          {
            id: "order-1",
            order_number: "HLX-1001",
            status: "paid",
            verification_required: false,
            total_cents: 6800,
            reward_points_earned: 68,
          },
        ]}
        rewards={{
          pointsBalance: 425,
          lifetimePoints: 725,
          referralCode: "HELIX25",
          feedbackRequests: [
            {
              id: "feedback-1",
              order_id: "order-1",
              order_number: "HLX-1001",
              points: 300,
            },
          ],
        }}
        profileForm={<label>First name<input defaultValue="Alex" /></label>}
        signOutControl={<button type="button">Sign out</button>}
        renderFeedback={(request) => (
          <button type="button">Feedback for {request.order_number}</button>
        )}
      />,
    );

    expect(screen.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();
    expect(screen.getByText("customer@example.test")).toBeVisible();
    expect(screen.getByText("Pending email verification")).toBeVisible();
    expect(screen.getByLabelText("First name")).toHaveValue("Alex");
    expect(screen.getByRole("button", { name: "Sign out" })).toBeVisible();
    const orders = screen.getByRole("heading", { name: "Orders" }).parentElement!;
    expect(within(orders).getByText("HLX-1001")).toBeVisible();
    expect(within(orders).getByText("$68.00")).toBeVisible();
    expect(within(orders).getByText("68 pts")).toBeVisible();
    expect(screen.getByRole("button", { name: "Feedback for HLX-1001" })).toBeVisible();
    expect(screen.getByText("Available Points Balance").nextElementSibling)
      .toHaveTextContent("425");
  });

  it("retains empty account history and rewards setup guidance", () => {
    render(
      <AccountDashboardView
        email="customer@example.test"
        verified
        orders={[]}
        rewards={null}
        profileForm={null}
        signOutControl={null}
        renderFeedback={() => null}
      />,
    );

    expect(screen.getByText("Verified")).toBeVisible();
    expect(screen.getByText(/Guest orders do not appear in account history/)).toBeVisible();
    expect(screen.getByText("Available after rewards setup")).toBeVisible();
    expect(screen.getByText(/Eligible Paid Orders can unlock one private feedback request/))
      .toBeVisible();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("shows unresolved payment verification ahead of a historical refunded status", () => {
    render(
      <AccountDashboardView
        email="customer@example.test"
        verified
        orders={[
          { id: "order-1", order_number: "HLX-1001", status: "refunded", verification_required: true,
            total_cents: 2500, reward_points_earned: 0 },
          { id: "order-2", order_number: "HLX-1002", status: "refunded", verification_required: false,
            total_cents: 2500, reward_points_earned: 0 },
        ]}
        rewards={null}
        profileForm={null}
        signOutControl={null}
        renderFeedback={() => null}
      />,
    );
    const uncertain = screen.getByText("HLX-1001").closest("li")!;
    expect(within(uncertain).getByText("Verification required")).toBeVisible();
    expect(within(uncertain).queryByText("refunded")).not.toBeInTheDocument();
    const confirmed = screen.getByText("HLX-1002").closest("li")!;
    expect(within(confirmed).getByText("refunded")).toBeVisible();
  });
});
