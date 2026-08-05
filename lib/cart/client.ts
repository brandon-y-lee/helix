import { queryOptions } from "@tanstack/react-query";
import type { CartState } from "@/lib/cart/types";

export const CART_QUERY_KEY = ["cart"] as const;
export const CART_MUTATION_SCOPE = { id: "cart" } as const;

export const EMPTY_CART: CartState = {
  lines: [],
  count: 0,
  subtotal: 0,
  currency: "USD",
};

type CartErrorEnvelope = {
  error?: string | {
    code?: string;
    message?: string;
    retryable?: boolean;
  };
};

class CartApiError extends Error {
  constructor(
    message: string,
    readonly code: string | null,
    readonly retryable: boolean,
    readonly outcome: "confirmed" | "ambiguous",
  ) {
    super(message);
    this.name = "CartApiError";
  }
}

function errorDetails(
  data: CartErrorEnvelope | null,
  fallback: string,
): { message: string; code: string | null; retryable: boolean } {
  const error = data?.error;
  if (typeof error === "string") {
    return { message: error, code: null, retryable: false };
  }
  return {
    message: error?.message ?? fallback,
    code: typeof error?.code === "string" ? error.code : null,
    retryable: error?.retryable === true,
  };
}

function isCartState(value: unknown): value is CartState {
  if (!value || typeof value !== "object") return false;
  const cart = value as Partial<CartState>;
  return (
    Array.isArray(cart.lines) &&
    typeof cart.count === "number" &&
    typeof cart.subtotal === "number" &&
    cart.currency === "USD"
  );
}

async function requestJson<T>(
  input: RequestInfo | URL,
  init: RequestInit,
  validate: (value: unknown) => value is T,
  fallback: string,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(input, {
      credentials: "same-origin",
      cache: "no-store",
      ...init,
    });
  } catch {
    throw new CartApiError(
      fallback,
      null,
      true,
      "ambiguous",
    );
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const details = errorDetails(data as CartErrorEnvelope | null, fallback);
    throw new CartApiError(
      details.message,
      details.code,
      details.retryable || response.status >= 500,
      response.status >= 500 ? "ambiguous" : "confirmed",
    );
  }
  if (!validate(data)) {
    throw new CartApiError(fallback, null, true, "ambiguous");
  }
  return data;
}

function cartRequest(input: RequestInfo | URL, init: RequestInit = {}) {
  return requestJson(
    input,
    init,
    isCartState,
    "Cart is temporarily unavailable.",
  );
}

function getCart(signal?: AbortSignal): Promise<CartState> {
  return cartRequest("/api/cart", { signal });
}

export function addCartItem(input: {
  slug: string;
  variantId: string;
  quantity: number;
}): Promise<CartState> {
  return cartRequest("/api/cart/items", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function setCartItemQuantity(input: {
  lineId: string;
  quantity: number;
}): Promise<CartState> {
  return cartRequest("/api/cart/items", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function removeCartItem(lineId: string): Promise<CartState> {
  return cartRequest("/api/cart/items", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ lineId }),
  });
}

export function clearCart(): Promise<CartState> {
  return cartRequest("/api/cart", { method: "DELETE" });
}

type CheckoutSession = { url: string };

function isCheckoutSession(value: unknown): value is CheckoutSession {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as CheckoutSession).url === "string",
  );
}

export function createCheckoutSession(rewardTierId: string | null) {
  return requestJson(
    "/api/checkout/sessions",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rewardTierId }),
    },
    isCheckoutSession,
    "Sandbox checkout is temporarily unavailable.",
  );
}

export function cartQueryOptions() {
  return queryOptions({
    queryKey: CART_QUERY_KEY,
    queryFn: ({ signal }) => getCart(signal),
  });
}

export function cartErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function cartErrorRetryable(error: unknown): boolean {
  return error instanceof CartApiError ? error.retryable : true;
}

export function isConfirmedCartFailure(error: unknown): boolean {
  return error instanceof CartApiError && error.outcome === "confirmed";
}
