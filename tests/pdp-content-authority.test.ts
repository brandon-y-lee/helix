import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  normalizeProductPdpContent,
  type ProductPdpContentRow,
} from "@/lib/catalog/product-content";

const validRow: ProductPdpContentRow = {
  schema_version: 1,
  profile_title_tokens: [
    { text: "A catalog " },
    { text: "TITLE", emphasis: true },
  ],
  routine_overlay: "Catalog-owned routine overlay.",
  outcome_heading: "CATALOG OUTCOMES:",
  outcome_labels: ["one", "two", "three"],
  how_to_use_steps: ["First.", "Second."],
  application_steps: ["Apply one.", "Apply two.", "Apply three."],
  ingredient_cards: [
    {
      name: "Catalog ingredient",
      label: "Catalog label",
      copy: "Catalog narrative.",
    },
  ],
  ingredient_story: {
    heading: "what’s inside",
    intro: "Catalog intro.",
    highlights: [
      { name: "ONE", description: "First highlight." },
      { name: "TWO", description: "Second highlight." },
    ],
    supportingIngredients: "also made with THREE",
  },
  routine_guidance: "Catalog routine guidance.",
};

describe("Supabase PDP content authority", () => {
  it("normalizes populated catalog content without a slug-specific override", () => {
    const content = normalizeProductPdpContent(validRow, "known-product");

    expect(content).toMatchObject({
      schemaVersion: 1,
      routineOverlay: "Catalog-owned routine overlay.",
      outcomeHeading: "CATALOG OUTCOMES:",
      outcomeLabels: ["one", "two", "three"],
      routineGuidance: "Catalog routine guidance.",
    });
    expect(content?.profileTitleTokens).toEqual(validRow.profile_title_tokens);
    expect(content?.ingredientCards).toEqual(validRow.ingredient_cards);
  });

  it("distinguishes an absent row from intentionally empty structured content", () => {
    expect(normalizeProductPdpContent(null, "missing-product")).toBeNull();

    const content = normalizeProductPdpContent(
      {
        ...validRow,
        profile_title_tokens: null,
        routine_overlay: null,
        outcome_heading: null,
        outcome_labels: null,
        how_to_use_steps: [],
        application_steps: [],
        ingredient_cards: [],
        ingredient_story: null,
        routine_guidance: null,
      },
      "empty-product",
    );

    expect(content).not.toBeNull();
    expect(content?.howToUseSteps).toEqual([]);
    expect(content?.applicationSteps).toEqual([]);
    expect(content?.ingredientCards).toEqual([]);
  });

  it.each([
    ["schema_version", { ...validRow, schema_version: 2 }],
    ["outcome_labels", { ...validRow, outcome_labels: ["one", "two"] }],
    ["profile_title_tokens", { ...validRow, profile_title_tokens: [{}] }],
    ["ingredient_cards", { ...validRow, ingredient_cards: [{ name: "Only" }] }],
    [
      "ingredient_story",
      {
        ...validRow,
        ingredient_story: {
          heading: "Inside",
          intro: "Intro",
          highlights: [],
          supportingIngredients: "Support",
        },
      },
    ],
  ])("rejects malformed %s content", (field, row) => {
    expect(() =>
      normalizeProductPdpContent(row as ProductPdpContentRow, "bad-product"),
    ).toThrow(field);
  });

  it("backfills approved Core copy without duplicating commerce fields", async () => {
    const migration = await readFile(
      "supabase/migrations/20260729102011_establish_pdp_content_authority.sql",
      "utf8",
    );
    const tableDefinition = migration.slice(
      migration.indexOf("create table"),
      migration.indexOf("comment on table"),
    );

    expect(migration).toContain(
      "See how CLEANSE works in your skin routine.",
    );
    expect(migration).toContain(
      "See how TREAT works in your skin routine.",
    );
    expect(migration).toContain(
      "See how SEAL works in your skin routine.",
    );
    expect(tableDefinition).not.toMatch(
      /\b(price|price_cents|availability|inventory|variant|media_url)\b/,
    );
  });
});
