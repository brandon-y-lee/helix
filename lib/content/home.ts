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
      "Restore, Protect, and Nurture the skin you have now for lasting results that reveal themselves over time.",
  },
  {
    id: "innovation",
    label: "innovation",
    titleLines: ["Longevity is", "formulated."],
    description:
      "Developed with award-winning dermatologists and industry leaders. Formulated for longevity.",
  },
  {
    id: "sustainability",
    label: "sustainability",
    titleLines: ["Mindful skincare,", "built in."],
    description:
      "From consciously-sourced ingredients to packaging made with post-consumer recycled materials, we’re committed to MINDFUL SKINCARE.",
  },
] as const satisfies readonly HomeThreePrinciple[];
