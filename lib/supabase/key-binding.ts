import { createHash } from "node:crypto";
import { inspectSupabaseCredential, type SupabaseKeyRole, type SupabaseTarget } from "./project-safety";

/** Opaque Supabase keys do not identify their project. The provisioning owner
 * supplies a fingerprint from the intended project separately from the key. */
export function verifySupabaseCredential(
  key: string, target: SupabaseTarget, role: SupabaseKeyRole, env: Record<string, string | undefined>,
): void {
  const format = inspectSupabaseCredential(key, target, role);
  if (format === "jwt") return;
  const expected = env[`HELIX_${target.toUpperCase()}_SUPABASE_${role.toUpperCase()}_KEY_SHA256`];
  if (!expected || !/^[a-f0-9]{64}$/.test(expected) || createHash("sha256").update(key).digest("hex") !== expected) {
    throw new Error(`Supabase credential fingerprint does not match the ${target} target.`);
  }
}
