import { describe, expect, it } from "vitest";
import {
  checkoutOrderIdempotencyKey,
  checkoutSessionDisposition,
  stripeCheckoutIdempotencyKeyForOrder,
  type CheckoutFingerprintInput,
} from "@/lib/checkout/idempotency";

const baseSnapshot: CheckoutFingerprintInput = {
  environment: "sandbox",
  cartId: "00000000-0000-4000-8000-000000000001",
  checkoutGeneration: "00000000-0000-4000-8000-000000000002",
  owner: {
    kind: "guest",
    id: "guest-cart-owner",
  },
  customerEmail: null,
  currency: "USD",
  lines: [
    {
      productId: "00000000-0000-4000-8000-000000000011",
      variantKey: "standard",
      quantity: 2,
      unitPriceCents: 3800,
    },
    {
      productId: "00000000-0000-4000-8000-000000000012",
      variantKey: "standard",
      quantity: 1,
      unitPriceCents: 4200,
    },
  ],
  reward: {
    tierId: null,
    points: 0,
  },
  referralCode: null,
  discountCents: 0,
  shippingCents: 0,
  freeShipping: true,
};

describe("checkout idempotency", () => {
  it("produces one fingerprint for the same canonical snapshot regardless of line order", () => {
    const reversed = {
      ...baseSnapshot,
      lines: [...baseSnapshot.lines].reverse(),
    };

    expect(checkoutOrderIdempotencyKey(reversed)).toBe(
      checkoutOrderIdempotencyKey(baseSnapshot),
    );
  });

  it.each([
    ["quantity", { lines: [{ ...baseSnapshot.lines[0], quantity: 3 }, baseSnapshot.lines[1]] }],
    ["canonical price", { lines: [{ ...baseSnapshot.lines[0], unitPriceCents: 3900 }, baseSnapshot.lines[1]] }],
    ["shipping", { shippingCents: 800, freeShipping: false }],
    ["checkout generation", { checkoutGeneration: "00000000-0000-4000-8000-000000000099" }],
    ["reward", { reward: { tierId: "tier-1", points: 250 } }],
    ["referral", { referralCode: "FRIEND20", discountCents: 500 }],
    ["customer email", { customerEmail: "new-address@example.test" }],
  ])("changes when the canonical %s input changes", (_label, change) => {
    expect(checkoutOrderIdempotencyKey({ ...baseSnapshot, ...change })).not.toBe(
      checkoutOrderIdempotencyKey(baseSnapshot),
    );
  });

  it("normalizes customer email before hashing", () => {
    expect(
      checkoutOrderIdempotencyKey({
        ...baseSnapshot,
        customerEmail: "  CUSTOMER@Example.Test  ",
      }),
    ).toBe(
      checkoutOrderIdempotencyKey({
        ...baseSnapshot,
        customerEmail: "customer@example.test",
      }),
    );
  });

  it("uses stable Stripe keys for initial creation and a specific replacement", () => {
    expect(stripeCheckoutIdempotencyKeyForOrder("order-1", null, null)).toBe(
      stripeCheckoutIdempotencyKeyForOrder("order-1", null, null),
    );
    expect(stripeCheckoutIdempotencyKeyForOrder("order-1", "cs_old", null)).toBe(
      stripeCheckoutIdempotencyKeyForOrder("order-1", "cs_old", null),
    );
    expect(stripeCheckoutIdempotencyKeyForOrder("order-1", "cs_old", null)).not.toBe(
      stripeCheckoutIdempotencyKeyForOrder("order-1", null, null),
    );
  });

  it("replays a recorded replacement key after an ambiguous creation result", () => {
    const replacementKey = stripeCheckoutIdempotencyKeyForOrder(
      "order-1",
      "cs_old",
      null,
    );

    expect(
      stripeCheckoutIdempotencyKeyForOrder("order-1", null, replacementKey),
    ).toBe(replacementKey);
    expect(
      stripeCheckoutIdempotencyKeyForOrder(
        "order-1",
        null,
        "stripe-session:another-order:initial",
      ),
    ).toBe(stripeCheckoutIdempotencyKeyForOrder("order-1", null, null));
  });

  it("reuses only an open, unexpired session with a usable URL", () => {
    const now = 1_800_000_000;

    expect(
      checkoutSessionDisposition(
        {
          orderStatus: "pending_payment",
          status: "open",
          paymentStatus: "unpaid",
          expiresAt: now + 600,
          url: "https://checkout.stripe.test/session",
        },
        now,
      ),
    ).toBe("reuse");

    expect(
      checkoutSessionDisposition(
        {
          orderStatus: "pending_payment",
          status: "expired",
          paymentStatus: "unpaid",
          expiresAt: now - 1,
          url: null,
        },
        now,
      ),
    ).toBe("replace");
  });

  it("never treats a paid session as reusable checkout", () => {
    expect(
      checkoutSessionDisposition(
        {
          orderStatus: "pending_payment",
          status: "complete",
          paymentStatus: "paid",
          expiresAt: 1_900_000_000,
          url: null,
        },
        1_800_000_000,
      ),
    ).toBe("paid");
  });

  it("replaces a completed unpaid session after an asynchronous failure", () => {
    expect(
      checkoutSessionDisposition(
        {
          orderStatus: "payment_failed",
          status: "complete",
          paymentStatus: "unpaid",
          expiresAt: 1_900_000_000,
          url: null,
        },
        1_800_000_000,
      ),
    ).toBe("replace");
  });
});
