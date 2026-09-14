import type { Metadata } from "next";
import { OrderConfirmationView } from "@/components/cart/OrderConfirmationView";
import { getOrderConfirmationBySession } from "@/lib/orders/server";

export const metadata: Metadata = {
  title: "Payment verified | helix",
};

export const dynamic = "force-dynamic";

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const params = await searchParams;
  const confirmation = params.session_id
    ? await getOrderConfirmationBySession(params.session_id).catch(() => null)
    : null;

  return <OrderConfirmationView confirmation={confirmation} />;
}
