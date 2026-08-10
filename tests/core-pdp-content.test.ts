import { describe, expect, it } from "vitest";
import {
  getCorePdpPresentation,
  corePdpProfileRows,
} from "@/lib/content/core-pdp";
import { normalizeProductPdpContent } from "@/lib/catalog/product-content";

const cases = [
  {
    slug: "cleanse-01-calming-gel-cleanser",
    title: "A daily GEL CLEANSER for a clean, BALANCED start.",
    overlay: "See how CLEANSE works in your skin routine.",
    heading: "YOUR DAILY CLEANSER THAT:",
    options: ["cleanses", "balances", "preps"],
    application: [
      "Morning and evening, wet your face and hands, then dispense a small amount.",
      "Massage over damp skin in light circles until the gel forms a soft lather. Rinse thoroughly and pat dry.",
      "Follow with TREAT, then SEAL. In the morning, finish with SPF.",
    ],
    ingredientNames: ["6-TYPE CICA COMPLEX", "LHA"],
    goodFor: "Daily cleansing, SPF removal, buildup",
    texture: "Clean, fresh, non-stripping",
    finish: "Balanced, not tight",
    systemPosition: 1,
    systemStepName: "CLEANSE",
  },
  {
    slug: "treat-03-pdrn-5-ampoule",
    title:
      "A lightweight PDRN SERUM for HYDRATION, smoother-looking texture, and a steadier GLOW.",
    overlay: "See how TREAT works in your skin routine.",
    heading: "YOUR DAILY TREATMENT THAT:",
    options: ["hydrates", "smooths", "wakes up the finish"],
    application: [
      "After CLEANSE—and toner or essence, if used—apply 2–3 drops across face and neck.",
      "Press into skin for 30–60 seconds, letting the lightweight serum settle before the next layer.",
      "Follow with SEAL. In the morning, finish with SPF.",
    ],
    ingredientNames: ["PDRN / SODIUM DNA 50,000 PPM", "NIACINAMIDE"],
    goodFor: "Dullness, dehydration, uneven-looking texture",
    texture: "Lightweight concentrated serum",
    finish: "Clean, hydrated, non-sticky",
    systemPosition: 3,
    systemStepName: "TREAT",
  },
  {
    slug: "seal-05-green-collagen-cream",
    title:
      "A CUSHIONING CREAM that holds HYDRATION close with a clean, COMPOSED finish.",
    overlay: "See how SEAL works in your skin routine.",
    heading: "YOUR DAILY CREAM THAT:",
    options: ["cushions", "comforts", "holds hydration"],
    application: [
      "After TREAT, smooth a small amount over face and neck.",
      "Press into skin, giving extra attention to areas that feel dry or tight.",
      "Use as the final Mei Pelle step at night. In the morning, follow with SPF.",
    ],
    ingredientNames: ["GREEN COLLAGEN COMPLEX", "PANTHENOL"],
    goodFor: "Dryness, comfort, routine finish",
    texture: "Cushioned, controlled",
    finish: "Composed, not overloaded",
    systemPosition: 5,
    systemStepName: "SEAL",
  },
] as const;

describe("Core PDP presentation contract", () => {
  it.each(cases)(
    "keeps exact product-specific copy and derives profile facts for $slug",
    (entry) => {
      const content = normalizeProductPdpContent(
        {
          schema_version: 1,
          profile_title_tokens: [{ text: entry.title }],
          routine_overlay: entry.overlay,
          outcome_heading: entry.heading,
          outcome_labels: [...entry.options],
          how_to_use_steps: [...entry.application],
          application_steps: [...entry.application],
          ingredient_cards: [],
          ingredient_story: {
            heading: "what’s inside",
            intro: "Ingredient story.",
            highlights: entry.ingredientNames.map((name) => ({
              name,
              description: `${name} description`,
            })),
            supportingIngredients: "Supporting ingredients.",
          },
          routine_guidance: `${entry.systemStepName} routine guidance.`,
        },
        entry.slug,
      );
      const product = {
        slug: entry.slug,
        routineGroup: "core" as const,
        goodFor: entry.goodFor,
        texture: entry.texture,
        finish: entry.finish,
        skinTypes: ["All skin types"],
        usageTime: ["Morning", "Night"],
        systemStepPosition: entry.systemPosition,
        systemStepName: entry.systemStepName,
        pdpContent: content,
      };
      const presentation = getCorePdpPresentation(product, content);

      expect(presentation?.profileTitle.map((token) => token.text).join("")).toBe(
        entry.title,
      );
      expect(presentation?.routineOverlay).toBe(entry.overlay);
      expect(presentation?.outcomeHeading).toBe(entry.heading);
      expect(presentation?.outcomeOptions.map((option) => option.label)).toEqual(
        entry.options,
      );
      expect(presentation?.applicationSteps.map((step) => step.copy)).toEqual(
        entry.application,
      );
      expect(presentation?.applicationSteps.map((step) => step.id)).toEqual([
        "01",
        "02",
        "03",
      ]);
      expect(
        content?.ingredientStory?.highlights.map(
          (highlight) => highlight.name,
        ),
      ).toEqual(entry.ingredientNames);
      expect(corePdpProfileRows(product)).toEqual([
        { label: "GOOD FOR", value: entry.goodFor },
        { label: "FEELS LIKE", value: entry.texture },
        { label: "FINISH", value: entry.finish },
        {
          label: "FYI",
          value: `All skin types • Morning and night • 0${entry.systemPosition} — The Core`,
        },
      ]);
      expect(JSON.stringify(corePdpProfileRows(product))).not.toContain(
        "The System",
      );
    },
  );
});
