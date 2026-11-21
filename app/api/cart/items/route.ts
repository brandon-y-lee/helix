import {
  addCartItem,
  removeCartItem,
  setCartItemQuantity,
} from "@/lib/cart/server";
import { cartErrorResponse, cartResponse } from "@/lib/cart/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function readBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const parsed = await request.json();
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    const body = await readBody(request);
    const slug = typeof body.slug === "string" ? body.slug : "";
    const variantId = typeof body.variantId === "string" ? body.variantId : "";
    const quantity = typeof body.quantity === "number" ? body.quantity : 1;

    return cartResponse(request, await addCartItem({ slug, variantId, quantity }));
  } catch (error) {
    return cartErrorResponse({
      error,
      request,
      route: "/api/cart/items",
      startedAt,
    });
  }
}

export async function PATCH(request: Request) {
  const startedAt = Date.now();
  try {
    const body = await readBody(request);
    const lineId = typeof body.lineId === "string" ? body.lineId : "";
    const quantity = typeof body.quantity === "number" ? body.quantity : 0;

    return cartResponse(request, await setCartItemQuantity(lineId, quantity));
  } catch (error) {
    return cartErrorResponse({
      error,
      request,
      route: "/api/cart/items",
      startedAt,
    });
  }
}

export async function DELETE(request: Request) {
  const startedAt = Date.now();
  try {
    const body = await readBody(request);
    const lineId = typeof body.lineId === "string" ? body.lineId : "";

    return cartResponse(request, await removeCartItem(lineId));
  } catch (error) {
    return cartErrorResponse({
      error,
      request,
      route: "/api/cart/items",
      startedAt,
    });
  }
}
