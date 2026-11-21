import { createHash } from "node:crypto";
import type { SupabaseTarget } from "../supabase/project-safety";
import { expectedSearchAppId, productsIndexForTarget } from "./index";

/** Validate public Search settings whenever Next builds or starts the application. */
export function verifyPublicSearchBinding(env: Record<string, string | undefined>, target: SupabaseTarget): void {
  const appId = env.NEXT_PUBLIC_ALGOLIA_APP_ID;
  const key = env.NEXT_PUBLIC_ALGOLIA_SEARCH_API_KEY;
  const index = env.NEXT_PUBLIC_ALGOLIA_INDEX_NAME;
  if (!appId && !key && !index) return;
  const digest = env[`HELIX_${target.toUpperCase()}_ALGOLIA_SEARCH_KEY_SHA256`];
  if (!appId || !key || index !== productsIndexForTarget(target) || appId !== expectedSearchAppId(env, target)
    || key === env.HELIX_PRODUCTION_ALGOLIA_WRITE_API_KEY || key === env.ALGOLIA_WRITE_API_KEY || key === env.ALGOLIA_ADMIN_API_KEY
    || !digest || createHash("sha256").update(key).digest("hex") !== digest) {
    throw new Error("Public Search settings do not match the deployment target.");
  }
}
