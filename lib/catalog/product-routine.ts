type RoutineProduct = {
  routineGroup: "core" | "beyond_core";
  systemStepPosition: number | null;
};

export function routineDisplayLabelForProduct(product: RoutineProduct): string {
  if (product.routineGroup === "beyond_core") return "Beyond The Core";
  if (!product.systemStepPosition) return "The Core";
  return `${String(product.systemStepPosition).padStart(2, "0")} — The Core`;
}

export function routineGroupLabel(
  group: RoutineProduct["routineGroup"],
): "The Core" | "Beyond The Core" {
  return group === "core" ? "The Core" : "Beyond The Core";
}

export function routineGroupLabelForProduct(product: RoutineProduct): string {
  return routineGroupLabel(product.routineGroup);
}
