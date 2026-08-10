import type { ProductEditorDocumentV4 } from "@/lib/admin/catalog/types";

export type FrameLiftStep = "FRAME" | "LIFT";

type PublicationDefinition = Readonly<{
  productId: string;
  sourceSlug: string;
  sourceTitle: string;
  sourceUrl: string;
  slug: string;
  displayName: string;
  productType: string;
}>;

export const FRAME_LIFT_PUBLICATIONS: Record<
  FrameLiftStep,
  PublicationDefinition
> = {
  FRAME: {
    productId: "9f0980d4-ffea-4a7d-a441-09f871dd2e74",
    sourceSlug: "frame-04-pdrn-eye-cream",
    sourceTitle: "PDRN+ 2% Flat Eyebag Cream",
    sourceUrl:
      "https://www.leaderscosmeticsusa.com/products/leaders-pdrn-2-flat-eyebag-cream",
    slug: "peptide-eye-cream",
    displayName: "Peptide Eye Cream",
    productType: "PDRN eye cream",
  },
  LIFT: {
    productId: "64c33baf-70f8-487f-9e83-05d43e21e832",
    sourceSlug: "lift-06-pdrn-mask-system",
    sourceTitle: "PDRN 0.5% Lifting Mask",
    sourceUrl:
      "https://www.leaderscosmeticsusa.com/products/leaders-pdrn-0-5-lifting-mask",
    slug: "peptide-nourish-mask",
    displayName: "Peptide Nourish Mask",
    productType: "PDRN sheet mask",
  },
};

