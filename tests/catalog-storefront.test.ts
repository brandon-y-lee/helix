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
  getProductSlugResolution,
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
  sort_order: 0,
};

function media(role: string, sortOrder = 0) {
  return {
    media_type: "image",
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
  const row = {
    id: "product-id",
    slug: "treat-03-pdrn-5-ampoule",
    display_name: "TREAT",
    routine_group: "core",
    system_step_name: "TREAT",
    routine_sort: 20,
    product_type: "Ampoule / Serum",
    currency: "USD",
    sort_order: 20,
    created_at: "2026-06-14T00:00:00.000Z",
    editorial_description: "Approved editorial description.",
    benefits: ["Hydrates", "Smooths"],
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
    product_family_memberships: null,
    ...overrides,
  };
  const step = {
    CLEANSE: { name: "CLEANSE", position: 1, routine_group: "core" },
    REFINE: { name: "REFINE", position: 2, routine_group: "beyond_core" },
    TREAT: { name: "TREAT", position: 3, routine_group: "core" },
    SEAL: { name: "SEAL", position: 5, routine_group: "core" },
  }[row.system_step_name as "CLEANSE" | "REFINE" | "TREAT" | "SEAL"];
  return {
    ...row,
    system_steps: overrides.system_steps ?? step,
  };
}

beforeEach(() => {
  mockedGetClient.mockReset();
});

describe("storefront catalog projections", () => {
  it("maps the public slug resolver result without following a route chain in application code", async () => {
    const calls: Call[] = [];
    mockedGetClient.mockReturnValue({
      rpc: (...args: unknown[]) => {
        calls.push({ method: "rpc", args });
        return Promise.resolve({
          data: [
            {
              source_slug: "legacy-product",
              target_slug: "canonical-product",
              target_product_id: "product-id",
              route_kind: "replacement",
            },
          ],
          error: null,
        });
      },
    });

    await expect(getProductSlugResolution("legacy-product")).resolves.toEqual({
      sourceSlug: "legacy-product",
      targetSlug: "canonical-product",
      targetProductId: "product-id",
      routeKind: "replacement",
    });
    expect(calls).toContainEqual({
      method: "rpc",
      args: ["resolve_product_slug", { p_source_slug: "legacy-product" }],
    });
  });

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
      productType: "Ampoule / Serum",
      systemStepName: "TREAT",
      systemStepPosition: 3,
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

  it("collapses Product Families to their entry Product in card projections", async () => {
    const familyId = "123e4567-e89b-42d3-a456-426614174143";
    const { client } = makeClient({
      data: [
        productRow({
          id: "balancing-id",
          slug: "balancing-prep",
          product_family_memberships: [{ family_id: familyId, is_entry: true }],
        }),
        productRow({
          id: "polishing-id",
          slug: "polishing-prep",
          product_family_memberships: [{ family_id: familyId, is_entry: false }],
        }),
        productRow({
          id: "standalone-id",
          slug: "standalone-product",
        }),
      ],
      error: null,
    });
    mockedGetClient.mockReturnValue(client);

    const cards = await getProductCardContents();

    expect(cards.map((card) => card.slug)).toEqual([
      "balancing-prep",
      "standalone-product",
    ]);
    expect(cards[0].productFamily).toEqual({ familyId, isEntry: true });
    expect(cards[1].productFamily).toBeNull();
  });

  it("gives discovery ProductCard data while preserving exclusion and order", async () => {
    const { client, calls } = makeClient({
      data: [
        productRow({ slug: "seal-05-green-collagen-cream", display_name: "SEAL", system_step_name: "SEAL", routine_sort: 30 }),
        productRow({ slug: "cleanse-01-calming-gel-cleanser", display_name: "CLEANSE", system_step_name: "CLEANSE", routine_sort: 10 }),
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
    expect(calls).not.toContainEqual({ method: "limit", args: [3] });
  });

  it("applies the discovery limit after non-entry family siblings are collapsed", async () => {
    const { client } = makeClient({
      data: [
        productRow({
          slug: "polishing-prep",
          display_name: "Polishing Prep",
          product_family_memberships: [{ family_id: "family-1", is_entry: false }],
        }),
        productRow({ slug: "biotic-reset", display_name: "Biotic Reset", routine_sort: 10 }),
        productRow({ slug: "peptide-bounce", display_name: "Peptide Bounce", routine_sort: 20 }),
        productRow({ slug: "ceramide-cushion", display_name: "Ceramide Cushion", routine_sort: 30 }),
      ],
      error: null,
    });
    mockedGetClient.mockReturnValue(client);

    const cards = await getDiscoveryProductCardContents("balancing-prep", 3);

    expect(cards.map((card) => card.slug)).toEqual([
      "biotic-reset",
      "peptide-bounce",
      "ceramide-cushion",
    ]);
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
      systemStepName: "TREAT",
      systemStepPosition: 3,
    });
    expect(product?.media.map((item) => item.role)).toContain("pdp_outcome");
    expect(product?.media.map((item) => item.role)).toContain("pdp_application");
    expect(product?.media.map((item) => item.role)).toContain("gallery");
    expect(product?.cardMedia?.role).toBe("card_default");
    expect(product?.cartMedia?.role).toBe("cart");
    expect(product).not.toHaveProperty("variants");
    expect(product?.pdpContent?.howToUseSteps).toEqual([
      "Apply after CLEANSE.",
    ]);
    expect(calls.find((call) => call.method === "in")?.args[1]).toContain(
      "profile_editorial",
    );
    expect(calls.find((call) => call.method === "in")?.args[1]).not.toContain(
      "core_routine_editorial",
    );
  });

  it("projects the complete ordered Product Family on every member PDP", async () => {
    const familyId = "123e4567-e89b-42d3-a456-426614174143";
    const members = [
      ["balancing-id", "balancing-prep", "Balancing Prep", "General", "available", true],
      ["polishing-id", "polishing-prep", "Polishing Prep", "Exfoliating", "waitlist", false],
      ["beaming-id", "beaming-prep", "Beaming Prep", "Brightening", "waitlist", false],
      ["chilling-id", "chilling-prep", "Chilling Prep", "Cooling", "waitlist", false],
    ].map(([id, slug, displayName, optionLabel, status, isEntry], index) => ({
      product_id: id,
      option_label: optionLabel,
      sort_order: index,
      is_entry: isEntry,
      products: {
        id,
        slug,
        display_name: displayName,
        status,
        catalog_status: "active",
      },
    }));
    const { client } = makeClient({
      data: productRow({
        id: "beaming-id",
        slug: "beaming-prep",
        display_name: "Beaming Prep",
        product_type: "Niacinamide brightening pads",
        routine_group: "beyond_core",
        system_step_name: "REFINE",
        product_family_memberships: [
          {
            family_id: familyId,
            is_entry: false,
            product_families: {
              id: familyId,
              slug: "refine",
              display_name: "REFINE",
              system_step_name: "REFINE",
              product_family_memberships: members,
            },
          },
        ],
      }),
      error: null,
    });
    mockedGetClient.mockReturnValue(client);

    const product = await getPdpProductContent("beaming-prep");

    expect(product?.productFamily).toMatchObject({
      id: familyId,
      slug: "refine",
      displayName: "REFINE",
      systemStepName: "REFINE",
    });
    expect(product?.productFamily?.memberships).toEqual([
      expect.objectContaining({ optionLabel: "General", slug: "balancing-prep", isEntry: true, isCurrent: false }),
      expect.objectContaining({ optionLabel: "Exfoliating", slug: "polishing-prep", status: "waitlist", isCurrent: false }),
      expect.objectContaining({ optionLabel: "Brightening", slug: "beaming-prep", status: "waitlist", isCurrent: true }),
      expect.objectContaining({ optionLabel: "Cooling", slug: "chilling-prep", status: "waitlist", isCurrent: false }),
    ]);
  });

  it("queries exactly CLEANSE, TREAT, and SEAL for the ordered Core summaries", async () => {
    const rows = CORE_ROUTINE_PRODUCT_SLUGS.map((slug, index) =>
      productRow({
        id: `${index + 1}-id`,
        slug,
        display_name: ["CLEANSE", "TREAT", "SEAL"][index],
        system_step_name: ["CLEANSE", "TREAT", "SEAL"][index],
        routine_sort: (index + 1) * 10,
        product_media: [
          media("card_default"),
          media("core_routine_texture", 24),
          ...(index === 1 ? [media("core_routine_editorial", 1)] : []),
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
    expect(summaries.map((item) => item.editorialMedia?.role ?? null)).toEqual([
      null,
      "core_routine_editorial",
      null,
    ]);
    expect(calls).toContainEqual({
      method: "in",
      args: ["slug", [...CORE_ROUTINE_PRODUCT_SLUGS]],
    });
    expect(calls).toContainEqual({
      method: "limit",
      args: [3],
    });
    expect(calls).toContainEqual({
      method: "in",
      args: [
        "product_media.role",
        [
          "card_default",
          "card",
          "detail",
          "hero",
          "cart",
          "core_routine_texture",
          "core_routine_editorial",
        ],
      ],
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
      displayName: "TREAT",
      productType: "Ampoule / Serum",
      editorialDescription: "Approved editorial description.",
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
