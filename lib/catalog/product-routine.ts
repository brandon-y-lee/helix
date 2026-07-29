type RoutineProduct = {
  collection: string;
  routineDisplayLabel?: string | null;
  routineGroupLabel?: string | null;
  routineNumber?: string | null;
  routineOrder?: number | null;
  routineSort?: number | null;
  routineStep?: string | null;
  sortOrder?: number;
};

export function routineDisplayLabelForProduct(product: RoutineProduct): string {
  const fallback = [product.routineNumber, product.routineStep]
    .filter(Boolean)
    .join(" · ");
  return (product.routineDisplayLabel ?? fallback) || product.collection;
}

export function routineGroupLabelForProduct(product: RoutineProduct): string {
  return product.routineGroupLabel ?? product.collection;
}

export function routineSortForProduct(product: RoutineProduct): number {
  return product.routineSort ?? product.routineOrder ?? product.sortOrder ?? 0;
}
