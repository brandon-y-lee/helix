import { describe, expect, it } from "vitest";
import { offerDiscountCents, validateOfferCoupon, offerCouponId } from "@/lib/offers/rules";
import { readCheckoutRequest } from "@/lib/checkout/request";
import { checkoutOrderIdempotencyKey } from "@/lib/checkout/idempotency";

const coupon = { id: "coupon_welcome", valid: true, livemode: false, percent_off: 15, amount_off: null,
  currency: null, duration: "once", redeem_by: null, max_redemptions: null };
describe("recipient-bound lifecycle checkout offers", () => {
  it("calculates rounded integer merchandise discounts and rejects invalid amounts", () => {
    expect(offerDiscountCents(4999, 15)).toBe(750);
    expect(offerDiscountCents(4999, 10)).toBe(500);
    expect(() => offerDiscountCents(1.5, 15)).toThrow();
    expect(() => offerDiscountCents(100, 99)).toThrow();
  });
  it("requires the exact configured unrestricted sandbox percentage coupon", () => {
    expect(validateOfferCoupon(coupon, "coupon_welcome", 15)).toBe(true);
    for (const change of [{ livemode: true }, { valid: false }, { percent_off: 10 }, { amount_off: 10 },
      { applies_to: { products: ["prod_one"] } }, { max_redemptions: 1 }, { redeem_by: 1 }, { duration: "forever" }]) {
      expect(validateOfferCoupon({ ...coupon, ...change }, "coupon_welcome", 15)).toBe(false);
    }
    expect(validateOfferCoupon(coupon, "another", 15)).toBe(false);
    expect(offerCouponId("welcome", {})).toBe(null);
    expect(offerCouponId("welcome", { HELIX_OFFERS_ENABLED: "true", STRIPE_WELCOME_15_COUPON_ID: "coupon_welcome" })).toBe("coupon_welcome");
  });
  it("accepts an offer identity only without a selected reward and never accepts an amount", async () => {
    const request = (body: unknown) => new Request("https://helix.test/api/checkout/sessions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const offerId = "11111111-1111-4111-8111-111111111111";
    expect(await readCheckoutRequest(request({ offerId }))).toEqual({ rewardTierId: null, offerId });
    await expect(readCheckoutRequest(request({ offerId, rewardTierId: "points_200" }))).rejects.toThrow();
    await expect(readCheckoutRequest(request({ offerId, percentOff: 15 }))).rejects.toThrow();
    await expect(readCheckoutRequest(request({ offerId: "arbitrary-code" }))).rejects.toThrow();
  });
  it("changes the immutable checkout identity when a different entitlement is applied", () => {
    const input = { environment: "sandbox" as const, cartId: "cart", checkoutGeneration: "generation", owner: { kind: "user" as const, id: "customer" },
      customerEmail: "buyer@example.test", currency: "USD" as const, lines: [{ productId: "p", variantKey: "v", quantity: 1, unitPriceCents: 1000 }],
      reward: { tierId: null, points: 0 }, referralCode: null, discountCents: 100, shippingCents: 0, freeShipping: true };
    expect(checkoutOrderIdempotencyKey({ ...input, offerId: "one" })).not.toBe(checkoutOrderIdempotencyKey({ ...input, offerId: "two" }));
  });
});