function normalizedIngredients(value: string): string {
  return value.replace(/\s*\(5,?000\s*ppm\)\s*/i, "").trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sourceFormulaInci(
  document: ProductEditorDocumentV4,
  step: FrameLiftStep,
): string {
  const source = document.productSource;
  const rawSource = source?.raw_source;
  const catalogProduct = isRecord(rawSource)
    ? rawSource.catalogProduct
    : null;
  const rawInci = isRecord(catalogProduct)
    ? catalogProduct.ingredients
    : null;
  if (
    typeof rawInci !== "string" ||
    !/^[a-f\d]{64}$/i.test(source?.source_content_hash ?? "") ||
    !source?.source_inspected_at
  ) {
    throw new Error(
      `${step} governed supplier Formula evidence is incomplete.`,
    );
  }
  return rawInci;
}

function assertSourceEvidence(
  document: ProductEditorDocumentV4,
  step: FrameLiftStep,
): void {
  const definition = FRAME_LIFT_PUBLICATIONS[step];
  const source = document.productSource;
  if (
    document.productId !== definition.productId ||
    document.product.id !== definition.productId ||
    document.product.system_step_name !== step ||
    ![definition.sourceSlug, definition.slug].includes(document.product.slug) ||
    source?.product_id !== definition.productId ||
    source.supplier_title !== definition.sourceTitle ||
    source.supplier_url !== definition.sourceUrl
  ) {
    throw new Error(
      `${step} supplier evidence does not match the approved Product.`,
    );
  }

  const sourceInci = sourceFormulaInci(document, step);
  const publicInci =
    step === "LIFT" ? normalizedIngredients(sourceInci) : sourceInci;
  const expectedCurrentInci =
    document.product.slug === definition.sourceSlug ? sourceInci : publicInci;
  if (document.product.ingredients !== expectedCurrentInci) {
    throw new Error(
      `${step} Complete INCI does not match the governed supplier Formula evidence.`,
    );
  }
  const required =
    step === "FRAME"
      ? [
          "Sodium DNA",
          "Niacinamide",
          "Panthenol",
          "Allantoin",
          "Acetyl Tetrapeptide-5",
          "Acetyl Hexapeptide-8",
          "Copper Tripeptide-1",
          "Palmitoyl Pentapeptide-4",
        ]
      : [
          "Sodium DNA",
          "Hydrolyzed Collagen",
          "Niacinamide",
          "Glycerin",
          "Allantoin",
          "Adenosine",
        ];
  if (!required.every((ingredient) => sourceInci.includes(ingredient))) {
    throw new Error(`${step} Formula evidence does not support publication.`);
  }
}

function frameProduct(
  document: ProductEditorDocumentV4,
): ProductEditorDocumentV4["product"] {
  return {
    ...document.product,
    display_name: "Peptide Eye Cream",
    product_type: "PDRN eye cream",
    slug: "peptide-eye-cream",
    system_step_name: "FRAME",
    routine_group: "beyond_core",
    status: "coming_soon",
    catalog_status: "active",
    editorial_description:
      "Soft-focus care for the eye area, without weighing down the rest of your routine. This cushiony PDRN eye cream pairs Sodium DNA with niacinamide, panthenol, allantoin, and separately declared cosmetic peptides to condition delicate-looking skin. It settles with a smooth, rested-looking finish and helps the eye area appear supple and refreshed with consistent use.",
    editorial_how_to_use:
      "After serum and before moisturizer, tap a rice-grain amount around each eye with your ring finger. Keep away from the lash line and direct eye contact.",
    benefits: ["SOFTEN", "REST", "SMOOTH"],
    made_for: "A smoother, more rested-looking eye area",
    good_for: "Dry-looking texture and a tired-looking finish",
    texture: "Cushiony cream-balm",
    finish: "Soft, conditioned, non-greasy",
    skin_types: [],
    key_ingredients: [
      "Sodium DNA",
      "Acetyl Tetrapeptide-5",
      "Acetyl Hexapeptide-8",
      "Copper Tripeptide-1",
    ],
    cautions: [
      "For external use only.",
      "Avoid direct eye contact and the lash line.",
      "Discontinue use if irritation occurs.",
    ],
    usage_time: ["Morning", "Evening"],
    formula_notes: [
      "Sodium DNA (PDRN) and the declared peptide ingredients are separate Formula facts; PDRN is not a peptide.",
      "The current supplier INCI does not quantify Sodium DNA.",
      "Peptide support comes from separately declared acetyl, copper, and palmitoyl peptides.",
    ],
    search_keywords: [
      "PDRN eye cream",
      "peptide eye cream",
      "eye area cream",
      "Sodium DNA eye cream",
    ],
    seo_title: "Peptide Eye Cream — PDRN eye cream | Mei Pelle",
    seo_description:
      "A cushiony PDRN eye cream with Sodium DNA and separately declared cosmetic peptides for a smooth, supple, rested-looking finish.",
  };
}

function framePdp(
  document: ProductEditorDocumentV4,
): NonNullable<ProductEditorDocumentV4["productPdpContent"]> {
  const current = document.productPdpContent;
  if (!current) throw new Error("FRAME PDP content is required for publication.");
  return {
    ...current,
    profile_title_tokens: [
      { text: "A smoother, " },
      { text: "RESTED", emphasis: true },
      { text: " look" },
    ],
    routine_overlay: "Beyond the Core · FRAME",
    outcome_heading: "Cushioned care for the eye area",
    outcome_labels: ["SOFTEN", "REST", "SMOOTH"],
    how_to_use_steps: [
      "Use after serum and before moisturizer.",
      "Tap a rice-grain amount around each eye with your ring finger.",
      "Keep away from the lash line and direct eye contact.",
    ],
    application_steps: ["Dispense", "Tap", "Settle"],
    ingredient_cards: [
      {
        name: "Sodium DNA",
        label: "Condition",
        copy: "PDRN support for a supple, conditioned-looking eye area.",
      },
      {
        name: "Declared peptide blend",
        label: "Smooth",
        copy: "Separately declared acetyl, copper, and palmitoyl peptides support a smooth-looking finish.",
      },
      {
        name: "Panthenol + Allantoin",
        label: "Comfort",
        copy: "Comforting support for delicate-looking skin.",
      },
    ],
    ingredient_story: {
      heading: "PDRN and peptides, clearly separated",
      intro:
        "Sodium DNA and the Formula's declared cosmetic peptides play distinct roles in this cushiony eye-area cream.",
      highlights: [
        {
          name: "Sodium DNA",
          description: "Helps support a supple, conditioned-looking finish.",
        },
        {
          name: "Acetyl Tetrapeptide-5",
          description: "One of the separately declared cosmetic peptides in the Formula.",
        },
      ],
      supportingIngredients: "Niacinamide, panthenol, and allantoin",
    },
    routine_guidance:
      "Use after treatment serum and before moisturizer, morning or evening.",
  };
}

function liftProduct(
  document: ProductEditorDocumentV4,
): ProductEditorDocumentV4["product"] {
  return {
    ...document.product,
    display_name: "Peptide Nourish Mask",
    product_type: "PDRN sheet mask",
    slug: "peptide-nourish-mask",
    system_step_name: "LIFT",
    routine_group: "beyond_core",
    status: "coming_soon",
    catalog_status: "active",
    editorial_description:
      "A close-fitting soak for skin that needs a plush reset. This serum-rich PDRN sheet mask pairs Sodium DNA with niacinamide, glycerin, allantoin, adenosine, and separately declared Hydrolyzed Collagen. The sheet leaves skin feeling saturated and supple with a fresh, cushioned look after use; a steady weekly cadence supports a smoother, rested-looking finish over time.",
    editorial_how_to_use:
      "Unfold and smooth over clean, dry skin after toner. Leave on for 15–20 minutes, remove, then press in the remaining serum. Use once weekly or when skin needs a plush reset.",
    benefits: ["SATURATE", "SUPPLE", "RESET"],
    made_for: "A plush weekly moisture reset",
    good_for: "Dry-looking skin and a flat, tired-looking finish",
    texture: "Serum-saturated sheet",
    finish: "Fresh, cushioned, supple",
    skin_types: [],
    key_ingredients: [
      "Sodium DNA",
      "Hydrolyzed Collagen",
      "Niacinamide",
      "Glycerin",
    ],
    ingredients: normalizedIngredients(sourceFormulaInci(document, "LIFT")),
    cautions: [
      "For external use only.",
      "Single-use sheet; do not reuse.",
      "Discontinue use if irritation occurs.",
    ],
    usage_time: ["Weekly"],
    formula_notes: [
      "Hydrolyzed Collagen is separately declared in the supplier Formula INCI and is the governed peptide basis for the Product Display Name.",
      "Sodium DNA (PDRN) is not a peptide and does not support the peptide naming.",
      "Product Education remains cosmetic and appearance-led.",
    ],
    search_keywords: [
      "PDRN sheet mask",
      "peptide sheet mask",
      "nourishing face mask",
      "Hydrolyzed Collagen mask",
    ],
    seo_title: "Peptide Nourish Mask — PDRN sheet mask | Mei Pelle",
    seo_description:
      "A serum-rich PDRN sheet mask with Sodium DNA and separately declared Hydrolyzed Collagen for a fresh, supple, cushioned look.",
  };
}

function liftPdp(
  document: ProductEditorDocumentV4,
): NonNullable<ProductEditorDocumentV4["productPdpContent"]> {
  const current = document.productPdpContent;
  if (!current) throw new Error("LIFT PDP content is required for publication.");
  return {
    ...current,
    profile_title_tokens: [
      { text: "A plush weekly " },
      { text: "RESET", emphasis: true },
    ],
    routine_overlay: "Beyond the Core · LIFT",
    outcome_heading: "A serum-rich moisture reset",
    outcome_labels: ["SATURATE", "SUPPLE", "RESET"],
    how_to_use_steps: [
      "Unfold and smooth over clean, dry skin after toner.",
      "Leave on for 15–20 minutes, then remove.",
      "Press in the remaining serum and follow with moisturizer.",
    ],
    application_steps: ["Unfold", "Rest", "Press"],
    ingredient_cards: [
      {
        name: "Sodium DNA",
        label: "Condition",
        copy: "PDRN support for a supple, conditioned-looking finish.",
      },
      {
        name: "Hydrolyzed Collagen",
        label: "Nourish",
        copy: "The separately declared peptide-name basis in this serum-rich Formula.",
      },
      {
        name: "Niacinamide + Glycerin",
        label: "Saturate",
        copy: "Moisture-supporting ingredients for a fresh, cushioned look.",
      },
    ],
    ingredient_story: {
      heading: "A considered weekly soak",
      intro:
        "Sodium DNA and separately declared Hydrolyzed Collagen sit alongside familiar moisture-supporting ingredients.",
      highlights: [
        {
          name: "Hydrolyzed Collagen",
          description: "Separately declared in the Formula and distinct from PDRN.",
        },
        {
          name: "Sodium DNA",
          description: "Supports a supple, conditioned-looking finish.",
        },
      ],
      supportingIngredients: "Niacinamide, glycerin, allantoin, and adenosine",
    },
    routine_guidance:
      "Use once weekly after cleansing and toner, then follow with moisturizer.",
  };
}

function publicationProjection(document: ProductEditorDocumentV4): unknown {
  return {
    product: document.product,
    productPdpContent: document.productPdpContent,
    variants: document.variants,
    media: document.media,
    relationships: document.relationships,
    productSource: document.productSource,
  };
}

export function buildFrameLiftPublicationDocument(
  document: ProductEditorDocumentV4,
  step: FrameLiftStep,
): ProductEditorDocumentV4 {
  assertSourceEvidence(document, step);
  const isFrame = step === "FRAME";
  const source = document.productSource!;
  return {
    ...document,
    product: isFrame ? frameProduct(document) : liftProduct(document),
    productPdpContent: isFrame ? framePdp(document) : liftPdp(document),
    variants: [],
    productSource: {
      ...source,
      formulation_version_notes: isFrame
        ? "The supplier Formula INCI declares Sodium DNA and multiple cosmetic peptides as separate ingredients. PDRN is not a peptide. No 2% concentration claim is approved because the Formula INCI does not quantify Sodium DNA."
        : "The supplier Formula INCI declares Hydrolyzed Collagen separately from Sodium DNA. Hydrolyzed Collagen is the governed basis for the locked Peptide Nourish Mask name; PDRN is not a peptide. No lifting claim is approved.",
    },
  };
}

export function isFrameLiftPublicationCurrent(
  document: ProductEditorDocumentV4,
  step: FrameLiftStep,
): boolean {
  try {
    const expected = buildFrameLiftPublicationDocument(document, step);
    return (
      JSON.stringify(publicationProjection(document)) ===
      JSON.stringify(publicationProjection(expected))
    );
  } catch {
    return false;
  }
}
