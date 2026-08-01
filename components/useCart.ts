"use client";

import {
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { useCallback } from "react";
import { useCartCommerceEnabled } from "@/components/CartProvider";
import {
  CART_MUTATION_SCOPE,
  CART_QUERY_KEY,
  EMPTY_CART,
  addCartItem,
  cartErrorMessage,
  cartErrorRetryable,
  cartQueryOptions,
  clearCart,
  createCheckoutSession,
  isConfirmedCartFailure,
  removeCartItem,
  setCartItemQuantity,
} from "@/lib/cart/client";
import { broadcastCartChanged } from "@/lib/cart/sync";
import type { CartAddInput, CartState } from "@/lib/cart/types";

const ADD_MUTATION_KEY = ["cart", "add"] as const;
const SET_MUTATION_KEY = ["cart", "set"] as const;
const REMOVE_MUTATION_KEY = ["cart", "remove"] as const;
const CLEAR_MUTATION_KEY = ["cart", "clear"] as const;
const CHECKOUT_MUTATION_KEY = ["cart", "checkout"] as const;

type MutationSnapshot = { previous: CartState | undefined };
type AddVariables = { item: CartAddInput; quantity: number };
type SetVariables = { lineId: string; quantity: number };
type RemoveVariables = { lineId: string };

async function snapshotCart(
  queryClient: QueryClient,
  update?: (cart: CartState) => CartState,
): Promise<MutationSnapshot> {
  await queryClient.cancelQueries({ queryKey: CART_QUERY_KEY });
  const previous = queryClient.getQueryData<CartState>(CART_QUERY_KEY);
  if (previous && update) {
    queryClient.setQueryData(CART_QUERY_KEY, update(previous));
  }
  return { previous };
}

async function reconcileFailure(
  queryClient: QueryClient,
  error: unknown,
  snapshot: MutationSnapshot | undefined,
): Promise<void> {
  if (isConfirmedCartFailure(error)) {
    if (snapshot?.previous) {
      queryClient.setQueryData(CART_QUERY_KEY, snapshot.previous);
    } else {
      queryClient.removeQueries({ queryKey: CART_QUERY_KEY });
    }
    return;
  }

  await queryClient.invalidateQueries({ queryKey: CART_QUERY_KEY });
}

async function executeCartMutation(
  queryClient: QueryClient,
  request: () => Promise<CartState>,
  update?: (cart: CartState) => CartState,
): Promise<CartState> {
  const snapshot = await snapshotCart(queryClient, update);
  try {
    return await request();
  } catch (error) {
    await reconcileFailure(queryClient, error, snapshot);
    throw error;
  }
}

function applyAuthoritativeCart(
  queryClient: QueryClient,
  cart: CartState,
): void {
  queryClient.setQueryData(CART_QUERY_KEY, cart);
  broadcastCartChanged();
}

function withOptimisticQuantity(
  cart: CartState,
  lineId: string,
  quantity: number,
): CartState {
  const lines = quantity <= 0
    ? cart.lines.filter((line) => line.key !== lineId)
    : cart.lines.map((line) =>
        line.key === lineId ? { ...line, quantity } : line,
      );
  return {
    ...cart,
    lines,
    count: lines.reduce((sum, line) => sum + line.quantity, 0),
  };
}

function withoutLine(cart: CartState, lineId: string): CartState {
  const lines = cart.lines.filter((line) => line.key !== lineId);
  return {
    ...cart,
    lines,
    count: lines.reduce((sum, line) => sum + line.quantity, 0),
  };
}

export function useCart() {
  const commerceEnabled = useCartCommerceEnabled();
  const query = useQuery({
    ...cartQueryOptions(),
    enabled: commerceEnabled,
  });
  const cart = query.data ?? EMPTY_CART;
  const error = query.error
    ? cartErrorMessage(query.error, "Cart is temporarily unavailable.")
    : null;

  const refresh = useCallback(async () => {
    await query.refetch();
  }, [query]);

  return {
    ...cart,
    loading: query.isFetching,
    hasLoadedCart: !commerceEnabled || query.data !== undefined,
    error,
    retryable: query.error ? cartErrorRetryable(query.error) : false,
    refresh,
  };
}

export function useCartCount() {
  const commerceEnabled = useCartCommerceEnabled();
  const query = useQuery({
    ...cartQueryOptions(),
    enabled: commerceEnabled,
    select: (cart) => cart.count,
  });
  return {
    count: query.data ?? 0,
    hasLoadedCart: !commerceEnabled || query.data !== undefined,
    error: query.error
      ? cartErrorMessage(query.error, "Cart is temporarily unavailable.")
      : null,
  };
}

export function useCartMutations() {
  const commerceEnabled = useCartCommerceEnabled();
  const queryClient = useQueryClient();

  const addMutation = useMutation({
    mutationKey: ADD_MUTATION_KEY,
    scope: CART_MUTATION_SCOPE,
    mutationFn: ({ item, quantity }: AddVariables) => executeCartMutation(
      queryClient,
      () => addCartItem({ slug: item.slug, variantId: item.variantId, quantity }),
    ),
    onSuccess: (cart) => applyAuthoritativeCart(queryClient, cart),
  });

  const setMutation = useMutation({
    mutationKey: SET_MUTATION_KEY,
    scope: CART_MUTATION_SCOPE,
    mutationFn: ({ lineId, quantity }: SetVariables) => executeCartMutation(
      queryClient,
      () => setCartItemQuantity({ lineId, quantity }),
      (cart) =>
        withOptimisticQuantity(cart, lineId, quantity),
    ),
    onSuccess: (cart) => applyAuthoritativeCart(queryClient, cart),
  });

  const removeMutation = useMutation({
    mutationKey: REMOVE_MUTATION_KEY,
    scope: CART_MUTATION_SCOPE,
    mutationFn: ({ lineId }: RemoveVariables) => executeCartMutation(
      queryClient,
      () => removeCartItem(lineId),
      (cart) => withoutLine(cart, lineId),
    ),
    onSuccess: (cart) => applyAuthoritativeCart(queryClient, cart),
  });

  const clearMutation = useMutation({
    mutationKey: CLEAR_MUTATION_KEY,
    scope: CART_MUTATION_SCOPE,
    mutationFn: () => executeCartMutation(
      queryClient,
      clearCart,
      () => EMPTY_CART,
    ),
    onSuccess: (cart) => applyAuthoritativeCart(queryClient, cart),
  });

  const checkoutMutation = useMutation({
    mutationKey: CHECKOUT_MUTATION_KEY,
    scope: CART_MUTATION_SCOPE,
    mutationFn: (rewardTierId: string | null) =>
      createCheckoutSession(rewardTierId),
  });

  const pending = useMutationState({
    filters: { mutationKey: ["cart"], status: "pending" },
    select: (mutation) => ({
      kind: mutation.options.mutationKey?.[1],
      variables: mutation.state.variables,
    }),
  });

  const resetErrors = useCallback(() => {
    addMutation.reset();
    setMutation.reset();
    removeMutation.reset();
    clearMutation.reset();
    checkoutMutation.reset();
  }, [
    addMutation,
    clearMutation,
    checkoutMutation,
    removeMutation,
    setMutation,
  ]);

  const add = useCallback(async (item: CartAddInput, quantity = 1) => {
    if (!commerceEnabled) return false;
    resetErrors();
    try {
      await addMutation.mutateAsync({ item, quantity });
      return true;
    } catch {
      return false;
    }
  }, [addMutation, commerceEnabled, resetErrors]);

  const setQuantity = useCallback(async (lineId: string, quantity: number) => {
    if (!commerceEnabled) return false;
    resetErrors();
    try {
      await setMutation.mutateAsync({ lineId, quantity });
      return true;
    } catch {
      return false;
    }
  }, [commerceEnabled, resetErrors, setMutation]);

  const remove = useCallback(async (lineId: string) => {
    if (!commerceEnabled) return false;
    resetErrors();
    try {
      await removeMutation.mutateAsync({ lineId });
      return true;
    } catch {
      return false;
    }
  }, [commerceEnabled, removeMutation, resetErrors]);

  const clear = useCallback(async () => {
    if (!commerceEnabled) return false;
    resetErrors();
    try {
      await clearMutation.mutateAsync();
      return true;
    } catch {
      return false;
    }
  }, [clearMutation, commerceEnabled, resetErrors]);

  const startCheckout = useCallback(async (rewardTierId: string | null) => {
    if (!commerceEnabled) return null;
    resetErrors();
    try {
      return await checkoutMutation.mutateAsync(rewardTierId);
    } catch {
      return null;
    }
  }, [checkoutMutation, commerceEnabled, resetErrors]);

  const isAdding = useCallback((item: Pick<CartAddInput, "slug" | "variantId">) =>
    pending.some((entry) => {
      if (entry.kind !== "add") return false;
      const variables = entry.variables as AddVariables | undefined;
      return variables?.item.slug === item.slug &&
        variables.item.variantId === item.variantId;
    }), [pending]);

  const isLinePending = useCallback((lineId: string) =>
    pending.some((entry) => {
      if (entry.kind !== "set" && entry.kind !== "remove") return false;
      const variables = entry.variables as SetVariables | RemoveVariables | undefined;
      return variables?.lineId === lineId;
    }), [pending]);

  const errors = [
    addMutation.error,
    setMutation.error,
    removeMutation.error,
    clearMutation.error,
  ];
  const errorValue = errors.find(Boolean) ?? null;

  return {
    add,
    setQuantity,
    remove,
    clear,
    startCheckout,
    isAdding,
    isLinePending,
    isClearing: pending.some((entry) => entry.kind === "clear"),
    isMutating: pending.some((entry) => entry.kind !== "checkout"),
    checkoutPending: pending.some((entry) => entry.kind === "checkout"),
    addPending: addMutation.isPending,
    addError: addMutation.error,
    checkoutError: checkoutMutation.error,
    error: errorValue
      ? cartErrorMessage(errorValue, "Cart update failed.")
      : null,
    retryable: errorValue ? cartErrorRetryable(errorValue) : false,
    resetErrors,
  };
}
