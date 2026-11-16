import Stripe from "stripe";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CheckoutConfig } from "@/lib/checkout/config";
import { constructStripeWebhookEvent } from "@/lib/stripe/server";

const WEBHOOK_SECRET = "whsec_helix_raw_body_test";
const config: CheckoutConfig = {
  accountId: "acct_1Tm9WRFEzyaKzdmq",
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

afterEach(() => vi.unstubAllEnvs());

describe("Stripe webhook signature boundary", () => {
  it.each([
    "checkout.session.completed",
    "checkout.session.expired",
    "charge.refunded",
  ])("still verifies signed %s events after checkout admission is disabled", (type) => {
    vi.stubEnv("CHECKOUT_ENABLED", "false");
    vi.stubEnv("CHECKOUT_MODE", "sandbox");
    vi.stubEnv("STRIPE_ACCOUNT_ID", "acct_1Tm9WRFEzyaKzdmq");
    vi.stubEnv("STRIPE_SECRET_KEY", config.secretKey);
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", WEBHOOK_SECRET);
    const rawBody = JSON.stringify({
      data: { object: { id: "cs_test_accepted" } },
      id: "evt_test_accepted",
      livemode: false,
      type,
    });
    const signature = Stripe.webhooks.generateTestHeaderString({
      payload: rawBody,
      secret: WEBHOOK_SECRET,
    });

    expect(constructStripeWebhookEvent({ rawBody, signature })).toMatchObject({
      id: "evt_test_accepted",
      type,
    });
  });

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
