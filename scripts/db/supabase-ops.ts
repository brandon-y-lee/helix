import { resolve } from "node:path";
import { config } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { EXPECTED_SUPABASE_PROJECT_REF } from "../catalog/canonical-catalog-manifest";

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
  const override = process.env.ALLOW_NON_CANONICAL_SUPABASE_REF === "true";

  if (projectRef !== EXPECTED_SUPABASE_PROJECT_REF && !override) {
    throw new Error(
      `Refusing database operation for project ref "${projectRef ?? "unknown"}". ` +
        `Expected "${EXPECTED_SUPABASE_PROJECT_REF}". Set ` +
        `ALLOW_NON_CANONICAL_SUPABASE_REF=true only for an intentional local/non-production override.`,
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

export async function exactCount(
  supabase: SupabaseClient,
  table: string,
): Promise<number> {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true });

  if (error) throw new Error(`[db-audit] Failed to count ${table}: ${error.message}`);
  return count ?? 0;
}
