import "server-only";
import Stripe from "stripe";
import { isBusinessSandboxDeployment } from "@/lib/checkout/business-origin";
import { isBusinessStripeEnvironment, type BusinessStripeEnvironment } from "@/lib/checkout/payment-verification";
import { CheckoutConfigError, STRIPE_API_VERSION, STRIPE_SANDBOX_ACCOUNT_ID } from "@/lib/checkout/config";
import {
  assertSupabaseTargetUrl,
  deploymentSupabaseTarget,
  verifyHostedSiteOrigins,
} from "@/lib/supabase/project-safety";

type Environment = Record<string, string | undefined>;

export function hasLivePaymentConfiguration(env: Environment): boolean {
  return env.CHECKOUT_MODE?.trim() === "live" || Boolean(
    env.HELIX_STRIPE_LIVE_ACCOUNT_ID?.trim() ||
    env.HELIX_STRIPE_LIVE_SECRET_KEY?.trim() ||
    env.HELIX_STRIPE_LIVE_WEBHOOK_SECRET?.trim(),
  );
}

export function hasBusinessSandboxPaymentConfiguration(env: Environment): boolean {
  return env.CHECKOUT_MODE?.trim() === "business_sandbox" || Boolean(
    env.HELIX_STRIPE_DEV_ACCOUNT_ID?.trim() ||
    env.HELIX_STRIPE_DEV_SECRET_KEY?.trim() ||
    env.HELIX_STRIPE_DEV_WEBHOOK_SECRET?.trim(),
  );
}

export type { BusinessStripeEnvironment };
export type BusinessStripeScope<E extends BusinessStripeEnvironment = BusinessStripeEnvironment> = {
  environment: E;
  accountId: string;
};
export type BusinessStripeBinding<E extends BusinessStripeEnvironment = BusinessStripeEnvironment> = BusinessStripeScope<E> & {
  stripe: Stripe;
  webhookSecret: string;
};
export type LiveStripeBinding = BusinessStripeBinding<"live">;

function invalidConfig(environment: BusinessStripeEnvironment): never {
  throw new CheckoutConfigError("checkout_misconfigured", environment === "live"
    ? "Live payment provider configuration could not be verified." : "Development payment provider configuration could not be verified.");
}

/** Receipt access depends on the issuing merchant and target; admission, signers and active keys can rotate. */
export function readBusinessStripeReceiptScope<E extends BusinessStripeEnvironment>(
  environment: E, env: Environment = process.env,
): BusinessStripeScope<E> {
  const accountId = (environment === "live" ? env.HELIX_STRIPE_LIVE_ACCOUNT_ID : env.HELIX_STRIPE_DEV_ACCOUNT_ID)?.trim() ?? "";
  if (!isBusinessStripeEnvironment(environment) || accountId === STRIPE_SANDBOX_ACCOUNT_ID ||
      !/^acct_[A-Za-z0-9]{1,120}$/.test(accountId)) invalidConfig(environment);
  if (environment === "business_sandbox") {
    if (!isBusinessSandboxDeployment(env)) invalidConfig(environment);
  } else {
    try {
      if (deploymentSupabaseTarget(env) !== "production" ||
          (env.NEXT_PUBLIC_HELIX_SUPABASE_TARGET !== undefined && env.NEXT_PUBLIC_HELIX_SUPABASE_TARGET !== "production")) {
        throw new Error();
      }
      verifyHostedSiteOrigins(env, "production");
      assertSupabaseTargetUrl(env.NEXT_PUBLIC_SUPABASE_URL ?? "", "production");
    } catch { invalidConfig(environment); }
  }
  return { environment, accountId };
}

