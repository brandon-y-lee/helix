import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { readCheckoutStorefrontForOrigin } from "@/lib/checkout/storefront";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Checkout | helix",
};

export default async function CheckoutPage() {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (process.env.VERCEL ? "https" : "http");
  const checkout = await readCheckoutStorefrontForOrigin(host ? `${protocol}://${host}` : null);
  const message = !checkout.admissionOpen
    ? "Checkout is currently closed."
    : checkout.mode === "live"
      ? "Review your cart, then pay by card with Stripe. Shipping and any tax are shown before payment."
      : "Test checkout. No payment will be taken and no items will ship.";
  return (
    <div className="container public-utility-page">
      <div className="page-head">
        <h1>Checkout</h1>
      </div>
      <div className="empty-state">
        <p className="checkout-panel__notice">{message}</p>
        <Link href="/cart" className="btn btn--editorial-rounded">
          Review cart
        </Link>
      </div>
    </div>
  );
}
