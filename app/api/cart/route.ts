import { NextResponse } from "next/server";
import { clearCart, getCartState } from "@/lib/cart/server";
import { cartErrorResponse } from "@/lib/cart/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const startedAt = Date.now();
  try {
    return NextResponse.json(await getCartState());
  } catch (error) {
    return cartErrorResponse({
      error,
      request,
      route: "/api/cart",
      startedAt,
    });
  }
}

export async function DELETE(request: Request) {
  const startedAt = Date.now();
  try {
    return NextResponse.json(await clearCart());
  } catch (error) {
    return cartErrorResponse({
      error,
      request,
      route: "/api/cart",
      startedAt,
    });
  }
}
