import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { getSupabaseClient } from "@/lib/supabase";

vi.mock("@/lib/supabase", () => ({
  getSupabaseClient: vi.fn(),
}));

import {
  getCoreRoutineContentSummaries,
  getDiscoveryProductCardContents,
  getPdpProductContent,
  getProductCardContents,
  getProductMetadata,
  getProductOffer,
} from "@/lib/catalog/storefront";
import { CORE_ROUTINE_PRODUCT_SLUGS } from "@/lib/catalog/models";

const mockedGetClient = getSupabaseClient as unknown as Mock;

type QueryResult = { data: unknown; error: unknown };
type Call = { method: string; args: unknown[] };

function makeClient(result: QueryResult) {
  const calls: Call[] = [];
  const builder = {
    select: (...args: unknown[]) => {
      calls.push({ method: "select", args });
      return builder;
    },
    eq: (...args: unknown[]) => {
      calls.push({ method: "eq", args });
      return builder;
    },
    neq: (...args: unknown[]) => {
      calls.push({ method: "neq", args });
      return builder;
    },
    in: (...args: unknown[]) => {
      calls.push({ method: "in", args });
      return builder;
    },
    order: (...args: unknown[]) => {
      calls.push({ method: "order", args });
      return builder;
    },
    limit: (...args: unknown[]) => {
      calls.push({ method: "limit", args });
      return builder;
    },
    maybeSingle: () => Promise.resolve(result),
    then: (
      resolve: (value: QueryResult) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject),
  };
  return { client: { from: () => builder }, calls };
}

const variant = {
  variant_key: "full-size",
  label: "Full size",
  price_cents: 2500,
  available: true,
  inventory_status: "in_stock",
  volume: "30 mL",
  pack_count: null,
  position: 0,
  sort_order: 0,
};

function media(role: string, sortOrder = 0) {
  return {
    media_type: "image",
    media_kind: "image",
    url: `https://example.supabase.co/${role}-${sortOrder}.webp`,
    alt: `${role} media`,
    width: 1000,
    height: 1200,
    role,
    sort_order: sortOrder,
    palette_id: null,
    placeholder_palette: null,
  };
}

function productRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "product-id",
    slug: "treat-03-pdrn-5-ampoule",
    name: "TREAT",
    display_name: "TREAT",
    formal_title: "TREAT 03 PDRN Ampoule",
    tagline: "Bounce and glow",
    card_tagline: "Bounce and glow",
    collection: "The Core",
    routine_number: "02",
    routine_group: "core",
    routine_group_label: "The Core",
    routine_step_number: 2,
    routine_step_name: "Treat",
    routine_display_label: "02 — The Core",
    routine_sort: 20,
    product_type: "Ampoule / Serum",
    currency: "USD",
    sort_order: 20,
    position: 3,
    created_at: "2026-06-14T00:00:00.000Z",
    description: "PDP description.",
    editorial_description: "Approved editorial description.",
    benefits: ["Hydrates", "Smooths"],
    how_to_use: "Apply after cleansing.",
    editorial_how_to_use: "Apply after CLEANSE.",
    formula_notes: ["PDRN", "Niacinamide"],
    swatch_from: "#edf4f5",
    swatch_to: "#87a3aa",
    status: "available",
    made_for: "Dull-looking skin",
    good_for: "Dullness and dehydration",
    texture: "Lightweight serum",
    key_ingredients: ["PDRN", "Niacinamide"],
    ingredients: "Water, Niacinamide, Sodium DNA, Glycerin, Peptides",
    product_details: { sourceFullInci: "Water, Niacinamide, Sodium DNA, Glycerin, Peptides" },
    cautions: ["Patch test before use."],
    finish: "Clean, hydrated, non-sticky",
    volume: "30 mL",
    skin_types: ["All skin types"],
    usage_time: ["Morning", "Night"],
    seo_title: "TREAT PDRN Ampoule | Mei Pelle",
    seo_description: "A lightweight daily ampoule.",
    product_variants: [variant],
    product_pdp_content: {
      schema_version: 1,
      profile_title_tokens: null,
      routine_overlay: null,
      outcome_heading: null,
      outcome_labels: null,
      how_to_use_steps: ["Apply after CLEANSE."],
      application_steps: null,
      ingredient_cards: null,
      ingredient_story: null,
      routine_guidance: "After CLEANSE and before SEAL.",
    },
    product_media: [
      media("card_default"),
      media("card_hover", 1),
      media("cart", 2),
      media("gallery", 3),
      media("pdp_outcome", 4),
      media("pdp_application", 5),
    ],
    ...overrides,
  };
}

beforeEach(() => {
  mockedGetClient.mockReset();
});

