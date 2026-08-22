export type HomeThreePrinciple = {
  id: "mission" | "innovation" | "sustainability";
  label: string;
  titleLines: readonly string[];
  description: string;
};

export type HomeCoreDescriptionKey = "cleanse" | "treat" | "seal";

export const homeCoreDescriptions = {
  default:
    "A simple daily system for skin that looks better now—and stays smooth, even, and resilient over time.",
  items: {
    cleanse: "Start with a gentle deep-cleansing that doesn't strip or dehydrate the barrier.",
    treat: "Apply the treatment layer for glass-skin texture and to target signs of aging.",
    seal: "Finish with moisture and barrier support for lasting hydration and to lock in results.",
  },
} as const satisfies {
  default: string;
  items: Record<HomeCoreDescriptionKey, string>;
};

export type HomeBeyondCoreDescriptionKey = "refine" | "frame" | "protect" | "lift";

export const HOME_BEYOND_CORE_PRODUCT_SLUGS = [
  "balancing-prep",
  "peptide-eye-cream",
  "peptide-nourish-mask",
] as const;

export type HomeBeyondCoreProductSlug =
  (typeof HOME_BEYOND_CORE_PRODUCT_SLUGS)[number];

export const HOME_BEYOND_DESCRIPTION_KEY_BY_SLUG: Readonly<
  Record<HomeBeyondCoreProductSlug, HomeBeyondCoreDescriptionKey>
> = {
  "balancing-prep": "refine",
  "peptide-eye-cream": "frame",
  "peptide-nourish-mask": "lift",
};

export const homeBeyondCoreDescriptions = {
  default: "For when your skin has a high baseline. Add what you need.",
  items: {
    refine: "add a daily balancing prep after cleansing",
    frame: "support the eye area without adding a full routine",
    protect: "finish the morning with broad-spectrum SPF",
    lift: "add a weekly intensive when the system is repeatable",
  },
} as const satisfies {
  default: string;
  items: Record<HomeBeyondCoreDescriptionKey, string>;
};

export const homeThreePrinciples = [
  {
    id: "mission",
    label: "mission",
    titleLines: ["Simple is", "not basic."],
    description:
      "Restore, protect, and nurture the skin you have now for lasting results that reveal themselves over time.",
  },
  {
    id: "innovation",
    label: "innovation",
    titleLines: ["Formulated", "for longevity."],
    description:
      "Developed with award-winning dermatologists, chemists, and industry leaders.",
  },
  {
    id: "sustainability",
    label: "sustainability",
    titleLines: ["Mindful skincare,", "built in."],
    description:
      "From consciously-sourced ingredients to packaging made with post-consumer recycled materials.",
  },
] as const satisfies readonly HomeThreePrinciple[];
