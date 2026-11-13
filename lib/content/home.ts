import {
  HOME_INNOVATION_IMAGE,
  HOME_MISSION_IMAGE,
  HOME_SUSTAINABILITY_IMAGE,
} from "@/lib/content/home-principles-media";

export type HomeThreePrinciple = {
  id: "mission" | "innovation" | "sustainability";
  label: string;
  titleLines: readonly string[];
  description: string;
  cta: { label: string; href: string };
  image: { src: string; position: string; fit?: "cover" | "contain" };
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
      "To restore, protect, and nurture the skin you have now for lasting results that reveal themselves over time.",
    cta: { label: "our values", href: "/about#about-men-heading" },
    image: { src: HOME_MISSION_IMAGE, position: "50% 0%" },
  },
  {
    id: "innovation",
    label: "innovation",
    titleLines: ["Formulated", "for longevity."],
    description:
      "Developed with award-winning dermatologists, chemists, and industry leaders.",
    cta: { label: "our formulas", href: "/about#quality-heading" },
    image: { src: HOME_INNOVATION_IMAGE, position: "50% 50%", fit: "contain" },
  },
  {
    id: "sustainability",
    label: "sustainability",
    titleLines: ["Mindful skincare,", "built in."],
    description:
      "From consciously-sourced ingredients to packaging made with post-consumer recycled materials.",
    cta: { label: "our impact", href: "/about#sustainability-heading" },
    image: { src: HOME_SUSTAINABILITY_IMAGE, position: "50% 50%" },
  },
] as const satisfies readonly HomeThreePrinciple[];
