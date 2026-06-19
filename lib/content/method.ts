import type { Product } from "@/lib/products";

export const METHOD_PRODUCT_SLUGS = [
  "reset-01-calming-gel-cleanser",
  "refine-02-pore-treatment-pads",
  "recode-03-pdrn-5-ampoule",
  "frame-04-pdrn-eye-cream",
  "seal-05-green-collagen-cream",
  "lift-06-pdrn-mask-system",
] as const;

export type MethodProductSlug = (typeof METHOD_PRODUCT_SLUGS)[number];

export const METHOD_PRODUCT_NUMBERS: Record<MethodProductSlug, string> = {
  "reset-01-calming-gel-cleanser": "01",
  "refine-02-pore-treatment-pads": "02",
  "recode-03-pdrn-5-ampoule": "03",
  "frame-04-pdrn-eye-cream": "04",
  "seal-05-green-collagen-cream": "05",
  "lift-06-pdrn-mask-system": "07",
};

export type MethodStepCopy = {
  what: string;
  why: string;
};

export const METHOD_STEP_COPY: Record<MethodProductSlug, MethodStepCopy> = {
  "reset-01-calming-gel-cleanser": {
    what:
      "A low-pH gel cleanser for sunscreen, oil, sweat, and surface buildup.",
    why:
      "Clean skin helps treatment layers spread evenly without relying on a stripped finish.",
  },
  "refine-02-pore-treatment-pads": {
    what: "A treatment pad for visible texture, pores, and oil-heavy areas.",
    why:
      "It clears the path between cleansing and serum while keeping frequency adjustable.",
  },
  "recode-03-pdrn-5-ampoule": {
    what:
      "A lightweight ampoule built around Sodium DNA, niacinamide, peptides, and humectants.",
    why:
      "It sits before cream so water-binding and conditioning ingredients can be spread evenly.",
  },
  "frame-04-pdrn-eye-cream": {
    what: "A targeted cream for the skin around the eyes.",
    why:
      "The eye area benefits from a smaller dose and a texture made for controlled placement.",
  },
  "seal-05-green-collagen-cream": {
    what: "A daily cream for the final moisturizing layer.",
    why:
      "It reduces water loss from the routine and leaves skin comfortable before sunscreen or sleep.",
  },
  "lift-06-pdrn-mask-system": {
    what: "A weekly sheet-mask intensive used outside the daily core routine.",
    why:
      "It gives the system a scheduled treatment moment without turning the daily routine into seven layers.",
  },
};

export const PROTECT_STEP = {
  id: "protect",
  number: "06",
  displayName: "PROTECT",
  status: "COMING SOON",
  productType: "Daily sunscreen",
  what:
    "A daily broad-spectrum sunscreen used as the final step of the morning routine.",
  why:
    "UV exposure contributes to visible photoaging and uneven pigmentation; protection preserves the work of every step before it.",
  how:
    "Apply as the final morning layer. Use broad-spectrum SPF 30 or higher and reapply according to the product label, especially after sweating, swimming, or extended exposure.",
  formulaFocus:
    "UV filters absorb, reflect, or scatter ultraviolet radiation depending on filter type. Broad-spectrum performance, film formation, dispersion, photostability, application uniformity, and cosmetic elegance all affect real-world use.",
  note: "A Mei-Pelle sunscreen is in development. No formula details are being claimed yet.",
};

export type RoutineEntry =
  | { kind: "product"; slug: MethodProductSlug; note?: string }
  | { kind: "protect"; id: "protect"; label: string; note: string };

export type RoutineGroup = {
  id: "am" | "pm" | "weekly";
  label: string;
  heading: string;
  summary: string;
  entries: RoutineEntry[];
};

