import type { Metadata } from "next";
import Link from "next/link";
import { SANDBOX_CHECKOUT_NOTICE } from "@/lib/checkout/config";

export const metadata: Metadata = {
  title: "Checkout | Mei Pelle",
};

export default function CheckoutPage() {
  return (
    <div className="container">
      <div className="page-head">
        <h1>Checkout</h1>
      </div>
      <div className="empty-state">
        <p className="checkout-panel__notice">{SANDBOX_CHECKOUT_NOTICE}</p>
        <p>
          Checkout starts from your cart and redirects to Stripe-hosted Checkout
          in sandbox mode. No real charge, shipment, fulfillment, customer email,
          or Trustpilot invitation is created from this environment.
        </p>
        <Link href="/cart" className="btn btn--editorial-rounded">
          Review cart
        </Link>
      </div>
    </div>
  );
}
