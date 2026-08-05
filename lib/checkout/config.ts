export const CHECKOUT_ENVIRONMENT = "sandbox";
export const STRIPE_API_VERSION = "2026-06-24.dahlia";
export const SANDBOX_CHECKOUT_NOTICE = "SANDBOX CHECKOUT - NO REAL CHARGE OR FULFILLMENT";

export type CheckoutConfig = {
  environment: typeof CHECKOUT_ENVIRONMENT;
  enabled: true;
  secretKey: string;
  webhookSecret: string;
  standardShippingRateId: string | null;
  automaticTaxEnabled: boolean;
  rewardCouponIds: {
    points200: string | null;
    points400: string | null;
    points600: string | null;
    referral15: string | null;
  };
};

export class CheckoutConfigError extends Error {
  code: "checkout_disabled" | "checkout_misconfigured" | "live_mode_blocked";

  constructor(
    code: "checkout_disabled" | "checkout_misconfigured" | "live_mode_blocked",
    message: string,
  ) {
    super(message);
    this.name = "CheckoutConfigError";
    this.code = code;
  }
}

function readEnv(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

function isTruthy(value: string | undefined): boolean {
  return value === "true" || value === "1" || value === "yes";
}

export function isLiveStripeSecretKey(value: unknown): boolean {
  return typeof value === "string" && /^sk_live_/i.test(value);
}

function isLiveStripePublishableKey(value: unknown): boolean {
  return typeof value === "string" && /^pk_live_/i.test(value);
}

export function isTestStripeSecretKey(value: unknown): boolean {
  return typeof value === "string" && /^sk_test_/i.test(value);
}

function isTestStripePublishableKey(value: unknown): boolean {
  return typeof value === "string" && /^pk_test_/i.test(value);
}

function assertNoLiveStripeConfig(env: NodeJS.ProcessEnv): void {
  const secretKey = readEnv(env, "STRIPE_SECRET_KEY");
  const publishableKey = readEnv(env, "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY");
  const mode = readEnv(env, "CHECKOUT_MODE");

  if (mode && mode !== CHECKOUT_ENVIRONMENT) {
    throw new CheckoutConfigError(
      "live_mode_blocked",
      "Checkout is configured for sandbox only.",
    );
  }

  if (isLiveStripeSecretKey(secretKey) || isLiveStripePublishableKey(publishableKey)) {
    throw new CheckoutConfigError(
      "live_mode_blocked",
      "Live Stripe keys are blocked in this checkout environment.",
    );
  }
}

export function readCheckoutConfig(env: NodeJS.ProcessEnv = process.env): CheckoutConfig {
  assertNoLiveStripeConfig(env);

  const enabled = isTruthy(readEnv(env, "CHECKOUT_ENABLED"));
  if (!enabled) {
    throw new CheckoutConfigError(
      "checkout_disabled",
      "Sandbox checkout is not enabled for this environment.",
    );
  }

  const secretKey = readEnv(env, "STRIPE_SECRET_KEY");
  if (!secretKey || !isTestStripeSecretKey(secretKey)) {
    throw new CheckoutConfigError(
      "checkout_misconfigured",
      "Stripe sandbox secret key is missing or invalid.",
    );
  }

  const publishableKey = readEnv(env, "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY");
  if (publishableKey && !isTestStripePublishableKey(publishableKey)) {
    throw new CheckoutConfigError(
      "checkout_misconfigured",
      "Stripe sandbox publishable key is invalid.",
    );
  }

  const webhookSecret = readEnv(env, "STRIPE_WEBHOOK_SECRET");
  if (!webhookSecret || !webhookSecret.startsWith("whsec_")) {
    throw new CheckoutConfigError(
      "checkout_misconfigured",
      "Stripe webhook signing secret is missing or invalid.",
    );
  }

  return {
    environment: CHECKOUT_ENVIRONMENT,
    enabled: true,
    secretKey,
    webhookSecret,
    standardShippingRateId: readEnv(env, "STRIPE_STANDARD_SHIPPING_RATE_ID") ?? null,
    automaticTaxEnabled: isTruthy(readEnv(env, "STRIPE_AUTOMATIC_TAX_ENABLED")),
    rewardCouponIds: {
      points200: readEnv(env, "STRIPE_REWARD_200_COUPON_ID") ?? null,
      points400: readEnv(env, "STRIPE_REWARD_400_COUPON_ID") ?? null,
      points600: readEnv(env, "STRIPE_REWARD_600_COUPON_ID") ?? null,
      referral15: readEnv(env, "STRIPE_REFERRAL_15_COUPON_ID") ?? null,
    },
  };
}

export function stripeMessagingPublishableKey(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  try {
    readCheckoutConfig(env);
  } catch {
    return null;
  }

  const publishableKey = readEnv(env, "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY");
  return publishableKey && isTestStripePublishableKey(publishableKey)
    ? publishableKey
    : null;
}

export function assertSandboxStripeObject(value: { livemode?: boolean | null }): void {
  if (value.livemode) {
    throw new CheckoutConfigError(
      "live_mode_blocked",
      "Live Stripe objects are blocked in sandbox checkout.",
    );
  }
}
