import { CheckoutConfigError } from "@/lib/checkout/config";
import { CANONICAL_PUBLIC_SITE_ORIGIN } from "@/lib/site-url";

export function resolveCheckoutOrigin(input: {
  env?: NodeJS.ProcessEnv;
  requestOrigin?: string | null;
} = {}): string {
  const env = input.env ?? process.env;
  const configuredOrigin = env.CHECKOUT_ORIGIN?.trim() || undefined;
  const origin = configuredOrigin ?? (
    env.NODE_ENV === "development"
      ? "http://localhost:3000"
      : CANONICAL_PUBLIC_SITE_ORIGIN
  );

  try {
    const url = new URL(origin);
    const localDevelopment =
      env.NODE_ENV === "development" &&
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (origin !== url.origin || (url.protocol !== "https:" && !localDevelopment)) {
      throw new Error("Invalid checkout origin");
    }
    return url.origin;
  } catch {
    throw new CheckoutConfigError(
      "checkout_misconfigured",
      "Checkout origin is not configured correctly.",
    );
  }
}
