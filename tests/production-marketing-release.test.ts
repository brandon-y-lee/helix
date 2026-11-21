// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderWelcomeRelease } from "../scripts/db/render-production-marketing-release.mjs";

describe("reviewed production marketing release", () => {
  it("binds the actual owner packages to the same committed forward operation on both targets", () => {
    const name = "20261121081630_install_production_marketing";
    const sql = readFileSync(`supabase/migrations/${name}.sql`, "utf8");
    const sidecar = readFileSync(`supabase/releases/${name}.json`, "utf8");
    const development = renderWelcomeRelease({ environment: "development" });
    const production = renderWelcomeRelease({ environment: "production" });
    for (const release of [development, production]) {
      expect(release.migration).toBe(sql);
      expect(JSON.stringify(release.manifest, null, 2) + "\n").toBe(sidecar);
    }
    expect(production.ownerSql).not.toBe(development.ownerSql);
    expect(() => renderWelcomeRelease({ environment: "preview" })).toThrow();
  });
});
