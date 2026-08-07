import { resolve } from "node:path";
import { config } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import {
  assertApprovedSupabaseProjectUrl,
  projectRefFromSupabaseUrl,
} from "../../lib/supabase/project-safety";

export { projectRefFromSupabaseUrl };

config({ path: resolve(process.cwd(), ".env.local"), quiet: true });

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export function assertExpectedProjectRef(): void {
  const url = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  try {
    assertApprovedSupabaseProjectUrl(url);
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : "Unknown project.";
    throw new Error(
      `Refusing database operation. ${detail}`,
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
