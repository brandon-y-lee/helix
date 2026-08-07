export const APPROVED_SUPABASE_PROJECT_REF =
  "erasogmsqpgiirovubjh" as const;

export function projectRefFromSupabaseUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;
    const match = parsed.hostname.match(/^([a-z0-9-]+)\.supabase\.co$/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

export function assertApprovedSupabaseProjectRef(
  projectRef: string | null,
): typeof APPROVED_SUPABASE_PROJECT_REF {
  if (projectRef !== APPROVED_SUPABASE_PROJECT_REF) {
    throw new Error(
      `Refusing Supabase project "${projectRef ?? "unknown"}". ` +
        `Expected approved non-production project "${APPROVED_SUPABASE_PROJECT_REF}".`,
    );
  }
  return APPROVED_SUPABASE_PROJECT_REF;
}

export function assertApprovedSupabaseProjectUrl(
  url: string,
): typeof APPROVED_SUPABASE_PROJECT_REF {
  return assertApprovedSupabaseProjectRef(projectRefFromSupabaseUrl(url));
}
