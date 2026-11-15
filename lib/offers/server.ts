import "server-only";
import type Stripe from "stripe";
import { getActiveCartIdentity } from "@/lib/cart/server";
import { getCurrentUser } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getStripeClient } from "@/lib/stripe/server";
import { verifyStripeAccount } from "@/lib/stripe/payment-verification";
import { readPaymentProviderConfig } from "@/lib/checkout/config";
import { OFFER_ID, isOfferSummary, offerCouponId, offerDiscountCents, validateOfferCoupon, type OfferKind, type OfferSummary } from "./rules";

export type StoredOffer = OfferSummary & { couponId: string; recovering: boolean };
export class OfferUnavailableError extends Error {
  constructor() { super("This offer is unavailable. Refresh your cart or choose another discount."); }
}
async function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await createSupabaseAdminClient().rpc(name, args).abortSignal(AbortSignal.timeout(3_000));
  if (error) throw new OfferUnavailableError();
  return data;
}
export async function readCurrentOffers(): Promise<StoredOffer[]> {
  const user = await getCurrentUser();
  if (!user?.email_confirmed_at || !user.email) return [];
  const cart = await getActiveCartIdentity();
  const value = await rpc("read_lifecycle_offers", { p_user_id: user.id, p_cart_id: cart.userId === user.id ? cart.cartId : null, p_new_admission: process.env.HELIX_OFFERS_ENABLED === "true" });
  if (!Array.isArray(value) || value.some((entry) => !isOfferSummary(entry) || !("couponId" in entry) || typeof entry.couponId !== "string" || !("recovering" in entry) || typeof entry.recovering !== "boolean")) throw new OfferUnavailableError();
  return value as StoredOffer[];
}
export async function verifyConfiguredOfferCoupon(kind: OfferKind, stripe?: Stripe, recovering = false): Promise<string> {
  const id = offerCouponId(kind, recovering ? { ...process.env, HELIX_OFFERS_ENABLED: "true" } : process.env);
  if (!id) throw new OfferUnavailableError();
  const client = stripe ?? getStripeClient(readPaymentProviderConfig());
  await verifyStripeAccount(client);
  const coupon = await client.coupons.retrieve(id, {}, { timeout: 3_000, maxNetworkRetries: 0 });
  if (!validateOfferCoupon(coupon, id, kind === "welcome" ? 15 : 10)) throw new OfferUnavailableError();
  return id;
}
/** Internal campaign call only after its current consent/source admission; no public grant endpoint. */
export async function grantLifecycleOffer(input: { kind: Exclude<OfferKind, "review_winback">; email: string; sourceKey: string }): Promise<string | null> {
  const couponId = await verifyConfiguredOfferCoupon(input.kind);
  const value = await rpc("grant_lifecycle_offer", { p_kind: input.kind, p_email: input.email, p_source_key: input.sourceKey, p_coupon_id: couponId });
  if (value === null) return null;
  if (typeof value !== "string" || !OFFER_ID.test(value)) throw new OfferUnavailableError();
  return value;
}
export async function resolveCheckoutOffer(id: unknown, subtotal: number, userId: string | null, stripe: Stripe) {
  if (id === undefined || id === null) return null;
  if (typeof id !== "string" || !OFFER_ID.test(id) || !userId) throw new OfferUnavailableError();
  const user = await getCurrentUser();
  if (user?.id !== userId || !user.email_confirmed_at) throw new OfferUnavailableError();
  const offer = (await readCurrentOffers()).find((entry) => entry.id === id);
  if (!offer || await verifyConfiguredOfferCoupon(offer.kind, stripe, offer.recovering) !== offer.couponId) throw new OfferUnavailableError();
  return { ...offer, discountCents: offerDiscountCents(subtotal, offer.percentOff) };
}

/** Final pre-handoff check. Null means do not advertise an expired, held or used offer. */
export async function readLifecycleOfferForDelivery(id: string, email: string): Promise<OfferSummary | null> {
  if (!OFFER_ID.test(id) || process.env.HELIX_OFFERS_ENABLED !== "true") return null;
  const value = await rpc("read_lifecycle_offer_for_delivery", { p_offer_id: id, p_email: email });
  if (value === null) return null;
  if (!isOfferSummary(value) || !("couponId" in value) || typeof value.couponId !== "string") throw new OfferUnavailableError();
  if (await verifyConfiguredOfferCoupon(value.kind) !== value.couponId) return null;
  return { id: value.id, kind: value.kind, percentOff: value.percentOff, expiresAt: value.expiresAt };
}

/** Private order-bound grant. Database resolves the recipient; no arbitrary email grant. */
export async function grantReviewWinbackOffer(input: { subscriberId: string; orderId: string }): Promise<string | null> {
  if (!OFFER_ID.test(input.subscriberId) || !OFFER_ID.test(input.orderId)) throw new OfferUnavailableError();
  const couponId = await verifyConfiguredOfferCoupon("review_winback");
  const value = await rpc("grant_review_winback_offer", { p_subscriber_id: input.subscriberId, p_order_id: input.orderId, p_coupon_id: couponId });
  if (value === null) return null;
  if (typeof value !== "string" || !OFFER_ID.test(value)) throw new OfferUnavailableError();
  return value;
}
