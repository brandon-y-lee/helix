export const APPROVED_SUPABASE_PROJECT_REF =
  "erasogmsqpgiirovubjh" as const;

type ProjectUrlInspection =
  | { ok: true; projectRef: string }
  | { ok: false; reason: "invalid-url" | "insecure" | "unexpected-host" };

function inspectSupabaseProjectUrl(url: string): ProjectUrlInspection {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: "invalid-url" };
  }
  if (parsed.protocol !== "https:") {
    return { ok: false, reason: "insecure" };
  }
  const match = parsed.hostname.match(/^([a-z0-9-]+)\.supabase\.co$/);
  if (!match) return { ok: false, reason: "unexpected-host" };
  return { ok: true, projectRef: match[1] };
}

export function projectRefFromSupabaseUrl(url: string): string | null {
  const inspection = inspectSupabaseProjectUrl(url);
  return inspection.ok ? inspection.projectRef : null;
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
  const inspection = inspectSupabaseProjectUrl(url);
  if (!inspection.ok) {
    const guidance = {
      "invalid-url": "Provide a valid absolute HTTPS URL.",
      insecure: "The Supabase project URL must use HTTPS.",
      "unexpected-host":
        `The hostname must exactly match <project-ref>.supabase.co.`,
    }[inspection.reason];
    throw new Error(
      `Refusing Supabase project URL. ${guidance} ` +
        `Expected approved non-production project "${APPROVED_SUPABASE_PROJECT_REF}".`,
    );
  }
  return assertApprovedSupabaseProjectRef(inspection.projectRef);
}
