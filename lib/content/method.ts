import type { ProductCard } from "@/lib/catalog/models";
import type { SystemStepName } from "@/lib/catalog/system-steps";
import type { Product } from "@/lib/products";

export const CORE_SYSTEM_STEP_NAMES = [
  "CLEANSE",
  "TREAT",
  "SEAL",
] as const satisfies readonly SystemStepName[];

export const BEYOND_SYSTEM_STEP_NAMES = [
  "REFINE",
  "FRAME",
  "PROTECT",
  "LIFT",
] as const satisfies readonly SystemStepName[];

type CoreSystemStepName = (typeof CORE_SYSTEM_STEP_NAMES)[number];
type BeyondSystemStepName = (typeof BEYOND_SYSTEM_STEP_NAMES)[number];

const BEYOND_STEP_PLACEMENT: Record<BeyondSystemStepName, string> = {
  REFINE: "After cleansing",
  FRAME: "After treatment",
  PROTECT: "Final morning step",
  LIFT: "Weekly intensive",
};

export const SYSTEM_STEP_ANCHORS: Record<SystemStepName, string> = {
  CLEANSE: "system-cleanse",
  REFINE: "system-refine",
  TREAT: "system-treat",
  FRAME: "system-frame",
  SEAL: "system-seal",
  PROTECT: "system-protect",
  LIFT: "system-lift",
};

export const SYSTEM_STEP_LEGACY_ANCHORS: Record<
  SystemStepName,
  readonly string[]
> = {
  CLEANSE: ["step-cleanse", "step-reset", "method-cleanse", "method-reset"],
  REFINE: ["step-refine", "method-refine"],
  TREAT: ["step-treat", "step-recode", "method-treat", "method-recode"],
  FRAME: ["step-frame", "method-frame"],
  SEAL: ["step-seal", "method-seal"],
  PROTECT: ["step-protect", "method-protect"],
  LIFT: ["step-lift", "method-lift"],
};

export type CoreSystemProductEntry = {
  stepName: CoreSystemStepName;
  displayNumber: string;
  anchorId: string;
  legacyAnchorIds: readonly string[];
  product: Product;
};

export type BeyondSystemProductEntry = {
  stepName: BeyondSystemStepName;
  placement: string;
  anchorId: string;
  legacyAnchorIds: readonly string[];
  product: Product;
};

export type SystemProductGroups = {
  core: CoreSystemProductEntry[];
  beyond: BeyondSystemProductEntry[];
  missingCoreSteps: CoreSystemStepName[];
  missingBeyondSteps: BeyondSystemStepName[];
};

function compareSystemProducts(a: Product, b: Product) {
  return (
    a.routineSort - b.routineSort ||
    a.sortOrder - b.sortOrder ||
    a.slug.localeCompare(b.slug)
  );
}

export function groupSystemProducts(
  products: readonly Product[],
  collectionEntries: readonly Pick<ProductCard, "id">[],
): SystemProductGroups {
  const collectionEntryIds = new Set(collectionEntries.map((entry) => entry.id));
  const eligibleProducts = products.filter(
    (product) =>
      collectionEntryIds.has(product.id) &&
      product.catalogStatus === "active" &&
      product.systemStepName !== null,
  );

  function productForStep(
    stepName: SystemStepName,
    routineGroup: Product["routineGroup"],
  ) {
    return eligibleProducts
      .filter(
        (product) =>
          product.systemStepName === stepName &&
          product.routineGroup === routineGroup,
      )
      .sort(compareSystemProducts)[0];
  }

  const core = CORE_SYSTEM_STEP_NAMES.flatMap((stepName, index) => {
    const product = productForStep(stepName, "core");
    return product
      ? [
          {
            stepName,
            displayNumber: String(index + 1).padStart(2, "0"),
            anchorId: SYSTEM_STEP_ANCHORS[stepName],
            legacyAnchorIds: SYSTEM_STEP_LEGACY_ANCHORS[stepName],
            product,
          },
        ]
      : [];
  });
  const beyond = BEYOND_SYSTEM_STEP_NAMES.flatMap((stepName) => {
    const product = productForStep(stepName, "beyond_core");
    return product
      ? [
          {
            stepName,
            placement: BEYOND_STEP_PLACEMENT[stepName],
            anchorId: SYSTEM_STEP_ANCHORS[stepName],
            legacyAnchorIds: SYSTEM_STEP_LEGACY_ANCHORS[stepName],
            product,
          },
        ]
      : [];
  });

  return {
    core,
    beyond,
    missingCoreSteps: CORE_SYSTEM_STEP_NAMES.filter(
      (stepName) => !core.some((entry) => entry.stepName === stepName),
    ),
    missingBeyondSteps: BEYOND_SYSTEM_STEP_NAMES.filter(
      (stepName) => !beyond.some((entry) => entry.stepName === stepName),
    ),
  };
}

