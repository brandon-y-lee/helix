import "server-only";
import Stripe from "stripe";
import { CheckoutConfigError, STRIPE_API_VERSION } from "@/lib/checkout/config";
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

export function readLiveStripeReceiptAccountId(env: Environment = process.env): string {
  const accountId = env.HELIX_STRIPE_LIVE_ACCOUNT_ID?.trim() ?? "";
  try {
    if (deploymentSupabaseTarget(env) !== "production" ||
        (env.NEXT_PUBLIC_HELIX_SUPABASE_TARGET !== undefined && env.NEXT_PUBLIC_HELIX_SUPABASE_TARGET !== "production")) {
      throw new Error();
    }
    verifyHostedSiteOrigins(env, "production");
    assertSupabaseTargetUrl(env.NEXT_PUBLIC_SUPABASE_URL ?? "", "production");
    if (!/^acct_[A-Za-z0-9]{1,120}$/.test(accountId)) throw new Error();
    return accountId;
  } catch {
    throw new CheckoutConfigError("checkout_misconfigured", "Live payment provider configuration could not be verified.");
  }
}

export type LiveStripeBinding = {
  stripe: Stripe;
  environment: "live";
  accountId: string;
  webhookSecret: string;
};

export function readLiveStripeBinding(env: Environment = process.env): LiveStripeBinding {
  const accountId = readLiveStripeReceiptAccountId(env);
  const secretKey = env.HELIX_STRIPE_LIVE_SECRET_KEY?.trim() ?? "";
  const webhookSecret = env.HELIX_STRIPE_LIVE_WEBHOOK_SECRET?.trim() ?? "";
  try {
    const invalidSigner = webhookSecret !== "" &&
      (!/^whsec_\S+$/.test(webhookSecret) || webhookSecret === env.STRIPE_WEBHOOK_SECRET?.trim());
    if (env.CHECKOUT_MODE?.trim() !== "live" || !/^(?:rk|sk)_live_\S+$/.test(secretKey) || invalidSigner) {
      throw new Error();
    }
    const stripe = new Stripe(secretKey, { apiVersion: STRIPE_API_VERSION, timeout: 4_000, maxNetworkRetries: 0 });
    return { environment: "live", accountId, stripe, webhookSecret };
  } catch {
    throw new CheckoutConfigError("checkout_misconfigured", "Live payment provider configuration could not be verified.");
  }
}

export async function verifyLiveStripeAccount({ stripe, accountId }: LiveStripeBinding) {
  try {
    // With no account or connected-account override, Stripe returns the key's own merchant.
    const account = await stripe.accounts.retrieve(null);
    if (account.object !== "account" || account.id !== accountId ||
        typeof account.charges_enabled !== "boolean" || typeof account.payouts_enabled !== "boolean") {
      throw new Error();
    }
    return { accountId: account.id, chargesEnabled: account.charges_enabled, payoutsEnabled: account.payouts_enabled };
  } catch {
    throw new CheckoutConfigError("checkout_misconfigured", "Live payment merchant could not be verified.");
  }
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
