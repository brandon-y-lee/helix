import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseFetch } from "@/lib/supabase/network";
import { assertSupabaseTargetUrl, runtimeSupabaseTarget } from "./project-safety";
import { verifySupabaseCredential } from "./key-binding";

let cached: { url: string; key: string; client: SupabaseClient } | undefined;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required Supabase env var: ${name}`);
  return value;
}

export function createSupabaseAdminClient(): SupabaseClient {
  const url = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const target = runtimeSupabaseTarget();
  assertSupabaseTargetUrl(url, target);
  verifySupabaseCredential(key, target, "service_role", process.env);
  if (cached?.url === url && cached.key === key) return cached.client;
  const client = createClient(
    url,
    key,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: {
        fetch: createSupabaseFetch(),
      },
    },
  );

  cached = { client, url, key };
  return client;
}
