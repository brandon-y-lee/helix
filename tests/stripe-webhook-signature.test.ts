import Stripe from "stripe";
import { describe, expect, it } from "vitest";
import type { CheckoutConfig } from "@/lib/checkout/config";
import { constructStripeWebhookEvent } from "@/lib/stripe/server";

const WEBHOOK_SECRET = "whsec_helix_raw_body_test";
const config: CheckoutConfig = {
  automaticTaxEnabled: false,
  enabled: true,
  environment: "sandbox",
  rewardCouponIds: {
    points200: null,
    points400: null,
    points600: null,
    referral15: null,
  },
  secretKey: "sk_test_helix_raw_body_test",
  standardShippingRateId: null,
  webhookSecret: WEBHOOK_SECRET,
};

describe("Stripe webhook signature boundary", () => {
  it("verifies the exact raw request body", () => {
    const rawBody = JSON.stringify({
      data: { object: { id: "cs_test_helix" } },
      id: "evt_test_helix",
      livemode: false,
      type: "checkout.session.completed",
    });
    const signature = Stripe.webhooks.generateTestHeaderString({
      payload: rawBody,
      secret: WEBHOOK_SECRET,
      timestamp: Math.floor(Date.now() / 1_000),
    });

    expect(
      constructStripeWebhookEvent({
        config,
        rawBody,
        signature,
      }),
    ).toMatchObject({ id: "evt_test_helix", livemode: false });
    expect(() =>
      constructStripeWebhookEvent({
        config,
        rawBody: `${rawBody}\n`,
        signature,
      }),
    ).toThrow();
  });
});
