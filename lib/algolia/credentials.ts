import type { SupabaseTarget } from "@/lib/supabase/project-safety";

type Environment = Record<string, string | undefined>;

/** Shared by the serving writer, webhook authentication and the private release probe. */
export function catalogWriteApiKey(env: Environment, target: SupabaseTarget) {
  return target === "production" ? env.HELIX_PRODUCTION_ALGOLIA_WRITE_API_KEY : env.ALGOLIA_WRITE_API_KEY;
}

export function catalogWebhookSecret(env: Environment, target: SupabaseTarget) {
  return target === "production" ? env.HELIX_PRODUCTION_CATALOG_WEBHOOK_SECRET : env.HELIX_DEV_CATALOG_WEBHOOK_SECRET;
}
