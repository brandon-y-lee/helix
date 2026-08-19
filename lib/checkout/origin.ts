import { resolvePublicSiteOrigin } from "@/lib/site-url";

export function resolveCheckoutOrigin(input: {
  env?: NodeJS.ProcessEnv;
  requestOrigin?: string | null;
} = {}): string {
  return resolvePublicSiteOrigin(input);
}
