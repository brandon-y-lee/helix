import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { createSupabaseFetch } from "@/lib/supabase/network";

let adminClient: SupabaseClient | null = null;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required Supabase env var: ${name}`);
  return value;
}

export function createSupabaseAdminClient(): SupabaseClient {
  if (adminClient) return adminClient;

  adminClient = createClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: {
        fetch: createSupabaseFetch(),
      },
      realtime: {
        transport: WebSocket as unknown as typeof globalThis.WebSocket,
      },
    },
  );

  return adminClient;
}
