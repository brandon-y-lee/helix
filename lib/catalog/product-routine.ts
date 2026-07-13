import type { Product } from "@/lib/products";

export type CommerceRoutineGroup = "core" | "beyond_core";

export type ProductRoutinePresentation = {
  routineGroup: CommerceRoutineGroup;
  routineGroupLabel: "The Core" | "Beyond The Core";
  routineStepNumber: number | null;
  routineStepName: "Cleanse" | "Treat" | "Seal" | null;
  routineDisplayLabel: string;
  routineSort: number;
  legacyRoutineGroupLabel: string | null;
  legacyRoutineDisplayLabel: string | null;
};

export const productRoutinePresentationBySlug = {
  "cleanse-01-calming-gel-cleanser": {
    routineGroup: "core",
    routineGroupLabel: "The Core",
    routineStepNumber: 1,
    routineStepName: "Cleanse",
    routineDisplayLabel: "01 — The Core",
    routineSort: 10,
    legacyRoutineGroupLabel: "The System",
    legacyRoutineDisplayLabel: "01 — The System",
  },
  "treat-03-pdrn-5-ampoule": {
    routineGroup: "core",
    routineGroupLabel: "The Core",
    routineStepNumber: 2,
    routineStepName: "Treat",
    routineDisplayLabel: "02 — The Core",
    routineSort: 20,
    legacyRoutineGroupLabel: "The System",
    legacyRoutineDisplayLabel: "03 — The System",
  },
  "seal-05-green-collagen-cream": {
    routineGroup: "core",
    routineGroupLabel: "The Core",
    routineStepNumber: 3,
    routineStepName: "Seal",
    routineDisplayLabel: "03 — The Core",
    routineSort: 30,
    legacyRoutineGroupLabel: "The System",
    legacyRoutineDisplayLabel: "05 — The System",
  },
  "refine-02-pore-treatment-pads": {
    routineGroup: "beyond_core",
    routineGroupLabel: "Beyond The Core",
    routineStepNumber: null,
    routineStepName: null,
    routineDisplayLabel: "Beyond The Core",
    routineSort: 110,
    legacyRoutineGroupLabel: "The System",
    legacyRoutineDisplayLabel: "02 — The System",
  },
  "frame-04-pdrn-eye-cream": {
    routineGroup: "beyond_core",
    routineGroupLabel: "Beyond The Core",
    routineStepNumber: null,
    routineStepName: null,
    routineDisplayLabel: "Beyond The Core",
    routineSort: 120,
    legacyRoutineGroupLabel: "The System",
    legacyRoutineDisplayLabel: "04 — The System",
  },
  "lift-06-pdrn-mask-system": {
    routineGroup: "beyond_core",
    routineGroupLabel: "Beyond The Core",
    routineStepNumber: null,
    routineStepName: null,
    routineDisplayLabel: "Beyond The Core",
    routineSort: 130,
    legacyRoutineGroupLabel: "Intensive",
    legacyRoutineDisplayLabel: "07 — The System",
  },
} as const satisfies Record<string, ProductRoutinePresentation>;

export type ProductRoutineSlug = keyof typeof productRoutinePresentationBySlug;

export function productRoutineForSlug(
  slug: string,
): ProductRoutinePresentation | null {
  return productRoutinePresentationBySlug[slug as ProductRoutineSlug] ?? null;
}

export function routineDisplayLabelForProduct(product: Product): string {
  const label =
    product.routineDisplayLabel ??
    productRoutineForSlug(product.slug)?.routineDisplayLabel ??
    [product.routineNumber, product.routineStep].filter(Boolean).join(" · ");
  return label || product.collection;
}

export function routineGroupLabelForProduct(product: Product): string {
  return (
    product.routineGroupLabel ??
    productRoutineForSlug(product.slug)?.routineGroupLabel ??
    product.collection
  );
}

export function routineSortForProduct(product: Product): number {
  return (
    product.routineSort ??
    productRoutineForSlug(product.slug)?.routineSort ??
    product.routineOrder ??
    product.sortOrder
  );
}
