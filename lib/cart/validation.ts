import { CartError } from "@/lib/cart/types";

const MAX_LINE_QUANTITY = 99;

export function normalizeCartQuantity(quantity: number): number {
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new CartError("invalid_quantity", "Choose a quantity of at least 1.");
  }
  return Math.min(quantity, MAX_LINE_QUANTITY);
}
