export const CANONICAL_PUBLIC_SITE_ORIGIN =
  "https://helixskin.vercel.app" as const;

const LOCAL_DEVELOPMENT_ORIGIN = "http://localhost:3000";

// An environment value may select a reviewed hostname, never an arbitrary
// deployment URL. Keep the legacy origin available while old links expire.
export function isControlledPublicSiteOrigin(value: string): boolean {
  return [
    CANONICAL_PUBLIC_SITE_ORIGIN,
    "https://helixskin.us",
    "https://www.helixskin.us",
  ].includes(value);
}

export function compatibleRequestOrigin(
  configuredOrigin: string,
  requestOrigin: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return requestOrigin === configuredOrigin ||
    (env.NODE_ENV !== "development" && requestOrigin === CANONICAL_PUBLIC_SITE_ORIGIN)
    ? requestOrigin
    : configuredOrigin;
}

function localDevelopmentOrigin(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "http:" ||
      !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
      url.username ||
      url.password
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

export function resolvePublicSiteOrigin(input: {
  env?: NodeJS.ProcessEnv;
  requestOrigin?: string | null;
} = {}): string {
  const env = input.env ?? process.env;
  if (env.NODE_ENV !== "development") {
    const configured = env.NEXT_PUBLIC_SITE_URL?.trim() ?? "";
    return isControlledPublicSiteOrigin(configured) ? configured : CANONICAL_PUBLIC_SITE_ORIGIN;
  }

  return (
    localDevelopmentOrigin(env.NEXT_PUBLIC_SITE_URL?.trim()) ??
    localDevelopmentOrigin(input.requestOrigin) ??
    LOCAL_DEVELOPMENT_ORIGIN
  );
}
