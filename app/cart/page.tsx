import type { Metadata } from "next";
import { CartView } from "@/components/cart/CartView";
import { CheckoutCancellationCleanup } from "@/components/cart/CheckoutCancellationCleanup";
import { isCheckoutCancelledSearchParams } from "@/lib/orders/checkout-cancel";

export const metadata: Metadata = {
  title: "Cart | Mei Pelle",
};

type CartPageProps = {
  searchParams?: Promise<{
    checkout?: string | string[];
  }>;
};

export default async function CartPage({ searchParams }: CartPageProps) {
  const params = searchParams ? await searchParams : {};
  const checkoutCancelled = isCheckoutCancelledSearchParams(params);

  return (
    <div className="container">
      <div className="page-head">
        <h1>Cart</h1>
      </div>
      {checkoutCancelled && (
        <>
          <div className="cart-notice" role="status" aria-live="polite">
            Sandbox checkout was cancelled. Your cart is still here.
          </div>
          <CheckoutCancellationCleanup active />
        </>
      )}
      <CartView />
    </div>
  );
}
