import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  getCorePdpPresentation,
  corePdpProfileRows,
} from "@/lib/content/core-pdp";
import { normalizeProductPdpContent } from "@/lib/catalog/product-content";
import {
  CORE_PDP_MEDIA_ASSETS,
  assertCorePdpAssetFilename,
  galleryPlaceholderArchiveIds,
  inspectConfiguredCorePdpAssets,
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
    stepName: "Cleanse",
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
    stepName: "Treat",
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
    stepName: "Seal",
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
          routine_guidance: `${entry.stepName} routine guidance.`,
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
        routineStepNumber: entry.step,
        routineStepName: entry.stepName,
        routineSort: entry.step * 10,
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
        "core_routine_texture",
        "core_routine_editorial",
        "gallery",
      ]);
      expect(assets.map((asset) => asset.filename)).toEqual([
        `${entry.prefix}-pdp-routine-source.mp4`,
        `${entry.prefix}-pdp-routine-poster.webp`,
        `${entry.prefix}-pdp-profile-01.webp`,
        `${entry.prefix}-pdp-ingredients-texture-01.webp`,
        `${entry.prefix}-pdp-core-routine-texture-01.webp`,
        `${entry.prefix}-pdp-core-routine-editorial-01.webp`,
        `${entry.prefix}-pdp-gallery-02.webp`,
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
      expect(
        storagePathForCorePdpAsset(assets[4], "checksum"),
      ).toBe(
        `products/${entry.slug}/core-routine-texture/checksum.webp`,
      );
      expect(
        storagePathForCorePdpAsset(assets[5], "checksum"),
      ).toBe(
        `products/${entry.slug}/core-routine-editorial/checksum.webp`,
      );
      expect(
        storagePathForCorePdpAsset(assets[6], "checksum"),
      ).toBe(`products/${entry.slug}/gallery/checksum.webp`);
    },
  );

  it("accepts only the exact product gallery basename and 02 suffix", () => {
    const gallery = CORE_PDP_MEDIA_ASSETS.find(
      (asset) =>
        asset.slug === "cleanse-01-calming-gel-cleanser" &&
        asset.role === "gallery",
    );
    expect(gallery).toBeDefined();
    expect(() => assertCorePdpAssetFilename(gallery!)).not.toThrow();
    expect(() =>
      assertCorePdpAssetFilename({
        ...gallery!,
        filename: "cleanse-pdp-gallery-01.webp",
      }),
    ).toThrow(/expected "cleanse-pdp-gallery-02.webp"/);
    expect(() =>
      assertCorePdpAssetFilename({
        ...gallery!,
        filename: "treat-pdp-gallery-02.webp",
      }),
    ).toThrow(/Invalid gallery basename/);
  });

  it("replaces one palette placeholder and archives only obsolete placeholders", () => {
    const productId = "product-cleanse";
    const publicUrl =
      "https://erasogmsqpgiirovubjh.supabase.co/storage/v1/object/public/mei-pelle-catalog/products/cleanse/gallery/hash.webp";
    const placeholder = (id: string, sortOrder: number) => ({
      id,
      product_id: productId,
      media_type: "image",
      url: null,
      width: null,
      height: null,
      role: "gallery",
      sort_order: sortOrder,
      palette_id: `cleanse-gallery-${sortOrder}`,
      placeholder_palette: { start: "#ffffff", end: "#000000" },
      original_source_url: null,
      source_filename: null,
    });

    expect(
      galleryPlaceholderArchiveIds(
        [placeholder("gallery-2", 2), placeholder("gallery-3", 3)],
        productId,
        2,
        publicUrl,
      ),
    ).toEqual(["gallery-3"]);

    expect(
      galleryPlaceholderArchiveIds(
        [
          {
            ...placeholder("gallery-2", 2),
            url: publicUrl,
            width: 1440,
            height: 1800,
            palette_id: null,
            placeholder_palette: {},
            source_filename: "cleanse-pdp-gallery-02.webp",
          },
        ],
        productId,
        2,
        publicUrl,
      ),
    ).toEqual([]);
  });

  it("refuses intentional gallery media and duplicate canonical assets", () => {
    const productId = "product-cleanse";
    const publicUrl = "https://example.test/gallery/hash.webp";
    const intentional = {
      id: "gallery-3",
      product_id: productId,
      media_type: "image",
      url: "https://example.test/gallery/other.webp",
      width: 1440,
      height: 1800,
      role: "gallery",
      sort_order: 3,
      palette_id: null,
      placeholder_palette: {},
      original_source_url: null,
      source_filename: "intentional.webp",
    };

    expect(() =>
      galleryPlaceholderArchiveIds(
        [intentional],
        productId,
        2,
        publicUrl,
      ),
    ).toThrow(/intentional gallery media/);
    expect(() =>
      galleryPlaceholderArchiveIds(
        [{ ...intentional, role: "card_default", url: publicUrl }],
        productId,
        2,
        publicUrl,
      ),
    ).toThrow(/already belongs to card_default/);
  });

  it("reports the three future editorial inputs deterministically when absent", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mei-pelle-pdp-editorial-"));
    temporaryDirectories.push(directory);
    const editorialAssets = CORE_PDP_MEDIA_ASSETS.filter(
      (asset) => asset.role === "core_routine_editorial",
    );

    const first = await inspectConfiguredCorePdpAssets(
      directory,
      editorialAssets,
    );
    const second = await inspectConfiguredCorePdpAssets(
      directory,
      editorialAssets,
    );

    expect(first).toEqual(second);
    expect(first.assets).toEqual([]);
    expect(first.missingInputs).toEqual([
      "cleanse-pdp-core-routine-editorial-01.webp",
      "treat-pdp-core-routine-editorial-01.webp",
      "seal-pdp-core-routine-editorial-01.webp",
    ]);
  });

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
