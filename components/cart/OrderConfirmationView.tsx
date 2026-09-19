import Link from "next/link";
import type { ReactNode } from "react";
import { formatPrice } from "@/lib/products";
import type { OrderConfirmationDisplay, OrderConfirmationState } from "@/lib/orders/confirmation";

export type { OrderConfirmationDisplay } from "@/lib/orders/confirmation";

const STATUS_COPY: Record<OrderConfirmationState, {
  heading: string;
  label: string;
  status: string;
  message: string;
}> = {
  pending: {
    heading: "Awaiting payment confirmation",
    label: "Pending Order details",
    status: "Awaiting confirmation",
    message: "Payment has not been verified yet. Refreshing this page is safe.",
  },
  paid: {
    heading: "Sandbox payment verified",
    label: "Paid Order details",
    status: "Paid",
    message: "Your sandbox payment is verified. This Order will not be shipped.",
  },
  failed: {
    heading: "Payment failed",
    label: "Payment-failed Order details",
    status: "Failed",
    message: "This sandbox payment attempt failed. You can return to your cart.",
  },
  cancelled: {
    heading: "Checkout cancelled",
    label: "Cancelled Order details",
    status: "Cancelled",
    message: "This unpaid checkout was cancelled or expired.",
  },
  partially_refunded: {
    heading: "Payment partially refunded",
    label: "Partially refunded Order details",
    status: "Partially refunded",
    message: "Part of this sandbox payment has been refunded. The amounts below preserve the original Order.",
  },
  refunded: {
    heading: "Payment refunded",
    label: "Refunded Order details",
    status: "Refunded",
    message: "This sandbox payment has been fully refunded. The amounts below preserve the original Order.",
  },
  exception: {
    heading: "Payment needs verification",
    label: "Order verification details",
    status: "Needs verification",
    message: "We could not confirm all Order details. Payment may have been reported; avoid paying again until verification is complete.",
  },
};

export function OrderConfirmationView({
  confirmation,
  statusRefresh,
}: {
  confirmation: OrderConfirmationDisplay | null;
  statusRefresh?: ReactNode;
}) {
  if (!confirmation) {
    return (
      <div className="container public-utility-page">
        <div className="page-head">
          <p className="eyebrow">Sandbox checkout</p>
          <h1>Order status</h1>
        </div>
        <div className="empty-state">
          <p>We could not verify this payment status.</p>
          <Link href="/cart" className="btn btn--editorial-rounded">
            Return to cart
          </Link>
        </div>
      </div>
    );
  }

  const { order, items } = confirmation;
  const copy = confirmation.state === "exception" && confirmation.verificationIssue === "refund_reconciliation"
    ? {
      heading: "Refund needs verification",
      label: "Refund verification details",
      status: "Refund records need verification",
      message: "Stripe reported a sandbox refund. The Order records still need verification.",
    }
    : STATUS_COPY[confirmation.state];
  const shipping = ["paid", "partially_refunded", "refunded"].includes(confirmation.state)
    ? confirmation.shipping
    : null;

  return (
    <div className="container checkout-result public-utility-page">
      <div className="page-head">
        <p className="eyebrow">Sandbox checkout</p>
        <h1>{copy.heading}</h1>
      </div>

      <section className="checkout-result__panel" aria-label={copy.label}>
        <p className="checkout-panel__notice">{confirmation.notice}</p>
        <p className="form-status" role="status">{copy.message}</p>
        {statusRefresh}
        <dl className="account-details">
          <div>
            <dt>Order</dt>
            <dd>{order.order_number}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{copy.status}</dd>
          </div>
          <div>
            <dt>Points earned</dt>
            <dd>{order.reward_points_earned}</dd>
          </div>
          <div>
            <dt>Points redeemed</dt>
            <dd>{order.reward_points_redeemed}</dd>
          </div>
        </dl>
      </section>

      {shipping && (
        <section className="checkout-result__panel" aria-label="Shipping address">
          <h2>Shipping address</h2>
          <p>
            {shipping.name}<br />
            {shipping.line1}<br />
            {shipping.line2 && <>{shipping.line2}<br /></>}
            {shipping.city}, {shipping.state} {shipping.postal_code}<br />
            {shipping.country}
          </p>
        </section>
      )}

      <section className="checkout-result__panel" aria-label="Order items">
        <h2>Items</h2>
        <ul className="order-list">
          {items.map((item, index) => (
            <li key={index}>
              <span>{item.product_name}</span>
              <span>{item.variant_label}</span>
              <span>Qty {item.quantity}</span>
              <span>{formatPrice(item.line_subtotal_cents)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="checkout-result__panel" aria-label="Order totals">
        <h2>Totals</h2>
        <div className="summary-row">
          <span>Merchandise</span>
          <span>{formatPrice(order.merchandise_subtotal_cents)}</span>
        </div>
        <div className="summary-row">
          <span>Discount</span>
          <span>-{formatPrice(order.discount_cents)}</span>
        </div>
        <div className="summary-row">
          <span>Shipping</span>
          <span>{formatPrice(order.shipping_cents)}</span>
        </div>
        <div className="summary-row">
          <span>Tax</span>
          <span>{formatPrice(order.tax_cents)}</span>
        </div>
        <div className="summary-row summary-row--total">
          <span>Total</span>
          <span>{formatPrice(order.total_cents)}</span>
        </div>
      </section>

      <div className="checkout-result__actions">
        <Link href="/account" className="btn btn--editorial-rounded">
          Account
        </Link>
        <Link href="/collections/shop" className="btn btn--ghost btn--editorial-rounded">
          Continue shopping
        </Link>
      </div>
    </div>
  );
}
