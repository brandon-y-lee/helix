import type { CorePdpStep } from "@/lib/content/core-pdp";

export type PdpCoreDetailsPresentation = {
  step: CorePdpStep;
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
    placeholder: {
      start: "#d8e4de",
      end: "#81998d",
      glow: "#f3f6f2",
      replacementKey: "pdp-details-cleanse",
    },
  },
  {
    step: "treat",
    placeholder: {
      start: "#e7d8b7",
      end: "#b38c55",
      glow: "#fbf3df",
      replacementKey: "pdp-details-treat",
    },
  },
  {
    step: "seal",
    placeholder: {
      start: "#d7dfd0",
      end: "#718166",
      glow: "#f3f4ec",
      replacementKey: "pdp-details-seal",
    },
  },
] as const satisfies readonly PdpCoreDetailsPresentation[];
