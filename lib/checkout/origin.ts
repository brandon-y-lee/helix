import { CheckoutConfigError } from "@/lib/checkout/config";

function normalizedOrigin(value: string | undefined): string | null {
  if (!value) return null;

  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    if (url.username || url.password) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function isLocalDevelopmentOrigin(origin: string): boolean {
  const url = new URL(origin);
  return (
    url.protocol === "http:" &&
    ["localhost", "127.0.0.1", "::1"].includes(url.hostname)
  );
}

export function resolveCheckoutOrigin(input: {
  env?: NodeJS.ProcessEnv;
  requestOrigin?: string | null;
} = {}): string {
  const env = input.env ?? process.env;
  const configuredOrigin = normalizedOrigin(env.NEXT_PUBLIC_SITE_URL);
  if (configuredOrigin) return configuredOrigin;

  const vercelOrigin = normalizedOrigin(env.VERCEL_URL);
  if (vercelOrigin) return vercelOrigin;

  const requestOrigin = normalizedOrigin(input.requestOrigin ?? undefined);
  if (env.NODE_ENV !== "production" && requestOrigin && isLocalDevelopmentOrigin(requestOrigin)) {
    return requestOrigin;
  }

  if (env.NODE_ENV !== "production") {
    return "http://localhost:3000";
  }

  throw new CheckoutConfigError(
    "checkout_misconfigured",
    "A trusted checkout return origin is not configured.",
  );
}
