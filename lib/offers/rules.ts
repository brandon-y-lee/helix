export type OfferKind = "welcome" | "cart" | "review_winback";
export type OfferSummary = { id: string; kind: OfferKind; percentOff: 10 | 15; expiresAt: string };
export const OFFER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function offerDiscountCents(subtotal: number, percent: number): number {
  if (!Number.isSafeInteger(subtotal) || subtotal < 0 || subtotal > 2147483647 || ![10, 15].includes(percent)) throw new Error("Invalid offer amount.");
  return Math.floor((subtotal * percent + 50) / 100);
}
export function offerCouponId(kind: OfferKind, env: Record<string, string | undefined>): string | null {
  if (env.HELIX_OFFERS_ENABLED !== "true") return null;
  const id = env[kind === "welcome" ? "STRIPE_WELCOME_15_COUPON_ID" : kind === "cart" ? "STRIPE_CART_10_COUPON_ID" : "STRIPE_REVIEW_WINBACK_10_COUPON_ID"];
  return id && /^[A-Za-z0-9_-]{1,255}$/.test(id) ? id : null;
}
export function validateOfferCoupon(value: unknown, id: string, percent: number): boolean {
  if (!value || typeof value !== "object") return false;
  const coupon = value as Record<string, unknown>;
  return coupon.id === id && coupon.valid === true && coupon.livemode === false && coupon.percent_off === percent
    && coupon.amount_off === null && coupon.currency === null && coupon.duration === "once"
    && coupon.redeem_by === null && coupon.max_redemptions === null && !coupon.applies_to && coupon.deleted !== true;
}
export function isOfferSummary(value: unknown): value is OfferSummary {
  if (!value || typeof value !== "object") return false;
  const offer = value as OfferSummary;
  return OFFER_ID.test(offer.id) && ["welcome", "cart", "review_winback"].includes(offer.kind)
    && offer.percentOff === (offer.kind === "welcome" ? 15 : 10) && typeof offer.expiresAt === "string" && Number.isFinite(Date.parse(offer.expiresAt));
}
