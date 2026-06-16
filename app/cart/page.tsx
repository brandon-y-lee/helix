import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cart | Mei Pelle",
};

export default function CartPage() {
  return (
    <article>
      <h1>Cart</h1>
      <p>Your cart is empty.</p>
    </article>
  );
}
