export type HomeThreePrinciple = {
  id: "structure" | "restraint" | "consistency";
  label: string;
  description: string;
};

export const homeThreePrinciples = [
  {
    id: "structure",
    label: "structure",
    description:
      "Skin improves when the routine has an order: cleanse the surface, apply the treatment layer, and finish with moisture.",
  },
  {
    id: "restraint",
    label: "restraint",
    description:
      "Most routines fail because they ask for too much too soon. The Core keeps the baseline repeatable before anything else is added.",
  },
  {
    id: "consistency",
    label: "consistency",
    description:
      "Three steps build the habit. Additional steps only matter when the baseline is stable enough to repeat.",
  },
] as const satisfies readonly HomeThreePrinciple[];
