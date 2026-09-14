import Link from "next/link";
import { formatPrice } from "@/lib/products";

export type OrderConfirmationDisplay = {
  notice: string;
  webhookPending: boolean;
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
    id: string;
    product_name: string;
    variant_label: string;
    quantity: number;
    line_subtotal_cents: number;
  }>;
};

export function OrderConfirmationView({
  confirmation,
}: {
  confirmation: OrderConfirmationDisplay | null;
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

  return (
    <div className="container checkout-result public-utility-page">
      <div className="page-head">
        <p className="eyebrow">Sandbox checkout</p>
        <h1>Payment verified</h1>
      </div>

      <section className="checkout-result__panel" aria-label="Paid Order details">
        <p className="checkout-panel__notice">{confirmation.notice}</p>
        {confirmation.webhookPending && (
          <p className="form-status" role="status">
            Stripe has not completed payment confirmation yet. Refreshing this
            page is safe.
          </p>
        )}
        <dl className="account-details">
          <div>
            <dt>Order</dt>
            <dd>{order.order_number}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{order.status}</dd>
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

      <section className="checkout-result__panel" aria-label="Purchased items">
        <h2>Items</h2>
        <ul className="order-list">
          {items.map((item) => (
            <li key={item.id}>
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
