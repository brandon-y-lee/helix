import { afterEach, describe, expect, it, vi } from "vitest";
const boundary = vi.hoisted(() => ({ rpc: vi.fn(), user: vi.fn(), cart: vi.fn(), coupon: vi.fn(), account: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: boundary.user }));
vi.mock("@/lib/cart/server", () => ({ getActiveCartIdentity: boundary.cart }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({ rpc: boundary.rpc }) }));
vi.mock("@/lib/stripe/payment-verification", () => ({ verifyStripeAccount: boundary.account }));
import { resolveCheckoutOffer } from "@/lib/offers/server";
import type Stripe from "stripe";
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });
describe("accepted offer recovery through the application boundary", () => {
  it("recovers only the database-authorized original held checkout while new admission is paused", async () => {
    const id = "11111111-1111-4111-8111-111111111111";
    vi.stubEnv("HELIX_OFFERS_ENABLED", "false");
    vi.stubEnv("STRIPE_WELCOME_15_COUPON_ID", "welcome_test");
    boundary.user.mockResolvedValue({ id: "owner", email: "owner@example.invalid", email_confirmed_at: "2026-01-01" });
    boundary.cart.mockResolvedValue({ userId: "owner", cartId: "original-cart" });
    const offer = { id, kind: "welcome", percentOff: 15, expiresAt: "2025-01-01", couponId: "welcome_test", recovering: true };
    boundary.rpc.mockReturnValue({ abortSignal: () => Promise.resolve({ data: [offer], error: null }) });
    boundary.coupon.mockResolvedValue({ id: "welcome_test", valid: true, livemode: false, percent_off: 15, amount_off: null, currency: null, duration: "once", redeem_by: null, max_redemptions: null });
    const stripe = { coupons: { retrieve: boundary.coupon } } as unknown as Stripe;
    expect(await resolveCheckoutOffer(id, 2500, "owner", stripe)).toMatchObject({ id, discountCents: 375 });
    expect(boundary.rpc).toHaveBeenCalledWith("read_lifecycle_offers", { p_user_id: "owner", p_cart_id: "original-cart", p_new_admission: false });
    // A fresh grant is not allowed to bypass the application gate even with a stale RPC response.
    boundary.rpc.mockReturnValue({ abortSignal: () => Promise.resolve({ data: [{ ...offer, recovering: false }], error: null }) });
    await expect(resolveCheckoutOffer(id, 2500, "owner", stripe)).rejects.toThrow("unavailable");
    boundary.rpc.mockReturnValue({ abortSignal: () => Promise.resolve({ data: [], error: null }) });
    await expect(resolveCheckoutOffer(id, 2500, "owner", stripe)).rejects.toThrow("unavailable");
  });
});
