import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "lib/algolia/source.ts"),
  "utf8",
);

describe("Product Family Algolia source", () => {
  it("rebuilds a family with one bounded Product projection query", () => {
    const familyReader = source.slice(
      source.indexOf("export async function fetchSearchRecordsByFamilyId"),
    );

    expect(familyReader).toContain('.from("products")');
    expect(familyReader).toContain(
      '.eq("product_family_memberships.family_id", familyId)',
    );
    expect(familyReader).toContain("FAMILY_SOURCE_SELECT");
    expect(familyReader).not.toContain("Promise.all");
    expect(familyReader).not.toContain("fetchSearchRecordById(");
  });
});
