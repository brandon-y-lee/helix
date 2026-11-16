import { NextResponse } from "next/server";
import {
  assertCheckoutRequestOrigin,
  checkoutRequestErrorResponse,
  checkoutResponseHeaders,
  readCheckoutCancellationRequest,
} from "@/lib/checkout/request";
import {
  cancelPendingCheckoutFromCookie,
  checkoutErrorResponseMessage,
} from "@/lib/orders/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    assertCheckoutRequestOrigin(request);
    const body = await readCheckoutCancellationRequest(request);
    const result = await cancelPendingCheckoutFromCookie(undefined, {
      recoverOriginChange: body.recoverOriginChange, requestOrigin: new URL(request.url).origin,
    });
    const status = ["cancelled", "paid", "processing"].includes(result.status)
      ? result.status
      : "unavailable";
    return NextResponse.json(
      { status },
      { headers: checkoutResponseHeaders() },
    );
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
