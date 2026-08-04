export const EXPECTED_SUPABASE_PROJECT_REF = "erasogmsqpgiirovubjh" as const;

export const CANONICAL_COMMERCE_PRODUCTS = [
  {
    slug: "cleanse-01-calming-gel-cleanser",
    displayName: "CLEANSE",
    routineGroup: "core",
    routineStepNumber: 1,
    routineStepName: "Cleanse",
    routineSort: 10,
  },
  {
    slug: "treat-03-pdrn-5-ampoule",
    displayName: "TREAT",
    routineGroup: "core",
    routineStepNumber: 2,
    routineStepName: "Treat",
    routineSort: 20,
  },
  {
    slug: "seal-05-green-collagen-cream",
    displayName: "SEAL",
    routineGroup: "core",
    routineStepNumber: 3,
    routineStepName: "Seal",
    routineSort: 30,
  },
  {
    slug: "refine-02-pore-treatment-pads",
    displayName: "REFINE",
    routineGroup: "beyond_core",
    routineStepNumber: null,
    routineStepName: null,
    routineSort: 110,
  },
  {
    slug: "frame-04-pdrn-eye-cream",
    displayName: "FRAME",
    routineGroup: "beyond_core",
    routineStepNumber: null,
    routineStepName: null,
    routineSort: 120,
  },
  {
    slug: "lift-06-pdrn-mask-system",
    displayName: "LIFT",
    routineGroup: "beyond_core",
    routineStepNumber: null,
    routineStepName: null,
    routineSort: 130,
  },
] as const;

export const EXPECTED_COMPLETE_THE_ROUTINE_RELATIONSHIPS =
  CANONICAL_COMMERCE_PRODUCTS.length *
  (CANONICAL_COMMERCE_PRODUCTS.length - 1);
