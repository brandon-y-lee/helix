export type OrderConfirmationState =
  | "pending"
  | "paid"
  | "failed"
  | "cancelled"
  | "partially_refunded"
  | "refunded"
  | "exception";

/** The private receipt's display contract. Never pass storage/provider records to the UI. */
export type OrderConfirmationDisplay = {
  state: OrderConfirmationState;
  verificationIssue?: "refund_reconciliation" | null;
  notice: string;
  retryAfterSeconds: number;
  order: {
    order_number: string;
    status: string;
    reward_points_earned: number;
    reward_points_redeemed: number;
    merchandise_subtotal_cents: number;
    discount_cents: number;
    shipping_cents: number;
    tax_cents: number;
    total_cents: number;
  };
  items: Array<{
    product_name: string;
    variant_label: string;
    quantity: number;
    line_subtotal_cents: number;
  }>;
  shipping: {
    name: string;
    line1: string;
    line2: string | null;
    city: string;
    state: string;
    postal_code: string;
    country: string;
  } | null;
};
