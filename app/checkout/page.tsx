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
        Checkout is a development placeholder. Real payments are not
        implemented.
      </p>
    </div>
  );
}
