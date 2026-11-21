import "server-only";
import { cache } from "react";
import { readCheckoutConfig } from "./config";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { hasBusinessSandboxPaymentConfiguration, hasLivePaymentConfiguration, readBusinessStripeBinding, type BusinessStripeEnvironment } from "@/lib/stripe/live-provider";
import { businessCheckoutOrigin, isBusinessSandboxDeployment } from "./business-origin";
import { assertSupabaseTargetUrl, deploymentSupabaseTarget } from "@/lib/supabase/project-safety";

type Environment = Record<string, string | undefined>;
export type CheckoutStorefront = {
  mode: "closed" | "historical_sandbox" | BusinessStripeEnvironment;
  admissionOpen: boolean;
  canResume?: true;
  offer?: {
    productSlug: string; variantId: string; unitPriceCents: number;
    shippingCents?: number; freeShippingThresholdCents?: number | null;
    dispatchTerms?: string; returnTerms?: string;
  };
};

const cents = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const policyText = (value: unknown, limit: number): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.length <= limit;

export function selectedBusinessCheckout(env: Environment): BusinessStripeEnvironment | null {
  if (hasLivePaymentConfiguration(env)) return "live";
  if (hasBusinessSandboxPaymentConfiguration(env) || isBusinessSandboxDeployment(env)) return "business_sandbox";
  return null;
}

export function businessAdmissionEnabled(mode: BusinessStripeEnvironment, env: Environment): boolean {
  return env.CHECKOUT_MODE === mode &&
    (mode === "live" ? env.HELIX_STRIPE_LIVE_ADMISSION_ENABLED : env.HELIX_STRIPE_DEV_ADMISSION_ENABLED) === "true";
}

/** Storefront availability never contacts Stripe or grants authority to reserve stock. */
export const readCheckoutStorefront = cache(async (env: Environment = process.env): Promise<CheckoutStorefront> => {
  const mode = selectedBusinessCheckout(env);
  if (!mode) {
    // Only local development and compatibility fixtures use the historical issuer for new sessions.
    if (env.VERCEL || env.VERCEL_ENV) return { mode: "closed", admissionOpen: false };
    try {
      const config = readCheckoutConfig(env as NodeJS.ProcessEnv);
      return { mode: "historical_sandbox", admissionOpen: config.enabled };
    } catch {
      return { mode: "historical_sandbox", admissionOpen: false };
    }
  }
  const closed = { mode, admissionOpen: false } as const;
  if (!businessAdmissionEnabled(mode, env)) return closed;
  try {
    const binding = readBusinessStripeBinding(mode, env);
    if (!binding.webhookSecret) return closed;
    const { data, error } = await createSupabaseAdminClient().rpc("read_business_checkout_offer", {
      p_environment: mode, p_account_id: binding.accountId,
    });
    if (error || data?.admissionOpen !== true || data.currency !== "USD" || !cents(data.unitPriceCents) ||
        data.unitPriceCents < 1 || !cents(data.shippingCents) ||
        (data.freeShippingThresholdCents !== null && !cents(data.freeShippingThresholdCents)) ||
        !policyText(data.dispatchTerms, 2000) || !policyText(data.returnTerms, 4000) ||
        typeof data.productSlug !== "string" || !data.productSlug ||
        typeof data.variantKey !== "string" || !data.variantKey) return closed;
    return { mode, admissionOpen: true,
      offer: { productSlug: data.productSlug, variantId: data.variantKey, unitPriceCents: data.unitPriceCents,
        shippingCents: data.shippingCents, freeShippingThresholdCents: data.freeShippingThresholdCents,
        dispatchTerms: data.dispatchTerms, returnTerms: data.returnTerms } };
  } catch {
    return closed;
  }
});

/** Public availability follows the request host. An immutable Preview URL cannot advertise the serving offer. */
export async function readCheckoutStorefrontForOrigin(
  requestOrigin: string | null | undefined, env: Environment = process.env,
): Promise<CheckoutStorefront> {
  const closed: CheckoutStorefront = { mode: "closed", admissionOpen: false };
  if (!requestOrigin) return closed;
  const mode = selectedBusinessCheckout(env);
  try {
    if (mode) {
      if (env.CHECKOUT_MODE !== mode || requestOrigin !== businessCheckoutOrigin(mode, env)) return closed;
      if (mode === "live") {
        if (deploymentSupabaseTarget(env) !== "production") return closed;
        assertSupabaseTargetUrl(env.NEXT_PUBLIC_SUPABASE_URL ?? "", "production");
      }
    } else {
      if ([env.VERCEL, env.VERCEL_ENV, env.VERCEL_TARGET_ENV, env.VERCEL_PROJECT_ID].some(value => value !== undefined) ||
          (env.CHECKOUT_MODE && env.CHECKOUT_MODE !== "sandbox")) return closed;
      const url = new URL(requestOrigin);
      if (url.origin !== requestOrigin || url.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) return closed;
    }
  } catch { return closed; }
  return readCheckoutStorefront(env);
}
