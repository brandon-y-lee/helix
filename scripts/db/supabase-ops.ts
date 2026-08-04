import { resolve } from "node:path";
import { config } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { EXPECTED_SUPABASE_PROJECT_REF } from "../../lib/catalog/canonical-catalog";

config({ path: resolve(process.cwd(), ".env.local"), quiet: true });

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export function projectRefFromSupabaseUrl(url: string): string | null {
  try {
    const hostname = new URL(url).hostname;
    if (!hostname.endsWith(".supabase.co")) return null;
    return hostname.split(".")[0] ?? null;
  } catch {
    return null;
  }
}

export function assertExpectedProjectRef(): void {
  const url = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const projectRef = projectRefFromSupabaseUrl(url);
  if (projectRef !== EXPECTED_SUPABASE_PROJECT_REF) {
    throw new Error(
      `Refusing database operation for project ref "${projectRef ?? "unknown"}". ` +
        `Expected approved non-production project "${EXPECTED_SUPABASE_PROJECT_REF}".`,
    );
  }
}

export function createOpsClient(): SupabaseClient {
  assertExpectedProjectRef();

  return createClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      realtime: {
        transport: WebSocket as unknown as typeof globalThis.WebSocket,
      },
    },
  );
}

export function parseFlag(name: string): boolean {
  return process.argv.includes(name);
}

export function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}
