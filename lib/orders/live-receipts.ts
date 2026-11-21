import "server-only";
import { getCurrentUser } from "@/lib/auth/session";
import type { OrderConfirmationDisplay, OrderConfirmationState } from "@/lib/orders/confirmation";
import { readCheckoutReceiptTokenHash } from "@/lib/orders/receipt-access";
import { readBusinessReceiptTokenHash } from "./business-receipt-cookie";
import { matchesBusinessCheckoutSessionId, type CheckoutEnvironment } from "@/lib/checkout/payment-verification";
import { SANDBOX_CHECKOUT_NOTICE } from "@/lib/checkout/config";
import type { BusinessStripeScope } from "@/lib/stripe/live-provider";
import { readBusinessOrderShipments } from "@/lib/shipments/server";
import { isUuid, type ManualShipments } from "@/lib/shipments/contract";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type AccountOrderHistoryEntry = {
  id: string;
  order_number: string;
  status: string;
  total_cents: number;
  reward_points_earned: number;
  reward_points_redeemed: number;
  created_at: string;
  providerMode: CheckoutEnvironment;
};

const receiptStates = {
  draft: "pending", pending_payment: "pending", paid: "paid", payment_failed: "failed", cancelled: "cancelled",
  partially_refunded: "partially_refunded", refunded: "refunded",
} satisfies Record<string, OrderConfirmationState>;

function invalidProjection(): never {
  throw new Error("[orders] Invalid stored Order projection.");
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
  if (!isUuid(orderId) || typeof orderNumber !== "string" || !orderNumber ||
      typeof createdAt !== "string" || !Number.isFinite(Date.parse(createdAt)) ||
      typeof status !== "string" || !Object.hasOwn(receiptStates, status) || row.currency !== "USD" || refunded > total) {
    return invalidProjection();
  }
  const paymentStatus = status === "paid" && refunded > 0 && refunded < total ? "partially_refunded" : status;
  return { orderId, orderNumber, createdAt, status: paymentStatus as keyof typeof receiptStates, total, refunded };
}

export async function readBusinessOrderConfirmation(sessionId: string, scope: BusinessStripeScope | null): Promise<OrderConfirmationDisplay | null> {
  if (!scope || !matchesBusinessCheckoutSessionId(sessionId, scope.environment)) return null;
  const [user, hash] = await Promise.all([getCurrentUser(), readBusinessReceiptTokenHash(sessionId)]);
  const oldHash = scope.environment === "live" && !hash ? await readCheckoutReceiptTokenHash() : null;
  if (!user && !hash && !oldHash) return null;
  const admin = createSupabaseAdminClient();
  const access = { p_environment: scope.environment, p_account_id: scope.accountId, p_session_id: sessionId,
    p_user_id: user?.id ?? null, p_receipt_token_hash: hash };
  const receipt = user || hash ? await admin.rpc("read_business_checkout_receipt", { ...access, p_order_id: null }) : null;
  if (receipt?.error) throw new Error("[orders] Failed to read the Order receipt.");
  let data: unknown = receipt?.data ?? null;
  let archived = false;
  if (data === null && oldHash) {
    const prior = await admin.rpc("read_archived_live_checkout_receipt", { p_account_id: scope.accountId,
      p_session_id: sessionId, p_receipt_token_hash: oldHash });
    if (prior.error) throw new Error("[orders] Failed to read the archived Order receipt.");
    data = prior.data;
    archived = true;
  }
  if (data === null) return null;
  const row = record(data);
  const order = summary(row);
  let manualShipments: ManualShipments | null = null;
  let manualShipmentsUnavailable = false;
  if (!archived && ["paid", "partially_refunded", "refunded"].includes(order.status)) {
    try { manualShipments = await readBusinessOrderShipments(scope, order.orderId, sessionId, user?.id ?? null, hash); }
    catch { manualShipmentsUnavailable = true; }
    const authorized = await admin.rpc("authorize_business_checkout_receipt", { ...access, p_order_id: order.orderId });
    if (authorized.error) throw new Error("[orders] Failed to verify the receipt owner.");
    if (authorized.data !== true) return null;
  }
  if (!Array.isArray(row.items)) return invalidProjection();
  return {
    providerMode: scope.environment, state: receiptStates[order.status],
    notice: scope.environment === "business_sandbox" ? SANDBOX_CHECKOUT_NOTICE : "", retryAfterSeconds: 5, shipping: null,
    ...(manualShipments ? { manualShipments } : {}), ...(manualShipmentsUnavailable ? { manualShipmentsUnavailable: true } : {}),
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

export async function readBusinessOrderHistory(verifiedUserId: string, limit: number, scope: BusinessStripeScope | null): Promise<AccountOrderHistoryEntry[]> {
  if (!scope) return [];
  const { data, error } = await createSupabaseAdminClient().rpc("read_business_checkout_order_history", {
    p_environment: scope.environment, p_account_id: scope.accountId, p_user_id: verifiedUserId, p_limit: limit,
    p_before_created_at: null, p_before_id: null,
  });
  if (error || !Array.isArray(data)) throw new Error("[orders] Failed to load account orders.");
  return data.map((value: unknown) => {
    const order = summary(record(value));
    return { id: order.orderId, order_number: order.orderNumber, status: order.status, total_cents: order.total,
      created_at: order.createdAt, reward_points_earned: 0, reward_points_redeemed: 0, providerMode: scope.environment };
  });
}
