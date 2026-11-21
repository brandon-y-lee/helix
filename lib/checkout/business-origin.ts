import { CheckoutConfigError } from "./config";
import { BUSINESS_SANDBOX_STOREFRONT_ORIGIN, isBusinessSandboxDeployment } from "../supabase/project-safety";

export { BUSINESS_SANDBOX_STOREFRONT_ORIGIN, isBusinessSandboxDeployment };
export const BUSINESS_SANDBOX_WEBHOOK_ORIGIN = "https://helixskin-dev-payments.vercel.app";
export const LIVE_CHECKOUT_ORIGIN = "https://www.helixskin.us";

export function businessCheckoutOrigin(environment: "business_sandbox" | "live", env: Record<string, string | undefined>): string {
  if (environment === "live") return LIVE_CHECKOUT_ORIGIN;
  const configured = env.CHECKOUT_ORIGIN?.trim();
  if (!isBusinessSandboxDeployment(env) || (configured && configured !== BUSINESS_SANDBOX_STOREFRONT_ORIGIN &&
      configured !== "https://helixskin.vercel.app")) {
    throw new CheckoutConfigError("checkout_misconfigured", "The development checkout origin could not be verified.");
  }
  return BUSINESS_SANDBOX_STOREFRONT_ORIGIN;
}
