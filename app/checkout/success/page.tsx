import type { Metadata } from "next";
import { OrderConfirmationView } from "@/components/cart/OrderConfirmationView";
import { OrderStatusRefresh } from "@/components/cart/OrderStatusRefresh";
import { getOrderConfirmationBySession } from "@/lib/orders/server";

export const metadata: Metadata = {
  title: "Order status | helix",
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

  return (
    <OrderConfirmationView
      confirmation={confirmation}
      statusRefresh={confirmation?.state === "pending" ? (
          <OrderStatusRefresh retryAfterSeconds={confirmation.retryAfterSeconds} />
      ) : null}
    />
  );
}
