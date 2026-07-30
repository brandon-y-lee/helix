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

// Original development-only seed catalog superseded by the Leaders-backed,
// current Mei Pelle catalog. These are cleanup candidates only when archived
// and unreferenced by protected historical/customer tables.
export const LEGACY_SEED_PRODUCT_SLUGS = [
  "groundwork-gel-cleanser",
  "meridian-daily-moisturizer",
  "northpoint-renewal-serum",
  "summit-mineral-spf",
  "lowtide-recovery-cream",
  "clearview-eye-concentrate",
] as const;

export const PROTECTED_CLEANUP_REFERENCE_TABLES = [
  "public.cart_items",
  "public.order_items",
] as const;

export const PROTECTED_DATABASE_TABLES = [
  "auth.users",
  "public.profiles",
  "public.carts",
  "public.cart_items",
  "public.orders",
  "public.order_items",
  "public.payment_attempts",
  "public.stripe_customers",
  "public.stripe_webhook_events",
  "public.loyalty_accounts",
  "public.loyalty_ledger_entries",
  "public.loyalty_redemptions",
  "public.referral_codes",
  "public.referral_attributions",
  "public.referral_rewards",
  "public.private_feedback",
  "public.trustpilot_invitation_attempts",
] as const;

export const EXPECTED_COMPLETE_THE_ROUTINE_RELATIONSHIPS =
  CANONICAL_COMMERCE_PRODUCTS.length * (CANONICAL_COMMERCE_PRODUCTS.length - 1);

export const CATALOG_CLEANUP_RUN_KEY =
  "20260714_dedupe_legacy_seed_catalog_products" as const;
