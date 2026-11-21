import type { CheckoutStorefront } from "@/lib/checkout/storefront";
import { formatPrice } from "@/lib/products";

export function CheckoutOfferTerms({ offer }: { offer: NonNullable<CheckoutStorefront["offer"]> }) {
  const { shippingCents, freeShippingThresholdCents, dispatchTerms, returnTerms } = offer;
  const shipsFree = shippingCents === 0 || freeShippingThresholdCents === 0;
  return (
    <div className="cart-shipping">
      {shippingCents !== undefined && (
        <p>
          {shipsFree ? "Free US shipping." : `US shipping is ${formatPrice(shippingCents)}.`}
          {!shipsFree && freeShippingThresholdCents != null &&
            ` Shipping is free on merchandise subtotals of ${formatPrice(freeShippingThresholdCents)} or more.`}
        </p>
      )}
      {dispatchTerms && <p><strong>Dispatch</strong> {dispatchTerms}</p>}
      {returnTerms && <p><strong>Returns</strong> {returnTerms}</p>}
      <p>Review shipping and any tax before payment.</p>
    </div>
  );
}
