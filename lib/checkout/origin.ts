import { CheckoutConfigError } from "@/lib/checkout/config";
import { businessCheckoutOrigin } from "./business-origin";
import { compatibleRequestOrigin, isControlledPublicSiteOrigin, resolvePublicSiteOrigin } from "@/lib/site-url";

export function resolveCheckoutOrigin(input: {
  env?: NodeJS.ProcessEnv;
  requestOrigin?: string | null;
} = {}): string {
  const env = input.env ?? process.env;
  if (env.CHECKOUT_MODE === "business_sandbox" || env.CHECKOUT_MODE === "live") {
    return businessCheckoutOrigin(env.CHECKOUT_MODE, env);
  }
  const configuredOrigin = env.CHECKOUT_ORIGIN?.trim() || undefined;
  const origin = configuredOrigin ?? (
    env.NODE_ENV === "development"
      ? "http://localhost:3000"
      : resolvePublicSiteOrigin({ env })
  );

  try {
    const url = new URL(origin);
    const localDevelopment =
      env.NODE_ENV === "development" &&
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (origin !== url.origin || (!isControlledPublicSiteOrigin(origin) && !localDevelopment)) {
      throw new Error("Invalid checkout origin");
    }
    return compatibleRequestOrigin(url.origin, input.requestOrigin, env);
  } catch {
    throw new CheckoutConfigError(
      "checkout_misconfigured",
      "Checkout origin is not configured correctly.",
    );
  }
}
