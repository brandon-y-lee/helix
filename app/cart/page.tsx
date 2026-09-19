import type { Metadata } from "next";
import { CartView } from "@/components/cart/CartView";
import { CheckoutCancellationCleanup } from "@/components/cart/CheckoutCancellationCleanup";
import { isCheckoutCancelledSearchParams } from "@/lib/orders/checkout-cancel";

export const metadata: Metadata = {
  title: "Cart | helix",
};

type CartPageProps = {
  searchParams?: Promise<{
    checkout?: string | string[];
  }>;
};

export default async function CartPage({ searchParams }: CartPageProps) {
  const params = searchParams ? await searchParams : {};
  const returnedFromCheckout = isCheckoutCancelledSearchParams(params);

  return (
    <div className="container public-utility-page">
      <div className="page-head">
        <h1>Cart</h1>
      </div>
      {returnedFromCheckout && (
        <div className="cart-notice">
          <p>You returned from checkout. Your cart is still here.</p>
          <CheckoutCancellationCleanup active />
        </div>
      )}
      <CartView />
    </div>
  );
}
