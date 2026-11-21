import { NextResponse } from "next/server";
import { readCheckoutStorefrontForOrigin } from "@/lib/checkout/storefront";
import { CartError, type CartState } from "@/lib/cart/types";
import {
  isSupabaseNetworkError,
  logSupabaseUnavailable,
} from "@/lib/supabase/network";

const CART_SERVICE_UNAVAILABLE_CODE = "CART_SERVICE_UNAVAILABLE";
const CART_SERVICE_UNAVAILABLE_MESSAGE =
  "Your cart is temporarily unavailable.";

export async function cartResponse(request: Request, cart: CartState) {
  // A completed cart mutation stays successful if checkout availability cannot be read.
  const checkout = await readCheckoutStorefrontForOrigin(new URL(request.url).origin).catch(() => ({
    mode: "closed" as const,
    admissionOpen: false,
  }));
  return NextResponse.json({ ...cart, checkout }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

function requestId(request: Request): string {
  return request.headers.get("x-request-id") ?? crypto.randomUUID();
}

export function cartErrorResponse({
  error,
  request,
  route,
  startedAt,
}: {
  error: unknown;
  request: Request;
  route: string;
  startedAt: number;
}) {
  if (isSupabaseNetworkError(error)) {
    logSupabaseUnavailable(error, {
      operation: "cart.request",
      route,
      runtime: "nodejs",
      requestId: requestId(request),
      elapsedMs: Date.now() - startedAt,
    });

    return NextResponse.json(
      {
        error: {
          code: CART_SERVICE_UNAVAILABLE_CODE,
          message: CART_SERVICE_UNAVAILABLE_MESSAGE,
          retryable: true,
        },
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "private, no-store",
          "Retry-After": "5",
        },
      },
    );
  }

  const message =
    error instanceof CartError
      ? error.message
      : "Cart is temporarily unavailable. Try again in a moment.";
  const status = error instanceof CartError ? 400 : 500;
  return NextResponse.json({ error: message }, { status });
}
