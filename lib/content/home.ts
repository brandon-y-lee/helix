export type HomeThreePrinciple = {
  id: "mission" | "innovation" | "sustainability";
  label: string;
  titleLines: readonly string[];
  description: string;
};

export type HomeCoreDescriptionKey = "cleanse" | "treat" | "seal";

export const homeCoreDescriptions = {
  default: "Simple by design. For all skin types.",
  items: {
    cleanse: "cleanse the surface",
    treat: "apply the treatment layer",
    seal: "finish with moisture and barrier support",
  },
} as const satisfies {
  default: string;
  items: Record<HomeCoreDescriptionKey, string>;
};

export type HomeBeyondCoreDescriptionKey = "refine" | "frame" | "protect" | "lift";

export const homeBeyondCoreDescriptions = {
  default: "For when your skin has a high baseline. Add what you need.",
  items: {
    refine: "refine texture when the baseline is stable",
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
