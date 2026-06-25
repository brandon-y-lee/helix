import { NextResponse } from "next/server";
import {
  checkoutErrorResponseMessage,
  createStripeCheckoutSession,
} from "@/lib/orders/server";

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

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = await readBody(request);
    const result = await createStripeCheckoutSession({
      rewardTierId: body.rewardTierId,
    });
    return NextResponse.json(result);
  } catch (error) {
    const { message, status } = checkoutErrorResponseMessage(error);
    return NextResponse.json({ error: message }, { status });
  }
}
