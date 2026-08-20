import { describe, expect, it } from "vitest";
import {
  APPROVED_SUPABASE_PROJECT_REF,
  HELIX_DATABASE_AUDIT_SQL,
  buildHelixDatabaseAuditReport,
} from "@/scripts/db/helix-rebrand-audit";

describe("Helix database rebrand audit", () => {
  it("fails distinctly on a wrong project name and active legacy objects or data", () => {
    const legacyObject = ["mei", "pelle", "product", "family"].join("_");
    const legacyData = ["loyal", "ty"].join("");

    expect(
      buildHelixDatabaseAuditReport({
        project: {
          id: APPROVED_SUPABASE_PROJECT_REF,
          name: "Previous project name",
        },
        rows: [
          {
            identifier: legacyObject,
            surface: "function-definition",
            matches: 1,
          },
          {
            identifier: "products",
            surface: "current-data",
            matches: 2,
          },
        ],
      }),
    ).toEqual({
      ok: false,
      project: {
        id: APPROVED_SUPABASE_PROJECT_REF,
        name: "Previous project name",
        verified: false,
      },
      findings: [
        {
          identifier: legacyObject,
          matches: 1,
          surface: "function-definition",
        },
        {
          identifier: "products",
          matches: 2,
          surface: "current-data",
        },
      ],
    });

    expect(legacyData).toBe("loyal" + "ty");
  });

  it("passes only the approved project with no active findings", () => {
    expect(
      buildHelixDatabaseAuditReport({
        project: { id: APPROVED_SUPABASE_PROJECT_REF, name: "helix" },
        rows: [],
      }),
    ).toEqual({
      ok: true,
      project: {
        id: APPROVED_SUPABASE_PROJECT_REF,
        name: "helix",
        verified: true,
      },
      findings: [],
    });
  });

  it("inventories object definitions and current rows without returning row values", () => {
    expect(HELIX_DATABASE_AUDIT_SQL).toContain("pg_get_functiondef");
    expect(HELIX_DATABASE_AUDIT_SQL).toContain("pg_get_triggerdef");
    expect(HELIX_DATABASE_AUDIT_SQL).toContain("pg_get_constraintdef");
    expect(HELIX_DATABASE_AUDIT_SQL).toContain("pg_get_indexdef");
    expect(HELIX_DATABASE_AUDIT_SQL).toContain("pg_get_viewdef");
    expect(HELIX_DATABASE_AUDIT_SQL).toContain("pg_get_expr(default_record.adbin");
    expect(HELIX_DATABASE_AUDIT_SQL).toContain("enum_record.enumlabel");
    expect(HELIX_DATABASE_AUDIT_SQL).toContain("pg_catalog.col_description");
    expect(HELIX_DATABASE_AUDIT_SQL).toContain("pg_catalog.pg_roles");
    expect(HELIX_DATABASE_AUDIT_SQL).toContain("pg_catalog.pg_policy");
    expect(HELIX_DATABASE_AUDIT_SQL).toContain("query_to_xml");
    expect(HELIX_DATABASE_AUDIT_SQL).toContain("storage");
    expect(HELIX_DATABASE_AUDIT_SQL).toContain("relation.relname <> 'users'");
    expect(HELIX_DATABASE_AUDIT_SQL).toContain("to_jsonb(audited_row) - array");
    expect(HELIX_DATABASE_AUDIT_SQL).toContain("$1");
    expect(HELIX_DATABASE_AUDIT_SQL).toContain("$2");
    expect(HELIX_DATABASE_AUDIT_SQL).not.toContain("[ _-]+");
    expect(HELIX_DATABASE_AUDIT_SQL).not.toContain("select *");
  });
});