describe("storefront catalog projections", () => {
  it("returns card-only data and filters embedded media to card roles", async () => {
    const { client, calls } = makeClient({
      data: [productRow()],
      error: null,
    });
    mockedGetClient.mockReturnValue(client);

    const [card] = await getProductCardContents();

    expect(card).toMatchObject({
      slug: "treat-03-pdrn-5-ampoule",
      displayName: "TREAT",
      cardTagline: "Bounce and glow",
    });
    expect(card).not.toHaveProperty("description");
    expect(card).not.toHaveProperty("ingredients");
    expect(card).not.toHaveProperty("media");
    expect(card.cardMedia?.role).toBe("card_default");
    expect(card.cardHoverMedia?.role).toBe("card_hover");
    expect(card).not.toHaveProperty("variants");
    expect(card).not.toHaveProperty("status");
    expect(calls.find((call) => call.method === "select")?.args[0]).not.toContain("*");
    expect(calls).toContainEqual({
      method: "in",
      args: [
        "product_media.role",
        ["card_default", "card", "card_hover", "detail", "hero", "cart"],
      ],
    });
  });

  it("gives discovery ProductCard data while preserving exclusion and order", async () => {
    const { client, calls } = makeClient({
      data: [
        productRow({ slug: "seal-05-green-collagen-cream", display_name: "SEAL", routine_sort: 30 }),
        productRow({ slug: "cleanse-01-calming-gel-cleanser", display_name: "CLEANSE", routine_sort: 10 }),
      ],
      error: null,
    });
    mockedGetClient.mockReturnValue(client);

    const cards = await getDiscoveryProductCardContents(
      "treat-03-pdrn-5-ampoule",
    );

    expect(cards.map((card) => card.displayName)).toEqual(["CLEANSE", "SEAL"]);
    expect(cards.every((card) => !("description" in card))).toBe(true);
    expect(calls).toContainEqual({
      method: "neq",
      args: ["slug", "treat-03-pdrn-5-ampoule"],
    });
    expect(calls).toContainEqual({ method: "limit", args: [3] });
  });

  it("returns a complete PDP projection with PDP-only media isolated", async () => {
    const { client, calls } = makeClient({ data: productRow(), error: null });
    mockedGetClient.mockReturnValue(client);

    const product = await getPdpProductContent(
      "treat-03-pdrn-5-ampoule",
    );

    expect(product).toMatchObject({
      displayName: "TREAT",
      description: "Approved editorial description.",
      howToUse: "Apply after CLEANSE.",
      keyIngredients: ["PDRN", "Niacinamide"],
      routineStepName: "Treat",
    });
    expect(product?.media.map((item) => item.role)).toContain("pdp_outcome");
    expect(product?.media.map((item) => item.role)).toContain("pdp_application");
    expect(product).not.toHaveProperty("variants");
    expect(product?.pdpContent?.howToUseSteps).toEqual([
      "Apply after CLEANSE.",
    ]);
    expect(calls.find((call) => call.method === "in")?.args[1]).toContain(
      "profile_editorial",
    );
  });

  it("queries exactly CLEANSE, TREAT, and SEAL for the ordered Core summaries", async () => {
    const rows = CORE_ROUTINE_PRODUCT_SLUGS.map((slug, index) =>
      productRow({
        id: `${index + 1}-id`,
        slug,
        display_name: ["CLEANSE", "TREAT", "SEAL"][index],
        routine_step_number: index + 1,
        routine_step_name: ["Cleanse", "Treat", "Seal"][index],
        routine_sort: (index + 1) * 10,
        product_media: [
          media("card_default"),
          media("core_routine_texture", 24),
        ],
      }),
    );
    const { client, calls } = makeClient({ data: rows, error: null });
    mockedGetClient.mockReturnValue(client);

    const summaries = await getCoreRoutineContentSummaries();

    expect(summaries.map((item) => item.slug)).toEqual(
      CORE_ROUTINE_PRODUCT_SLUGS,
    );
    expect(summaries.every((item) => item.textureMedia.role === "core_routine_texture")).toBe(true);
    expect(calls).toContainEqual({
      method: "in",
      args: ["slug", [...CORE_ROUTINE_PRODUCT_SLUGS]],
    });
    expect(calls).toContainEqual({
      method: "limit",
      args: [3],
    });
  });

  it("loads volatile offer availability without editorial or media fields", async () => {
    const { client, calls } = makeClient({ data: productRow(), error: null });
    mockedGetClient.mockReturnValue(client);

    await expect(
      getProductOffer("treat-03-pdrn-5-ampoule"),
    ).resolves.toMatchObject({
      slug: "treat-03-pdrn-5-ampoule",
      status: "available",
      variants: [{ id: "full-size", price: 2500 }],
    });
    const selection = String(
      calls.find((call) => call.method === "select")?.args[0],
    );
    expect(selection).toContain("product_variants");
    expect(selection).not.toContain("product_media");
    expect(selection).not.toContain("description");
  });

  it("loads metadata without product media or offers", async () => {
    const { client, calls } = makeClient({ data: productRow(), error: null });
    mockedGetClient.mockReturnValue(client);

    await expect(
      getProductMetadata("treat-03-pdrn-5-ampoule"),
    ).resolves.toEqual({
      slug: "treat-03-pdrn-5-ampoule",
      formalTitle: "TREAT 03 PDRN Ampoule",
      cardTagline: "Bounce and glow",
      seoTitle: "TREAT PDRN Ampoule | Mei Pelle",
      seoDescription: "A lightweight daily ampoule.",
    });
    const selection = String(
      calls.find((call) => call.method === "select")?.args[0],
    );
    expect(selection).not.toContain("product_media");
    expect(selection).not.toContain("product_variants");
  });
});
