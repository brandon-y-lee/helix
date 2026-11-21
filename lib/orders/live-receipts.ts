import "server-only";
import { getCurrentUser } from "@/lib/auth/session";
import type { OrderConfirmationDisplay, OrderConfirmationState } from "@/lib/orders/confirmation";
import { readCheckoutReceiptTokenHash } from "@/lib/orders/receipt-access";
import { readLiveStripeReceiptAccountId } from "@/lib/stripe/live-provider";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type AccountOrderHistoryEntry = {
  id: string;
  order_number: string;
  status: string;
  total_cents: number;
  reward_points_earned: number;
  reward_points_redeemed: number;
  created_at: string;
  providerMode: "sandbox" | "live";
};

const receiptStates = {
  draft: "pending", pending_payment: "pending", paid: "paid", payment_failed: "failed", cancelled: "cancelled",
  partially_refunded: "partially_refunded", refunded: "refunded",
} satisfies Record<string, OrderConfirmationState>;

function invalidProjection(): never {
  throw new Error("[orders] Invalid stored live Order projection.");
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalidProjection();
  return value as Record<string, unknown>;
}

function cents(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) return invalidProjection();
  return value;
}

function summary(row: Record<string, unknown>) {
  const { orderId, orderNumber, createdAt, status } = row;
  const total = cents(row.totalCents), refunded = cents(row.refundedCents);
  if (typeof orderId !== "string" || typeof orderNumber !== "string" || !orderNumber ||
      typeof createdAt !== "string" || !Number.isFinite(Date.parse(createdAt)) ||
      typeof status !== "string" || !Object.hasOwn(receiptStates, status) || row.currency !== "USD" || refunded > total) {
    return invalidProjection();
  }
  const paymentStatus = status === "paid" && refunded > 0 && refunded < total ? "partially_refunded" : status;
  return { orderId, orderNumber, createdAt, status: paymentStatus as keyof typeof receiptStates, total, refunded };
}

export async function readLiveOrderConfirmation(sessionId: string): Promise<OrderConfirmationDisplay | null> {
  if (!/^cs_live_[A-Za-z0-9_]{1,200}$/.test(sessionId) || !process.env.HELIX_STRIPE_LIVE_ACCOUNT_ID) return null;
  const account = readLiveStripeReceiptAccountId();
  const [user, receiptHash] = await Promise.all([getCurrentUser(), readCheckoutReceiptTokenHash()]);
  if (!user && !receiptHash) return null;
  const { data, error } = await createSupabaseAdminClient().rpc("read_live_checkout_receipt", {
    p_account_id: account, p_order_id: null, p_session_id: sessionId,
    p_user_id: user?.id ?? null, p_receipt_token_hash: receiptHash,
  });
  if (error) throw new Error("[orders] Failed to read live receipt.");
  if (data === null) return null;
  const row = record(data);
  const order = summary(row);
  if (!Array.isArray(row.items)) return invalidProjection();
  return {
    providerMode: "live", state: receiptStates[order.status], notice: "", retryAfterSeconds: 5, shipping: null,
    order: {
      order_number: order.orderNumber, status: order.status, reward_points_earned: 0, reward_points_redeemed: 0,
      merchandise_subtotal_cents: cents(row.merchandiseSubtotalCents), discount_cents: cents(row.discountCents),
      shipping_cents: cents(row.shippingCents), tax_cents: cents(row.taxCents), total_cents: order.total, refunded_cents: order.refunded,
    },
    items: row.items.map((value: unknown) => {
      const item = record(value);
      if (typeof item.productName !== "string" || typeof item.variantLabel !== "string" ||
          typeof item.quantity !== "number" || !Number.isSafeInteger(item.quantity) || item.quantity < 1) return invalidProjection();
      return { product_name: item.productName, variant_label: item.variantLabel, quantity: item.quantity,
        line_subtotal_cents: cents(item.lineSubtotalCents) };
    }),
  };
}

export async function readLiveOrderHistory(verifiedUserId: string, limit: number): Promise<AccountOrderHistoryEntry[]> {
  if (!process.env.HELIX_STRIPE_LIVE_ACCOUNT_ID) return [];
  const account = readLiveStripeReceiptAccountId();
  const { data, error } = await createSupabaseAdminClient().rpc("read_live_checkout_order_history", {
    p_account_id: account, p_user_id: verifiedUserId, p_limit: limit,
    p_before_created_at: null, p_before_id: null,
  });
  if (error || !Array.isArray(data)) throw new Error("[orders] Failed to load live account orders.");
  return data.map((value: unknown) => {
    const order = summary(record(value));
    return { id: order.orderId, order_number: order.orderNumber, status: order.status, total_cents: order.total,
      created_at: order.createdAt, reward_points_earned: 0, reward_points_redeemed: 0, providerMode: "live" };
  });
}
