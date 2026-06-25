import "server-only";

import Stripe from "stripe";
import {
  STRIPE_API_VERSION,
  readCheckoutConfig,
  type CheckoutConfig,
} from "@/lib/checkout/config";

let cachedStripe: Stripe | null = null;
let cachedSecretKey: string | null = null;

export function getStripeClient(config: CheckoutConfig = readCheckoutConfig()): Stripe {
  if (cachedStripe && cachedSecretKey === config.secretKey) return cachedStripe;

  cachedStripe = new Stripe(config.secretKey, {
    apiVersion: STRIPE_API_VERSION,
    typescript: true,
  });
  cachedSecretKey = config.secretKey;
  return cachedStripe;
}

export function constructStripeWebhookEvent(input: {
  rawBody: string | Buffer;
  signature: string | null;
  config?: CheckoutConfig;
}): Stripe.Event {
  const config = input.config ?? readCheckoutConfig();
  if (!input.signature) {
    throw new Error("Missing Stripe webhook signature.");
  }

  return getStripeClient(config).webhooks.constructEvent(
    input.rawBody,
    input.signature,
    config.webhookSecret,
  );
}
