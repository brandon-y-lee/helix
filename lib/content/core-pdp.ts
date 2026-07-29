import type {
  PdpProfileTitleToken,
  ProductPdpContent,
} from "@/lib/catalog/product-content";
import type { Product } from "@/lib/products";

export type CorePdpStep = "cleanse" | "treat" | "seal";

export type CorePdpOutcomeOption = {
  label: string;
  surface: string;
  accent: string;
  detail: string;
};

export type CorePdpApplicationStep = {
  id: "01" | "02" | "03";
  copy: string;
  surface: string;
  accent: string;
  detail: string;
};

export type CorePdpPresentation = {
  profileTitle: readonly PdpProfileTitleToken[];
  profileMediaPosition: string;
  routineOverlay: string;
  outcomeHeading: string;
  outcomeOptions: readonly [
    CorePdpOutcomeOption,
    CorePdpOutcomeOption,
    CorePdpOutcomeOption,
  ];
  applicationSteps: readonly [
    CorePdpApplicationStep,
    CorePdpApplicationStep,
    CorePdpApplicationStep,
  ];
  ingredientsMediaPosition: string;
};

type CorePdpDesignTokens = {
  profileMediaPosition: string;
  outcomeOptions: readonly [
    Omit<CorePdpOutcomeOption, "label">,
    Omit<CorePdpOutcomeOption, "label">,
    Omit<CorePdpOutcomeOption, "label">,
  ];
  applicationSteps: readonly [
    Omit<CorePdpApplicationStep, "id" | "copy">,
    Omit<CorePdpApplicationStep, "id" | "copy">,
    Omit<CorePdpApplicationStep, "id" | "copy">,
  ];
  ingredientsMediaPosition: string;
};

export const CORE_PDP_DESIGN_TOKENS = {
  cleanse: {
    profileMediaPosition: "50% 54%",
    outcomeOptions: [
      { surface: "#c6d2cc", accent: "#899b91", detail: "#e5ded2" },
      { surface: "#adb8aa", accent: "#d5c7b7", detail: "#65766c" },
      { surface: "#d3cbc0", accent: "#8b9e9a", detail: "#ece7df" },
    ],
    applicationSteps: [
      { surface: "#d8ddd7", accent: "#97aa9b", detail: "#eef0ea" },
      { surface: "#c0cbc5", accent: "#789085", detail: "#d9d0c0" },
      { surface: "#e4ded3", accent: "#93aaa7", detail: "#bbc7bc" },
    ],
    ingredientsMediaPosition: "50% 50%",
  },
  treat: {
    profileMediaPosition: "50% 51%",
    outcomeOptions: [
      { surface: "#c5d3d0", accent: "#839a9c", detail: "#eadbd4" },
      { surface: "#d8bbb2", accent: "#9caeaa", detail: "#f0e5dd" },
      { surface: "#a9b8c7", accent: "#d1b7aa", detail: "#e7ece8" },
    ],
    applicationSteps: [
      { surface: "#dce5e2", accent: "#829c9a", detail: "#f0d8cf" },
      { surface: "#d7c2bb", accent: "#b6867d", detail: "#e4edf0" },
      { surface: "#c5d3df", accent: "#758ea3", detail: "#ead9c9" },
    ],
    ingredientsMediaPosition: "50% 50%",
  },
  seal: {
    profileMediaPosition: "50% 52%",
    outcomeOptions: [
      { surface: "#abb7a3", accent: "#d0b99e", detail: "#e8e4dc" },
      { surface: "#d1bca7", accent: "#83958a", detail: "#efe8df" },
      { surface: "#b5c1c3", accent: "#9aa58e", detail: "#ded1bf" },
    ],
    applicationSteps: [
      { surface: "#d6dccf", accent: "#91a187", detail: "#eee6d9" },
      { surface: "#c7d0bd", accent: "#798f79", detail: "#e5d2be" },
      { surface: "#d9cec0", accent: "#a9876a", detail: "#b7c4c2" },
    ],
    ingredientsMediaPosition: "50% 50%",
  },
} as const satisfies Record<CorePdpStep, CorePdpDesignTokens>;

export function corePdpStepForProduct(product: Product): CorePdpStep | null {
  if (product.routineGroup !== "core") return null;
  switch (product.routineStepName?.toLowerCase()) {
    case "cleanse":
      return "cleanse";
    case "treat":
      return "treat";
    case "seal":
      return "seal";
    default:
      return null;
  }
}

export function getCorePdpPresentation(
  product: Product,
  content: ProductPdpContent | null = product.pdpContent ?? null,
): CorePdpPresentation | null {
  const step = corePdpStepForProduct(product);
  if (
    !step ||
    !content?.profileTitleTokens ||
    !content.routineOverlay ||
    !content.outcomeHeading ||
    !content.outcomeLabels ||
    !content.applicationSteps ||
    content.applicationSteps.length !== 3
  ) {
    return null;
  }

  const tokens = CORE_PDP_DESIGN_TOKENS[step];
  const ids = ["01", "02", "03"] as const;
  const outcomeOptions = tokens.outcomeOptions.map((option, index) => ({
    ...option,
    label: content.outcomeLabels![index],
  })) as [
    CorePdpOutcomeOption,
    CorePdpOutcomeOption,
    CorePdpOutcomeOption,
  ];
  const applicationSteps = tokens.applicationSteps.map((option, index) => ({
    ...option,
    id: ids[index],
    copy: content.applicationSteps![index],
  })) as [
    CorePdpApplicationStep,
    CorePdpApplicationStep,
    CorePdpApplicationStep,
  ];

  return {
    profileTitle: content.profileTitleTokens,
    profileMediaPosition: tokens.profileMediaPosition,
    routineOverlay: content.routineOverlay,
    outcomeHeading: content.outcomeHeading,
    outcomeOptions,
    applicationSteps,
    ingredientsMediaPosition: tokens.ingredientsMediaPosition,
  };
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
