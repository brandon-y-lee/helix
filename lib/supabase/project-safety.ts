export const SUPABASE_PROJECT_REFS = {
  development: "zyfkunnpnlmgvrojmrbg",
  production: "erasogmsqpgiirovubjh",
} as const;
export type SupabaseTarget = keyof typeof SUPABASE_PROJECT_REFS;
export const HELIX_VERCEL_PROJECT_ID = "prj_N9nyPL9SixJHOROIovS8PDQ9aKny";

type Environment = Record<string, string | undefined>;

export function supabaseOriginForTarget(target: SupabaseTarget): string {
  return `https://${SUPABASE_PROJECT_REFS[target]}.supabase.co`;
}

export function deploymentSupabaseTarget(env: Environment): SupabaseTarget {
  if (env.VERCEL === undefined && env.VERCEL_ENV === undefined &&
      env.VERCEL_TARGET_ENV === undefined && env.VERCEL_PROJECT_ID === undefined) {
    // Local development and ordinary CI jobs can never select production.
    return "development";
  }
  if (env.VERCEL !== "1" || env.VERCEL_PROJECT_ID !== HELIX_VERCEL_PROJECT_ID ||
      (env.VERCEL_TARGET_ENV !== undefined && env.VERCEL_TARGET_ENV !== env.VERCEL_ENV)) {
    throw new Error("Unrecognized deployment target for Supabase.");
  }
  if (env.VERCEL_ENV === "production" && env.VERCEL_GIT_COMMIT_REF === "main") return "production";
  if (env.VERCEL_ENV === "development") return "development";
  if (env.VERCEL_ENV === "preview" && env.VERCEL_GIT_COMMIT_REF && env.VERCEL_GIT_COMMIT_REF !== "main") return "development";
  throw new Error("Unrecognized deployment target for Supabase.");
}

/** Keep new Auth links and Checkout returns within the issuing deployment. */
export function verifyHostedSiteOrigins(env: Environment, target: SupabaseTarget): void {
  if (env.VERCEL !== "1" || env.VERCEL_ENV === "development") return;
  const developmentOrigin = "https://helixskin.vercel.app";
  const expected = target === "production" ? "https://www.helixskin.us" : developmentOrigin;
  if ((env.NEXT_PUBLIC_SITE_URL || developmentOrigin) !== expected ||
      [env.HELIX_EMAIL_SITE_ORIGIN, env.CHECKOUT_ORIGIN].some((origin) => Boolean(origin) && origin !== expected)) {
    throw new Error("Configured Auth or Checkout origin differs from the deployment target.");
  }
}

export function runtimeSupabaseTarget(): SupabaseTarget {
  // Next replaces this direct public reference with the target chosen by the
  // build. Server handlers independently verify their deployment metadata.
  const builtTarget = process.env.NEXT_PUBLIC_HELIX_SUPABASE_TARGET;
  if (typeof window !== "undefined") {
    if (builtTarget === "development" || builtTarget === "production") return builtTarget;
    throw new Error("Missing Supabase target in the browser build.");
  }
  const target = deploymentSupabaseTarget(process.env);
  if (builtTarget !== undefined && builtTarget !== target) {
    throw new Error("Supabase deployment target differs from the build.");
  }
  return target;
}

export function projectRefFromSupabaseUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || (url !== parsed.origin && url !== `${parsed.origin}/`)) return null;
    return /^([a-z0-9-]+)\.supabase\.co$/.exec(parsed.hostname)?.[1] ?? null;
  } catch {
    return null;
  }
}

export function assertSupabaseTargetRef<T extends SupabaseTarget>(
  projectRef: string | null, target: T,
): (typeof SUPABASE_PROJECT_REFS)[T] {
  const expected = SUPABASE_PROJECT_REFS[target];
  if (projectRef !== expected) throw new Error(`Refusing Supabase target. Expected the ${target} project.`);
  return expected;
}

export function assertSupabaseTargetUrl<T extends SupabaseTarget>(
  url: string, target: T,
): (typeof SUPABASE_PROJECT_REFS)[T] {
  return assertSupabaseTargetRef(projectRefFromSupabaseUrl(url), target);
}

/** Routine local operators always target the persistent development child. */
export function assertApprovedSupabaseProjectUrl(url: string) {
  return assertSupabaseTargetUrl(url, "development");
}

export function assertApprovedSupabaseProjectRef(projectRef: string | null) {
  return assertSupabaseTargetRef(projectRef, "development");
}

export type SupabaseKeyRole = "anon" | "service_role";

/** This is a local mismatch check. Supabase verifies the signature at its API. */
export function inspectSupabaseCredential(key: string, target: SupabaseTarget, role: SupabaseKeyRole): "opaque" | "jwt" {
  const prefix = role === "anon" ? "sb_publishable_" : "sb_secret_";
  if (key.startsWith(prefix) && /^[A-Za-z0-9_-]+$/.test(key.slice(prefix.length))) return "opaque";
  try {
    const parts = key.split(".");
    if (parts.length === 3 && parts.every((part) => /^[A-Za-z0-9_-]+$/.test(part))) {
      const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
      if (payload.role === role && payload.ref === SUPABASE_PROJECT_REFS[target]) return "jwt";
    }
  } catch {
    // All credential errors are redacted.
  }
  throw new Error(`Supabase credential does not match the ${target} target and required role.`);
}

export function assertSupabasePublicKey(key: string, target: SupabaseTarget): void {
  inspectSupabaseCredential(key, target, "anon");
}

export class SupabaseConfigError extends Error {
  constructor(message: string) { super(message); this.name = "SupabaseConfigError"; }
}

/** Static public references use the credential verified in the build config. */
export function readPublicSupabaseConnection() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    const missing = [!url && "NEXT_PUBLIC_SUPABASE_URL", !key && "NEXT_PUBLIC_SUPABASE_ANON_KEY"].filter(Boolean);
    throw new SupabaseConfigError(`Missing required Supabase env var(s): ${missing.join(", ")}.`);
  }
  const target = runtimeSupabaseTarget();
  assertSupabaseTargetUrl(url, target);
  assertSupabasePublicKey(key, target);
  return { url, key };
}
