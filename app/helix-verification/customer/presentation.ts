import type { AccountDashboardOrder } from "@/components/account/AccountDashboardView";
import type { OrderConfirmationDisplay } from "@/components/cart/OrderConfirmationView";
import type { RewardsSummary } from "@/lib/rewards/server";
import { SANDBOX_CHECKOUT_NOTICE } from "@/lib/checkout/config";

export const CUSTOMER_FIXTURE_VIEWS = ["account", "rewards", "auth", "order"] as const;
export type CustomerFixtureView = typeof CUSTOMER_FIXTURE_VIEWS[number];
export const CUSTOMER_FIXTURE_STATES = [
  "populated", "empty", "unavailable", "unverified", "signed-out", "pending", "success", "error", "validation",
] as const;
export type CustomerFixtureState = typeof CUSTOMER_FIXTURE_STATES[number];
export const CUSTOMER_FIXTURE_FORMS = ["sign-in", "sign-up", "forgot-password", "reset-password"] as const;
export type CustomerFixtureForm = typeof CUSTOMER_FIXTURE_FORMS[number];

export function customerRewardsFixture(state: CustomerFixtureState): RewardsSummary | null {
  if (state === "unavailable") return null;
  const empty = state === "empty" || state === "signed-out";
  return {
    authenticated: state !== "signed-out",
    emailConfirmed: state !== "unverified" && state !== "signed-out",
    programName: "helix rewards",
    pointsBalance: empty ? 0 : 425,
    lifetimePoints: empty ? 0 : 725,
    estimatedPurchasePoints: 0,
    affordableTiers: [],
    referralCode: empty ? null : "SAMPLE25",
    recentLedger: empty ? [] : [
      { id: "sample-award", entry_type: "purchase_earn", points: 300, description: "Sandbox purchase Points Award.", created_at: "2026-08-19T12:00:00.000Z" },
      { id: "sample-reservation", entry_type: "redemption_reserved", points: -200, description: "Checkout Points Reservation.", created_at: "2026-08-20T12:00:00.000Z" },
      { id: "sample-release", entry_type: "redemption_released", points: 200, description: "Checkout Points Reservation released.", created_at: "2026-08-21T12:00:00.000Z" },
    ],
    feedbackRequests: empty ? [] : [{ id: "sample-feedback", order_id: "sample-order", order_number: "SAMPLE-001", points: 300 }],
  };
}

export function customerOrdersFixture(state: CustomerFixtureState): AccountDashboardOrder[] {
  return state === "empty" ? [] : [
    { id: "sample-order", order_number: "SAMPLE-001", status: "paid", total_cents: 5600, reward_points_earned: 560 },
    { id: "sample-pending", order_number: "SAMPLE-002", status: "pending_payment", total_cents: 3200, reward_points_earned: 0 },
  ];
}

export function customerOrderConfirmationFixture(state: CustomerFixtureState): OrderConfirmationDisplay | null {
  if (state === "unverified") return null;
  return {
    notice: SANDBOX_CHECKOUT_NOTICE,
    webhookPending: state === "pending",
    order: {
      order_number: "SAMPLE-001",
      status: state === "pending" ? "pending_payment" : "paid",
      reward_points_earned: state === "pending" ? 0 : 560,
      reward_points_redeemed: 200,
      merchandise_subtotal_cents: 6000,
      discount_cents: 500,
      shipping_cents: 0,
      tax_cents: 100,
      total_cents: 5600,
    },
    items: [{ id: "sample-line", product_name: "Sample skincare product", variant_label: "50 ml", quantity: 2, line_subtotal_cents: 6000 }],
  };
}
