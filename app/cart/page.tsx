import type { Metadata } from "next";
import { CartView } from "@/components/CartView";

export const metadata: Metadata = {
  title: "Cart | Mei Pelle",
};

export default function CartPage() {
  return (
    <div className="container">
      <div className="page-head">
        <h1>Cart</h1>
      </div>
      <CartView />
    </div>
  );
}
