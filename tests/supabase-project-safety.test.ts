import { describe, expect, it } from "vitest";

import {
  APPROVED_SUPABASE_PROJECT_REF,
  assertApprovedSupabaseProjectRef,
  assertApprovedSupabaseProjectUrl,
  projectRefFromSupabaseUrl,
} from "@/lib/supabase/project-safety";

describe("approved Supabase project safety", () => {
  it("accepts the approved non-production project URL", () => {
    const url = `https://${APPROVED_SUPABASE_PROJECT_REF}.supabase.co`;

    expect(projectRefFromSupabaseUrl(url)).toBe(
      APPROVED_SUPABASE_PROJECT_REF,
    );
    expect(assertApprovedSupabaseProjectUrl(url)).toBe(
      APPROVED_SUPABASE_PROJECT_REF,
    );
    expect(
      assertApprovedSupabaseProjectRef(APPROVED_SUPABASE_PROJECT_REF),
    ).toBe(APPROVED_SUPABASE_PROJECT_REF);
  });

  it.each([
    "not a URL",
    "https://example.com",
    `http://${APPROVED_SUPABASE_PROJECT_REF}.supabase.co`,
    `https://${APPROVED_SUPABASE_PROJECT_REF}.supabase.co.evil.example`,
  ])("rejects a malformed or non-Supabase URL: %s", (url) => {
    expect(projectRefFromSupabaseUrl(url)).toBeNull();
    expect(() => assertApprovedSupabaseProjectUrl(url)).toThrow(
      /Expected approved non-production project/,
    );
  });

  it("rejects an unexpected Supabase project", () => {
    expect(() =>
      assertApprovedSupabaseProjectUrl(
        "https://unexpected-project.supabase.co",
      ),
    ).toThrow(/unexpected-project/);
    expect(() =>
      assertApprovedSupabaseProjectRef("unexpected-project"),
    ).toThrow(/unexpected-project/);
  });
});
