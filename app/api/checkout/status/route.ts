import { NextResponse } from "next/server";
import {
  assertCheckoutRequestOrigin,
  checkoutRequestErrorResponse,
  checkoutResponseHeaders,
  readCheckoutCancellationRequest,
} from "@/lib/checkout/request";
import {
  checkoutErrorResponseMessage,
  getOrderConfirmationBySession,
} from "@/lib/orders/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function privateHeaders(retryAfterSeconds?: number): Record<string, string> {
  return {
    ...checkoutResponseHeaders(retryAfterSeconds),
    "cache-control": "private, no-store",
    "referrer-policy": "no-referrer",
  };
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    assertCheckoutRequestOrigin(request);
    await readCheckoutCancellationRequest(request);
    const ids = new URL(request.url).searchParams.getAll("session_id");
    const sessionId = ids[0] ?? "";
    if (ids.length !== 1 || !/^cs_[A-Za-z0-9_]{1,200}$/.test(sessionId)) {
      return NextResponse.json({ status: "unavailable" }, { status: 404, headers: privateHeaders() });
    }
    const confirmation = await getOrderConfirmationBySession(sessionId);
    if (!confirmation) {
      return NextResponse.json({ status: "unavailable" }, { status: 404, headers: privateHeaders() });
    }
    return NextResponse.json(
      { status: confirmation.state, retryAfterSeconds: confirmation.retryAfterSeconds },
      { headers: privateHeaders() },
    );
  } catch (error) {
    const requestError = checkoutRequestErrorResponse(error);
    if (requestError) {
      for (const [name, value] of Object.entries(privateHeaders())) requestError.headers.set(name, value);
      return requestError;
    }
    const { retryAfterSeconds } = checkoutErrorResponseMessage(error);
    return NextResponse.json(
      { status: "unavailable" },
      { status: 503, headers: privateHeaders(retryAfterSeconds) },
    );
  }
}