/** Select the merchant retained on this deployment even when new payment admission is closed. */
export function configuredBusinessStripeReceiptScope(env: Environment = process.env): BusinessStripeScope | null {
  const development = Boolean(env.HELIX_STRIPE_DEV_ACCOUNT_ID?.trim());
  const production = Boolean(env.HELIX_STRIPE_LIVE_ACCOUNT_ID?.trim());
  if (development && production) invalidConfig("business_sandbox");
  if (development) return readBusinessStripeReceiptScope("business_sandbox", env);
  if (production) return readBusinessStripeReceiptScope("live", env);
  return null;
}

export function readBusinessStripeBinding<E extends BusinessStripeEnvironment>(
  environment: E, env: Environment = process.env,
): BusinessStripeBinding<E> {
  const scope = readBusinessStripeReceiptScope(environment, env);
  const live = environment === "live";
  const secretKey = (live ? env.HELIX_STRIPE_LIVE_SECRET_KEY : env.HELIX_STRIPE_DEV_SECRET_KEY)?.trim() ?? "";
  const webhookSecret = (live ? env.HELIX_STRIPE_LIVE_WEBHOOK_SECRET : env.HELIX_STRIPE_DEV_WEBHOOK_SECRET)?.trim() ?? "";
  const otherSigner = (live ? env.HELIX_STRIPE_DEV_WEBHOOK_SECRET : env.HELIX_STRIPE_LIVE_WEBHOOK_SECRET)?.trim();
  const keyPattern = live ? /^(?:rk|sk)_live_[A-Za-z0-9]+$/ : /^(?:rk|sk)_test_[A-Za-z0-9]+$/;
  const invalidSigner = webhookSecret !== "" && (!/^whsec_[A-Za-z0-9]+$/.test(webhookSecret) ||
    webhookSecret === env.STRIPE_WEBHOOK_SECRET?.trim() || webhookSecret === otherSigner);
  if (env.CHECKOUT_MODE?.trim() !== environment || !keyPattern.test(secretKey) ||
      secretKey === env.STRIPE_SECRET_KEY?.trim() || invalidSigner) invalidConfig(environment);
  try {
    const stripe = new Stripe(secretKey, { apiVersion: STRIPE_API_VERSION, timeout: 4_000, maxNetworkRetries: 0 });
    return { ...scope, stripe, webhookSecret };
  } catch { return invalidConfig(environment); }
}

export async function verifyBusinessStripeAccount({ stripe, accountId, environment }: BusinessStripeBinding) {
  try {
    if (!isBusinessStripeEnvironment(environment) || accountId === STRIPE_SANDBOX_ACCOUNT_ID) throw new Error();
    // With no account or connected-account override, Stripe returns the key's own merchant.
    const account = await stripe.accounts.retrieve(null);
    if (account.object !== "account" || account.id !== accountId ||
        typeof account.charges_enabled !== "boolean" || typeof account.payouts_enabled !== "boolean") {
      throw new Error();
    }
    return { accountId: account.id, chargesEnabled: account.charges_enabled, payoutsEnabled: account.payouts_enabled };
  } catch {
    throw new CheckoutConfigError("checkout_misconfigured", environment === "live" ?
      "Live payment merchant could not be verified." : "Development payment merchant could not be verified.");
  }
}

export function readLiveStripeReceiptAccountId(env: Environment = process.env): string {
  return readBusinessStripeReceiptScope("live", env).accountId;
}

export function readLiveStripeBinding(env: Environment = process.env): LiveStripeBinding {
  return readBusinessStripeBinding("live", env);
}

export function verifyLiveStripeAccount(binding: LiveStripeBinding) {
  return verifyBusinessStripeAccount(binding);
}

export async function observeClosedLivePaymentProvider(env: Environment = process.env) {
  const binding = readLiveStripeBinding(env);
  const { chargesEnabled, payoutsEnabled } = await verifyLiveStripeAccount(binding);
  return {
    providerMode: "live",
    merchantVerified: true,
    chargesEnabled,
    payoutsEnabled,
    settlementConfigured: binding.webhookSecret !== "",
    admissionOpen: false,
  } as const;
}
