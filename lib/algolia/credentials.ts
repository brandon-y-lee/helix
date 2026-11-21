import type { SupabaseTarget } from "@/lib/supabase/project-safety";

type Environment = Record<string, string | undefined>;

/** Shared by the serving writer, webhook authentication and the private release probe. */
export function catalogWriteApiKey(env: Environment, target: SupabaseTarget) {
  if (target === "development") return env.ALGOLIA_WRITE_API_KEY;
  const writer = env.HELIX_PRODUCTION_ALGOLIA_WRITE_API_KEY;
  if (writer && (writer === env.ALGOLIA_WRITE_API_KEY || writer === env.ALGOLIA_ADMIN_API_KEY)) {
    throw new Error("Production Search requires an independent writer.");
  }
  return writer;
}

export function catalogWebhookSecret(env: Environment, target: SupabaseTarget) {
  if (target === "development") return env.HELIX_DEV_CATALOG_WEBHOOK_SECRET;
  const signer = env.HELIX_PRODUCTION_CATALOG_WEBHOOK_SECRET;
  if (signer === env.HELIX_DEV_CATALOG_WEBHOOK_SECRET || signer === env.SUPABASE_CATALOG_WEBHOOK_SECRET) return undefined;
  return signer;
}
