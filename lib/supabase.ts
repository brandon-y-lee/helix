import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readPublicSupabaseConnection } from "./supabase/project-safety";
export { SupabaseConfigError } from "./supabase/project-safety";

// Catalog always uses the deployment's verified public credential and RLS.
let cached: { url: string; key: string; client: SupabaseClient } | undefined;

export function getSupabaseClient(): SupabaseClient {
  const { url, key } = readPublicSupabaseConnection();
  if (cached?.url !== url || cached.key !== key) {
    const client = createClient(url, key, { auth: { persistSession: false } });
    cached = { client, url, key };
  }
  return cached.client;
}
