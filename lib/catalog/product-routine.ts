import type { Product } from "@/lib/products";

export function routineDisplayLabelForProduct(product: Product): string {
  const fallback = [product.routineNumber, product.routineStep]
    .filter(Boolean)
    .join(" · ");
  return (product.routineDisplayLabel ?? fallback) || product.collection;
}

export function routineGroupLabelForProduct(product: Product): string {
  return product.routineGroupLabel ?? product.collection;
}

export function routineSortForProduct(product: Product): number {
  return product.routineSort ?? product.routineOrder ?? product.sortOrder;
}
