export const CANONICAL_PUBLIC_SITE_ORIGIN =
  "https://helixskin.vercel.app" as const;

const LOCAL_DEVELOPMENT_ORIGIN = "http://localhost:3000";

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
  if (env.NODE_ENV !== "development") return CANONICAL_PUBLIC_SITE_ORIGIN;

  return (
    localDevelopmentOrigin(env.NEXT_PUBLIC_SITE_URL?.trim()) ??
    localDevelopmentOrigin(input.requestOrigin) ??
    LOCAL_DEVELOPMENT_ORIGIN
  );
}
