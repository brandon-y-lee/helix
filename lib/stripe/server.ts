import "server-only";

import Stripe from "stripe";
import { paymentDeadlineFetch } from "@/lib/payments/deadline";
import {
  STRIPE_API_VERSION,
  readPaymentProviderConfig,
  type PaymentProviderConfig,
} from "@/lib/checkout/config";

let cachedStripe: Stripe | null = null;
let cachedSecretKey: string | null = null;

export function getStripeClient(
  config: PaymentProviderConfig = readPaymentProviderConfig(),
): Stripe {
  if (cachedStripe && cachedSecretKey === config.secretKey) return cachedStripe;

  cachedStripe = new Stripe(config.secretKey, {
    apiVersion: STRIPE_API_VERSION,
    typescript: true,
    timeout: 4_000,
    maxNetworkRetries: 0,
    httpClient: Stripe.createFetchHttpClient(paymentDeadlineFetch),
  });
  cachedSecretKey = config.secretKey;
  return cachedStripe;
}

export function constructStripeWebhookEvent(input: {
  rawBody: string | Buffer;
  signature: string | null;
  config?: PaymentProviderConfig;
}): Stripe.Event {
  const config = input.config ?? readPaymentProviderConfig();
  if (!input.signature) {
    throw new Error("Missing Stripe webhook signature.");
  }

  return getStripeClient(config).webhooks.constructEvent(
    input.rawBody,
    input.signature,
    config.webhookSecret,
  );
}
