import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CHECKOUT_CANCELLED_CART_PATH } from "@/lib/orders/checkout-cancel";

export const metadata: Metadata = {
  title: "Checkout canceled | Mei Pelle",
};

export const dynamic = "force-dynamic";

export default function CheckoutCancelPage() {
  redirect(CHECKOUT_CANCELLED_CART_PATH);
}
