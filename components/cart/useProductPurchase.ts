"use client";

import { useCallback } from "react";
import { useCartDrawer } from "@/components/cart/CartProvider";
import { useCartMutations } from "@/components/cart/useCart";
import { cartErrorMessage } from "@/lib/cart/client";
import type { CartAddInput } from "@/lib/cart/types";

const PURCHASE_ERROR =
  "Cart is temporarily unavailable. Try again in a moment.";

export function useProductPurchase() {
  const { openCartDrawer } = useCartDrawer();
  const {
    add,
    addError,
    addPending,
    isAdding,
    resetErrors,
  } = useCartMutations();

  const clearError = useCallback(() => resetErrors(), [resetErrors]);

  const purchase = useCallback(
    async ({
      item,
      quantity,
      beforeDrawerOpen,
      returnFocus,
    }: {
      item: CartAddInput;
      quantity?: number;
      beforeDrawerOpen?: () => void;
      returnFocus?: () => void;
    }) => {
      if (isAdding(item)) return false;
      const added =
        quantity === undefined
          ? await add(item)
          : await add(item, quantity);
      if (!added) {
        return false;
      }

      beforeDrawerOpen?.();
      openCartDrawer(returnFocus);
      return true;
    },
    [add, isAdding, openCartDrawer],
  );

  return {
    clearError,
    error: addError ? cartErrorMessage(addError, PURCHASE_ERROR) : "",
    pending: addPending,
    purchase,
  };
}
