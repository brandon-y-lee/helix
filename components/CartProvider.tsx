"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { CartLine, CartState } from "@/lib/cart/types";

type AddInput = Pick<
  CartLine,
  | "slug"
  | "name"
  | "variantId"
  | "variantLabel"
  | "price"
  | "swatch"
  | "imageUrl"
  | "imageAlt"
  | "placeholderMedia"
>;

type CartContextValue = {
  lines: CartLine[];
  count: number;
  subtotal: number;
  cartDrawerOpen: boolean;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  add: (item: AddInput, quantity?: number) => Promise<boolean>;
  setQuantity: (key: string, quantity: number) => Promise<boolean>;
  remove: (key: string) => Promise<boolean>;
  clear: () => Promise<boolean>;
  openCartDrawer: (returnFocus?: () => void) => void;
  closeCartDrawer: () => void;
  returnFocusAfterCartDrawerClose: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

const EMPTY_CART: CartState = { lines: [], count: 0, subtotal: 0, currency: "USD" };

function optimisticKey(slug: string, variantId: string): string {
  return `optimistic:${slug}:${variantId}`;
}

async function readResponse(response: Response): Promise<CartState> {
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      data && typeof data.error === "string"
        ? data.error
        : "Cart is temporarily unavailable.";
    throw new Error(message);
  }
  return data as CartState;
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false);
  const cartDrawerReturnFocusRef = useRef<() => void>(() => {});

  const applyState = useCallback((cart: CartState) => {
    setLines(cart.lines);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/cart", { cache: "no-store" });
      applyState(await readResponse(response));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cart is temporarily unavailable.");
      applyState(EMPTY_CART);
    } finally {
      setLoading(false);
    }
  }, [applyState]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    function onFocus() {
      void refresh();
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  const rollback = useCallback((previous: CartLine[], err: unknown) => {
    setLines(previous);
    setError(err instanceof Error ? err.message : "Cart update failed.");
  }, []);

  const add = useCallback(async (item: AddInput, quantity = 1) => {
    setError(null);
    const previous = lines;
    const key = optimisticKey(item.slug, item.variantId);
    setLines((prev) => {
      const existing = prev.find((line) => line.slug === item.slug && line.variantId === item.variantId);
      if (existing) {
        return prev.map((line) =>
          line.key === existing.key
            ? { ...line, quantity: line.quantity + quantity, lineSubtotal: line.price * (line.quantity + quantity) }
            : line,
        );
      }
      return [
        ...prev,
        {
          ...item,
          key,
          collection: "",
          quantity,
          available: true,
          warning: null,
          lineSubtotal: item.price * quantity,
        },
      ];
    });

    try {
      const response = await fetch("/api/cart/items", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug: item.slug, variantId: item.variantId, quantity }),
      });
      applyState(await readResponse(response));
      return true;
    } catch (err) {
      rollback(previous, err);
      return false;
    }
  }, [applyState, lines, rollback]);

  const setQuantity = useCallback(async (key: string, quantity: number) => {
    setError(null);
    const previous = lines;
    setLines((prev) =>
      quantity <= 0
        ? prev.filter((line) => line.key !== key)
        : prev.map((line) =>
            line.key === key
              ? { ...line, quantity, lineSubtotal: line.available ? line.price * quantity : 0 }
              : line,
          ),
    );

    try {
      const response = await fetch("/api/cart/items", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lineId: key, quantity }),
      });
      applyState(await readResponse(response));
      return true;
    } catch (err) {
      rollback(previous, err);
      return false;
    }
  }, [applyState, lines, rollback]);

  const remove = useCallback(async (key: string) => {
    setError(null);
    const previous = lines;
    setLines((prev) => prev.filter((line) => line.key !== key));
    try {
      const response = await fetch("/api/cart/items", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lineId: key }),
      });
      applyState(await readResponse(response));
      return true;
    } catch (err) {
      rollback(previous, err);
      return false;
    }
  }, [applyState, lines, rollback]);

  const clear = useCallback(async () => {
    setError(null);
    const previous = lines;
    setLines([]);
    try {
      const response = await fetch("/api/cart", { method: "DELETE" });
      applyState(await readResponse(response));
      return true;
    } catch (err) {
      rollback(previous, err);
      return false;
    }
  }, [applyState, lines, rollback]);

  const openCartDrawer = useCallback((returnFocus?: () => void) => {
    cartDrawerReturnFocusRef.current = returnFocus ?? (() => {});
    setCartDrawerOpen(true);
  }, []);

  const closeCartDrawer = useCallback(() => {
    setCartDrawerOpen(false);
  }, []);

  const returnFocusAfterCartDrawerClose = useCallback(() => {
    cartDrawerReturnFocusRef.current();
    cartDrawerReturnFocusRef.current = () => {};
  }, []);

  const value = useMemo<CartContextValue>(() => {
    const count = lines.reduce((sum, line) => sum + line.quantity, 0);
    const subtotal = lines.reduce(
      (sum, line) => sum + line.lineSubtotal,
      0,
    );
    return {
      lines,
      count,
      subtotal,
      cartDrawerOpen,
      loading,
      error,
      refresh,
      add,
      setQuantity,
      remove,
      clear,
      openCartDrawer,
      closeCartDrawer,
      returnFocusAfterCartDrawerClose,
    };
  }, [
    lines,
    cartDrawerOpen,
    loading,
    error,
    refresh,
    add,
    setQuantity,
    remove,
    clear,
    openCartDrawer,
    closeCartDrawer,
    returnFocusAfterCartDrawerClose,
  ]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return ctx;
}
