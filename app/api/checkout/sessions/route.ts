import { NextResponse } from "next/server";
import {
  assertCheckoutRequestOrigin,
  checkoutRequestErrorResponse,
  checkoutResponseHeaders,
  readCheckoutRequest,
} from "@/lib/checkout/request";
import {
  checkoutErrorResponseMessage,
  createStripeCheckoutSession,
} from "@/lib/orders/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    assertCheckoutRequestOrigin(request);
    const body = await readCheckoutRequest(request);
    const result = await createStripeCheckoutSession({
      rewardTierId: body.rewardTierId,
    });
    return NextResponse.json(result, { headers: checkoutResponseHeaders() });
  } catch (error) {
    const requestError = checkoutRequestErrorResponse(error);
    if (requestError) return requestError;
    const { message, status, retryAfterSeconds } = checkoutErrorResponseMessage(error);
    return NextResponse.json(
      { error: message },
      { status, headers: checkoutResponseHeaders(retryAfterSeconds) },
    );
  }
}
