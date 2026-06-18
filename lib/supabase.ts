import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";

// Supabase is the required, default catalog source — there is no static
// fallback. Both vars are NEXT_PUBLIC_* and safe to expose to the browser: the
// anon key is gated by row-level security (read-only catalog access).
//
// If either var is missing we throw immediately so misconfiguration fails fast
// with a clear, developer-facing error instead of silently degrading.

export class SupabaseConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SupabaseConfigError";
  }
}

let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const missing: string[] = [];
  if (!url) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!anonKey) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  if (missing.length > 0) {
    throw new SupabaseConfigError(
      `Missing required Supabase env var(s): ${missing.join(", ")}. ` +
        `Copy .env.example to .env.local and set your development Supabase ` +
        `project URL and anon/publishable key. The catalog requires Supabase ` +
        `— there is no static fallback.`,
    );
  }

  if (!client) {
    client = createClient(url!, anonKey!, {
      auth: { persistSession: false },
      realtime: {
        transport: WebSocket as unknown as typeof globalThis.WebSocket,
      },
    });
  }
  return client;
}
