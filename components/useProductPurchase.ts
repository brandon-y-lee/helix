"use client";

import { useCallback, useRef, useState } from "react";
import {
  useCart,
  type CartAddInput,
} from "@/components/CartProvider";

const PURCHASE_ERROR =
  "Cart is temporarily unavailable. Try again in a moment.";

export function useProductPurchase() {
  const { add, openCartDrawer } = useCart();
  const inFlightRef = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const clearError = useCallback(() => setError(""), []);

  const purchase = useCallback(
    async ({
      item,
      quantity,
      returnFocus,
    }: {
      item: CartAddInput;
      quantity?: number;
      returnFocus?: () => void;
    }) => {
      if (inFlightRef.current) return false;

      inFlightRef.current = true;
      setPending(true);
      setError("");

      try {
        const added =
          quantity === undefined
            ? await add(item)
            : await add(item, quantity);
        if (!added) {
          setError(PURCHASE_ERROR);
          return false;
        }

        openCartDrawer(returnFocus);
        return true;
      } catch {
        setError(PURCHASE_ERROR);
        return false;
      } finally {
        inFlightRef.current = false;
        setPending(false);
      }
    },
    [add, openCartDrawer],
  );

  return {
    clearError,
    error,
    pending,
    purchase,
  };
}
