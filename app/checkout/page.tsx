import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Checkout | Mei Pelle",
};

export default function CheckoutPage() {
  return (
    <div className="container">
      <div className="page-head">
        <h1>Checkout</h1>
      </div>
      <p className="empty-state">
        Online checkout is not available yet. This site does not collect
        payment, shipping address, billing address, tax, fulfillment, or live
        order information.
      </p>
    </div>
  );
}
