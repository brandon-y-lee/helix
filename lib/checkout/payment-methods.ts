// This policy is shared by server-created Sessions and storefront messaging.
// Stripe treats eligible card wallets as card payments.
export const CHECKOUT_PAYMENT_METHOD_TYPES = ["card"] as const;
export const CHECKOUT_PAYMENT_METHOD_POLICY = CHECKOUT_PAYMENT_METHOD_TYPES.join(",");

export function supportsCheckoutPaymentMethod(method: string): boolean {
  return CHECKOUT_PAYMENT_METHOD_TYPES.some((allowed) => allowed === method);
}