export const ROUTINE_GROUPS: ReadonlyArray<RoutineGroup> = [
  {
    id: "am",
    label: "AM",
    heading: "Morning",
    summary: "Cleanse, treat, moisturize, then protect.",
    entries: [
      { kind: "product", slug: "reset-01-calming-gel-cleanser" },
      {
        kind: "product",
        slug: "refine-02-pore-treatment-pads",
        note: "Use at the supported frequency.",
      },
      { kind: "product", slug: "recode-03-pdrn-5-ampoule" },
      { kind: "product", slug: "frame-04-pdrn-eye-cream" },
      { kind: "product", slug: "seal-05-green-collagen-cream" },
      { kind: "protect", id: "protect", label: "PROTECT", note: "Coming soon." },
    ],
  },
  {
    id: "pm",
    label: "PM",
    heading: "Night",
    summary: "Cleanse, treat, and finish with moisture.",
    entries: [
      { kind: "product", slug: "reset-01-calming-gel-cleanser" },
      {
        kind: "product",
        slug: "refine-02-pore-treatment-pads",
        note: "Use when directed.",
      },
      { kind: "product", slug: "recode-03-pdrn-5-ampoule" },
      { kind: "product", slug: "frame-04-pdrn-eye-cream" },
      { kind: "product", slug: "seal-05-green-collagen-cream" },
    ],
  },
  {
    id: "weekly",
    label: "WEEKLY",
    heading: "Weekly",
    summary: "Use LIFT as the scheduled intensive.",
    entries: [
      {
        kind: "product",
        slug: "lift-06-pdrn-mask-system",
        note: "Use weekly or before an event.",
      },
    ],
  },
];

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
      "Supports a hydrated, replenished-looking finish in RECODE, FRAME, and LIFT.",
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
      "Relevant to REFINE's texture-control role without claiming permanent pore changes.",
    formulationNote:
      "Stability, pH, vehicle, and frequency influence performance more than the acid name alone.",
  },
];

export function productSectionId(product: Product): string {
  return `step-${product.displayName.toLowerCase()}`;
}

export function getMethodProductState(products: Product[]) {
  const bySlug = new Map(products.map((product) => [product.slug, product]));
  const methodProducts = METHOD_PRODUCT_SLUGS.map((slug) => bySlug.get(slug)).filter(
    (product): product is Product => Boolean(product),
  );
  const missingSlugs = METHOD_PRODUCT_SLUGS.filter((slug) => !bySlug.has(slug));

  return { methodProducts, missingSlugs };
}

export function isAvailableProduct(product: Product): boolean {
  return (
    product.status === "available" &&
    product.variants.some(
      (variant) =>
        variant.available &&
        variant.inventoryStatus !== "out_of_stock" &&
        variant.inventoryStatus !== "unavailable",
    )
  );
}

export function formulaFocus(product: Product): string[] {
  return product.keyIngredients.filter(Boolean);
}

export function methodProductNumber(product: Product): string {
  return METHOD_PRODUCT_NUMBERS[product.slug as MethodProductSlug] ?? product.routineNumber ?? "--";
}

export function methodProductNavLabel(product: Product): string {
  return `${methodProductNumber(product)} ${product.displayName}`;
}

export function routineProductsForGroup(
  entries: RoutineEntry[],
  products: Product[],
): Array<RoutineEntry & { product?: Product; number: string }> {
  const bySlug = new Map(products.map((product) => [product.slug, product]));
  return entries.map((entry) =>
    entry.kind === "product"
      ? {
          ...entry,
          product: bySlug.get(entry.slug),
          number: METHOD_PRODUCT_NUMBERS[entry.slug],
        }
      : { ...entry, number: PROTECT_STEP.number },
  );
}

function productSearchText(product: Product): string {
  return [
    product.keyIngredients.join(" "),
    product.ingredients ?? "",
    product.formulaNotes.join(" "),
  ].join(" ");
}

function productsForIngredient(
  products: Product[],
  definition: IngredientDefinition,
): Product[] {
  return products.filter((product) =>
    definition.match.some((pattern) => pattern.test(productSearchText(product))),
  );
}

export function buildIngredientIndex(products: Product[]) {
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

export function stepCopyForProduct(product: Product): MethodStepCopy | null {
  if (!METHOD_PRODUCT_SLUGS.includes(product.slug as MethodProductSlug)) return null;
  return METHOD_STEP_COPY[product.slug as MethodProductSlug];
}
