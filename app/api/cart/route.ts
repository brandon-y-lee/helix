import { NextResponse } from "next/server";
import { clearCart, getCartState } from "@/lib/cart/server";
import { CartError } from "@/lib/cart/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function errorResponse(error: unknown) {
  const message =
    error instanceof CartError
      ? error.message
      : "Cart is temporarily unavailable. Try again in a moment.";
  const status = error instanceof CartError ? 400 : 500;
  return NextResponse.json({ error: message }, { status });
}

export async function GET() {
  try {
    return NextResponse.json(await getCartState());
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE() {
  try {
    return NextResponse.json(await clearCart());
  } catch (error) {
    return errorResponse(error);
  }
}