export type IngredientIndexCard = {
  id: string;
  name: string;
  identity: string;
  ingredientClass: string;
  mechanism: string;
  skinRelevance: string;
  formulationNote?: string;
  products: Array<{
    slug: string;
    displayName: string;
  }>;
};

export type IngredientIndexSource = {
  slug: string;
  displayName: string;
  keyIngredients: string[];
  ingredients: string | null;
  formulaNotes: string[];
};

export function ingredientAnchorId(cardId: string) {
  return `system-ingredient-${cardId}`;
}

type IngredientDefinition = {
  id: string;
  name: string;
  identity: string;
  ingredientClass: string;
  match: RegExp[];
  mechanism: string;
  skinRelevance: string;
  formulationNote?: string;
};

const INGREDIENT_DEFINITIONS: IngredientDefinition[] = [
  {
    id: "pdrn",
    name: "PDRN / Sodium DNA",
    identity:
      "Polydeoxyribonucleotide, a mixture of purified DNA fragments listed in the catalog as Sodium DNA.",
    ingredientClass: "Polynucleotide",
    match: [/pdrn/i, /sodium dna/i],
    mechanism:
      "Used in topical cosmetics as a conditioning ingredient within water-based treatment formulas.",
    skinRelevance:
      "Supports a hydrated, replenished-looking finish in TREAT, FRAME, and LIFT.",
    formulationNote:
      "Evidence from injectable or medical use is not treated as direct proof for a topical cosmetic formula.",
  },
  {
    id: "peptides",
    name: "Peptides",
    identity:
      "Short amino-acid sequences with behavior determined by sequence, stability, concentration, and delivery.",
    ingredientClass: "Peptide",
    match: [/peptide/i, /tripeptide/i, /hexapeptide/i, /tetrapeptide/i, /pentapeptide/i],
    mechanism:
      "Cosmetic peptides may function as signaling, carrier, enzyme-modulating, or conditioning ingredients depending on the exact molecule.",
    skinRelevance:
      "Included where the catalog formula uses peptide ingredients for a smoother, conditioned-looking surface.",
    formulationNote:
      "Evidence for one peptide complex cannot be generalized to every peptide ingredient.",
  },
  {
    id: "niacinamide",
    name: "Niacinamide",
    identity: "The amide form of vitamin B3.",
    ingredientClass: "Vitamin derivative",
    match: [/niacinamide/i],
    mechanism:
      "Participates in cellular NAD/NADP metabolism and is used in cosmetics for barrier, tone, and oil-balance appearance support.",
    skinRelevance:
      "Supports formulas where the system needs broad cosmetic conditioning without acne-treatment claims.",
  },
  {
    id: "hyaluronic-acid",
    name: "Hyaluronic Acid / Sodium Hyaluronate",
    identity:
      "A glycosaminoglycan used in topical formulas primarily as a humectant.",
    ingredientClass: "Humectant",
    match: [/hyaluronic/i, /hyaluronate/i],
    mechanism:
      "Binds water within the formula and at the skin surface, improving short-term hydration feel.",
    skinRelevance:
      "Used in hydration-focused steps for comfort and a smoother surface appearance.",
    formulationNote:
      "Molecular weight can influence film formation, sensory profile, and skin-surface behavior.",
  },
  {
    id: "glycerin",
    name: "Glycerin",
    identity: "A small polyol humectant.",
    ingredientClass: "Humectant",
    match: [/glycerin/i],
    mechanism:
      "Attracts and retains water in the stratum corneum and supports corneocyte hydration.",
    skinRelevance:
      "Appears in formulas built for hydration, comfort, and flexible layering.",
  },
  {
    id: "panthenol",
    name: "Panthenol",
    identity: "Provitamin B5.",
    ingredientClass: "Skin-conditioning humectant",
    match: [/panthenol/i],
    mechanism:
      "Functions as a humectant and skin-conditioning agent, supporting hydration and comfort.",
    skinRelevance:
      "Useful in steps where the routine needs a calmer feel after cleansing or treatment.",
  },
  {
    id: "cica-centella",
    name: "Cica / Centella",
    identity:
      "A broad label for Centella asiatica extracts or related constituents when present in the formula.",
    ingredientClass: "Botanical extract family",
    match: [/cica/i, /centella/i],
    mechanism:
      "Contributes botanical conditioning and comfort-oriented sensory support depending on the extract.",
    skinRelevance:
      "Supports cleanser and comfort-oriented steps where a calmer feel matters.",
    formulationNote:
      "Cica is not one chemically uniform ingredient; the exact extract or constituent matters.",
  },
  {
    id: "collagen-source",
    name: "Collagen-source ingredients",
    identity:
      "Catalog collagen language covering green collagen, hydrolyzed collagen, or collagen-associated support.",
    ingredientClass: "Film-forming or conditioning ingredient family",
    match: [/collagen/i],
    mechanism:
      "Used for surface feel, film formation, hydration context, or texture support depending on the material.",
    skinRelevance:
      "Supports formulas positioned around smoothness, comfort, and a conditioned finish.",
    formulationNote:
      "Topical collagen language does not mean the ingredient becomes human dermal collagen.",
  },
  {
    id: "exfoliating-acids",
    name: "Exfoliating acids",
    identity:
      "Acid exfoliant family including LHA, PHA, AHA, or salicylic-acid references where present.",
    ingredientClass: "Exfoliant",
    match: [/\blha\b/i, /\bpha\b/i, /\baha\b/i, /salicylic/i],
    mechanism:
      "Supports desquamation or surface refinement depending on acid type, pH, vehicle, and use frequency.",
    skinRelevance:
      "Relevant to exfoliating REFINE options only when the published formula supports the acid identity.",
    formulationNote:
      "Stability, pH, vehicle, and frequency influence performance more than the acid name alone.",
  },
];

function productSearchText(product: IngredientIndexSource): string {
  return [
    product.keyIngredients.join(" "),
    product.ingredients ?? "",
    product.formulaNotes.join(" "),
  ].join(" ");
}

function productsForIngredient(
  products: IngredientIndexSource[],
  definition: IngredientDefinition,
): IngredientIndexSource[] {
  return products.filter((product) =>
    definition.match.some((pattern) => pattern.test(productSearchText(product))),
  );
}

export function buildIngredientIndex(
  products: IngredientIndexSource[],
): IngredientIndexCard[] {
  return INGREDIENT_DEFINITIONS.map((definition) => {
    const containingProducts = productsForIngredient(products, definition);
    if (containingProducts.length === 0) return null;
    return {
      id: definition.id,
      name: definition.name,
      identity: definition.identity,
      ingredientClass: definition.ingredientClass,
      mechanism: definition.mechanism,
      skinRelevance: definition.skinRelevance,
      formulationNote: definition.formulationNote,
      products: containingProducts.map((product) => ({
        slug: product.slug,
        displayName: product.displayName,
      })),
    };
  }).filter((card): card is NonNullable<typeof card> => Boolean(card));
}
