import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  corePdpPresentationBySlug,
  corePdpProfileRows,
} from "@/lib/content/core-pdp";
import { getProductPdpContent } from "@/lib/catalog/product-content";
import type { Product } from "@/lib/products";
import {
  CORE_PDP_MEDIA_ASSETS,
  inspectCorePdpAsset,
  storagePathForCorePdpAsset,
} from "@/scripts/catalog-sync-core-pdp-media";

const cases = [
  {
    slug: "cleanse-01-calming-gel-cleanser",
    prefix: "cleanse",
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
    step: 1,
  },
  {
    slug: "treat-03-pdrn-5-ampoule",
    prefix: "treat",
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
    step: 2,
  },
  {
    slug: "seal-05-green-collagen-cream",
    prefix: "seal",
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
    step: 3,
  },
] as const;

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("Core PDP presentation contract", () => {
  it.each(cases)(
    "keeps exact product-specific copy and derives profile facts for $slug",
    (entry) => {
      const presentation =
        corePdpPresentationBySlug[
          entry.slug as keyof typeof corePdpPresentationBySlug
        ];
      const product = {
        goodFor: entry.goodFor,
        texture: entry.texture,
        finish: entry.finish,
        skinTypes: ["All skin types"],
        usageTime: ["Morning", "Night"],
        routineStepNumber: entry.step,
        routineGroupLabel: "The Core",
        routineDisplayLabel: `${String(entry.step).padStart(2, "0")} - The Core`,
        legacyRoutineDisplayLabel: "05 - The System",
      } as Product;

      expect(presentation.profileTitle.map((token) => token.text).join("")).toBe(
        entry.title,
      );
      expect(presentation.routineOverlay).toBe(entry.overlay);
      expect(presentation.outcomeHeading).toBe(entry.heading);
      expect(presentation.outcomeOptions.map((option) => option.label)).toEqual(
        entry.options,
      );
      expect(presentation.applicationSteps.map((step) => step.copy)).toEqual(
        entry.application,
      );
      expect(presentation.applicationSteps.map((step) => step.id)).toEqual([
        "01",
        "02",
        "03",
      ]);
      expect(
        presentation.applicationSteps.map((step) => step.futureMediaFilename),
      ).toEqual([
        `${entry.prefix}-pdp-application-01.webp`,
        `${entry.prefix}-pdp-application-02.webp`,
        `${entry.prefix}-pdp-application-03.webp`,
      ]);
      expect(
        getProductPdpContent(entry.slug).ingredientStory?.highlights.map(
          (highlight) => highlight.name,
        ),
      ).toEqual(entry.ingredientNames);
      expect(corePdpProfileRows(product)).toEqual([
        { label: "GOOD FOR", value: entry.goodFor },
        { label: "FEELS LIKE", value: entry.texture },
        { label: "FINISH", value: entry.finish },
        {
          label: "FYI",
          value: `All skin types • Morning and night • Step 0${entry.step} of The Core`,
        },
      ]);
      expect(JSON.stringify(corePdpProfileRows(product))).not.toContain(
        "The System",
      );
    },
  );

  it.each(cases)(
    "maps only the explicit $prefix PDP media basenames",
    (entry) => {
      const assets = CORE_PDP_MEDIA_ASSETS.filter(
        (asset) => asset.slug === entry.slug,
      );

      expect(assets.map((asset) => asset.role)).toEqual([
        "routine_video",
        "routine_video_poster",
        "profile_editorial",
        "ingredients_texture",
      ]);
      expect(assets.map((asset) => asset.filename)).toEqual([
        `${entry.prefix}-pdp-routine-source.mp4`,
        `${entry.prefix}-pdp-routine-poster.webp`,
        `${entry.prefix}-pdp-profile-01.webp`,
        `${entry.prefix}-pdp-ingredients-texture-01.webp`,
      ]);
      expect(
        assets.every((asset) =>
          storagePathForCorePdpAsset(asset, "checksum").startsWith(
            `products/${entry.slug}/`,
          ),
        ),
      ).toBe(true);
      expect(
        storagePathForCorePdpAsset(assets[3], "checksum"),
      ).toBe(
        `products/${entry.slug}/ingredients-texture/checksum.webp`,
      );
    },
  );

  it("fails clearly for a missing required source", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mei-pelle-pdp-missing-"));
    temporaryDirectories.push(directory);

    await expect(
      inspectCorePdpAsset(CORE_PDP_MEDIA_ASSETS[0], directory),
    ).rejects.toThrow(/Cannot read required source/);
  });

  it("rejects a routine video whose payload is not MP4", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mei-pelle-pdp-invalid-"));
    temporaryDirectories.push(directory);
    const video = CORE_PDP_MEDIA_ASSETS[0];
    await writeFile(join(directory, video.filename), Buffer.from("not an mp4"));

    await expect(inspectCorePdpAsset(video, directory)).rejects.toThrow(
      /is not an MP4 file/,
    );
  });
});
