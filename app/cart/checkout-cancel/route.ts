import { NextResponse } from "next/server";
import { cancelPendingCheckoutFromCookie } from "@/lib/orders/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(): Promise<NextResponse> {
  try {
    await cancelPendingCheckoutFromCookie();
  } catch {
    return new NextResponse(null, {
      status: 204,
      headers: { "cache-control": "no-store" },
    });
  }

  return new NextResponse(null, {
    status: 204,
    headers: { "cache-control": "no-store" },
  });
}
