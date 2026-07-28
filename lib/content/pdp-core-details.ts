export type PdpCoreDetailsStep = "cleanse" | "treat" | "seal";

export type PdpCoreDetailsPresentation = {
  step: PdpCoreDetailsStep;
  slug: string;
  routineFit: string;
  placeholder: {
    start: string;
    end: string;
    glow: string;
    replacementKey: string;
  };
};

export const PDP_CORE_DETAILS_PRESENTATIONS = [
  {
    step: "cleanse",
    slug: "cleanse-01-calming-gel-cleanser",
    routineFit:
      "Use first, then follow with TREAT and SEAL. In the morning, finish with SPF.",
    placeholder: {
      start: "#d8e4de",
      end: "#81998d",
      glow: "#f3f6f2",
      replacementKey: "pdp-details-cleanse",
    },
  },
  {
    step: "treat",
    slug: "treat-03-pdrn-5-ampoule",
    routineFit:
      "Use after CLEANSE and before SEAL. In the morning, finish with SPF.",
    placeholder: {
      start: "#e7d8b7",
      end: "#b38c55",
      glow: "#fbf3df",
      replacementKey: "pdp-details-treat",
    },
  },
  {
    step: "seal",
    slug: "seal-05-green-collagen-cream",
    routineFit:
      "Use after TREAT as the final Mei Pelle step. In the morning, follow with SPF.",
    placeholder: {
      start: "#d7dfd0",
      end: "#718166",
      glow: "#f3f4ec",
      replacementKey: "pdp-details-seal",
    },
  },
] as const satisfies readonly PdpCoreDetailsPresentation[];
