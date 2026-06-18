import { NextResponse } from "next/server";
import {
  addCartItem,
  removeCartItem,
  setCartItemQuantity,
} from "@/lib/cart/server";
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

async function readBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const parsed = await request.json();
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export async function POST(request: Request) {
  try {
    const body = await readBody(request);
    const slug = typeof body.slug === "string" ? body.slug : "";
    const variantId = typeof body.variantId === "string" ? body.variantId : "";
    const quantity = typeof body.quantity === "number" ? body.quantity : 1;

    return NextResponse.json(await addCartItem({ slug, variantId, quantity }));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await readBody(request);
    const lineId = typeof body.lineId === "string" ? body.lineId : "";
    const quantity = typeof body.quantity === "number" ? body.quantity : 0;

    return NextResponse.json(await setCartItemQuantity(lineId, quantity));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await readBody(request);
    const lineId = typeof body.lineId === "string" ? body.lineId : "";

    return NextResponse.json(await removeCartItem(lineId));
  } catch (error) {
    return errorResponse(error);
  }
}
