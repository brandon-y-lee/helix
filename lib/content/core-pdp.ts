import type { Product } from "@/lib/products";

export type CorePdpTitleToken = {
  text: string;
  emphasis?: boolean;
};

export type CorePdpOutcomeOption = {
  label: string;
  surface: string;
  accent: string;
  detail: string;
};

export type CorePdpPresentation = {
  profileTitle: readonly CorePdpTitleToken[];
  profileMediaPosition: string;
  routineOverlay: string;
  outcomeHeading: string;
  outcomeOptions: readonly [
    CorePdpOutcomeOption,
    CorePdpOutcomeOption,
    CorePdpOutcomeOption,
  ];
};

export const corePdpPresentationBySlug = {
  "cleanse-01-calming-gel-cleanser": {
    profileTitle: [
      { text: "A daily " },
      { text: "GEL CLEANSER", emphasis: true },
      { text: " for a clean, " },
      { text: "BALANCED", emphasis: true },
      { text: " start." },
    ],
    profileMediaPosition: "50% 54%",
    routineOverlay: "See how CLEANSE works in your skin routine.",
    outcomeHeading: "YOUR DAILY CLEANSER THAT:",
    outcomeOptions: [
      {
        label: "cleanses",
        surface: "#c6d2cc",
        accent: "#899b91",
        detail: "#e5ded2",
      },
      {
        label: "balances",
        surface: "#adb8aa",
        accent: "#d5c7b7",
        detail: "#65766c",
      },
      {
        label: "preps",
        surface: "#d3cbc0",
        accent: "#8b9e9a",
        detail: "#ece7df",
      },
    ],
  },
  "treat-03-pdrn-5-ampoule": {
    profileTitle: [
      { text: "A lightweight " },
      { text: "PDRN SERUM", emphasis: true },
      { text: " for " },
      { text: "HYDRATION", emphasis: true },
      { text: ", smoother-looking texture, and a steadier " },
      { text: "GLOW", emphasis: true },
      { text: "." },
    ],
    profileMediaPosition: "50% 51%",
    routineOverlay: "See how TREAT works in your skin routine.",
    outcomeHeading: "YOUR DAILY TREATMENT THAT:",
    outcomeOptions: [
      {
        label: "hydrates",
        surface: "#c5d3d0",
        accent: "#839a9c",
        detail: "#eadbd4",
      },
      {
        label: "smooths",
        surface: "#d8bbb2",
        accent: "#9caeaa",
        detail: "#f0e5dd",
      },
      {
        label: "wakes up the finish",
        surface: "#a9b8c7",
        accent: "#d1b7aa",
        detail: "#e7ece8",
      },
    ],
  },
  "seal-05-green-collagen-cream": {
    profileTitle: [
      { text: "A " },
      { text: "CUSHIONING CREAM", emphasis: true },
      { text: " that holds " },
      { text: "HYDRATION", emphasis: true },
      { text: " close with a clean, " },
      { text: "COMPOSED", emphasis: true },
      { text: " finish." },
    ],
    profileMediaPosition: "50% 52%",
    routineOverlay: "See how SEAL works in your skin routine.",
    outcomeHeading: "YOUR DAILY CREAM THAT:",
    outcomeOptions: [
      {
        label: "cushions",
        surface: "#abb7a3",
        accent: "#d0b99e",
        detail: "#e8e4dc",
      },
      {
        label: "comforts",
        surface: "#d1bca7",
        accent: "#83958a",
        detail: "#efe8df",
      },
      {
        label: "holds hydration",
        surface: "#b5c1c3",
        accent: "#9aa58e",
        detail: "#ded1bf",
      },
    ],
  },
} as const satisfies Record<string, CorePdpPresentation>;

export type CorePdpSlug = keyof typeof corePdpPresentationBySlug;

export function getCorePdpPresentation(
  slug: string,
): CorePdpPresentation | null {
  return corePdpPresentationBySlug[slug as CorePdpSlug] ?? null;
}

function sentenceCaseList(items: string[]): string {
  return items
    .map((item, index) => (index === 0 ? item : item.toLowerCase()))
    .join(" and ");
}

export function corePdpProfileRows(product: Product) {
  const step =
    product.routineStepNumber && product.routineGroupLabel
      ? `Step ${String(product.routineStepNumber).padStart(2, "0")} of ${product.routineGroupLabel}`
      : product.routineDisplayLabel;
  const fyi = [
    product.skinTypes.join(", "),
    sentenceCaseList(product.usageTime),
    step,
  ]
    .filter(Boolean)
    .join(" • ");

  return [
    { label: "GOOD FOR", value: product.goodFor },
    { label: "FEELS LIKE", value: product.texture },
    { label: "FINISH", value: product.finish },
    { label: "FYI", value: fyi },
  ].filter(
    (row): row is { label: string; value: string } => Boolean(row.value),
  );
}
