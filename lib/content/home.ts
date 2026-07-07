export type HomeThreePrinciple = {
  id: "mission" | "innovation" | "sustainability";
  label: string;
  titleLines: readonly string[];
  description: string;
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
