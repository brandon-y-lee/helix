import { PENDING_CHECKOUT_COOKIE } from "@/lib/customer-state-identifiers";

export const CHECKOUT_CANCEL_COOKIE = PENDING_CHECKOUT_COOKIE;
export const CHECKOUT_CANCEL_COOKIE_PATH = "/cart";
export const CHECKOUT_CANCEL_COOKIE_MAX_AGE_SECONDS = 30 * 60;
const CHECKOUT_CANCEL_QUERY_KEY = "checkout";
const CHECKOUT_CANCEL_QUERY_VALUE = "cancelled";
export const CHECKOUT_CANCELLED_CART_PATH =
  `/cart?${CHECKOUT_CANCEL_QUERY_KEY}=${CHECKOUT_CANCEL_QUERY_VALUE}`;

type CheckoutCancelSearchParams = {
  checkout?: string | string[];
};

export function buildCheckoutCancelUrl(origin: string): string {
  return new URL(CHECKOUT_CANCELLED_CART_PATH, origin).toString();
}

export function isCheckoutCancelledSearchParams(
  params: CheckoutCancelSearchParams,
): boolean {
  const value = Array.isArray(params.checkout) ? params.checkout[0] : params.checkout;
  return value === CHECKOUT_CANCEL_QUERY_VALUE;
}
