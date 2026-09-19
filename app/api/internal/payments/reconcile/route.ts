import { NextResponse } from "next/server";
import { assertEmptyPaymentRequest, authenticatePaymentWorker, paymentResponseHeaders, PaymentRequestError } from "@/lib/payments/request";
import { runPaymentWorker } from "@/lib/payments/worker";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request): Promise<NextResponse> {
  try {
    authenticatePaymentWorker(request);
    if (new URL(request.url).search) throw new PaymentRequestError(400);
    await assertEmptyPaymentRequest(request, 1024);
    const result = await runPaymentWorker();
    return NextResponse.json({ ok: true, ...result }, { headers: paymentResponseHeaders() });
  } catch (error) {
    const status = error instanceof PaymentRequestError ? error.status : 503;
    return NextResponse.json({ error: "Payment worker request could not be completed." }, {
      status, headers: paymentResponseHeaders(),
    });
  }
}

function methodNotAllowed(): NextResponse {
  return new NextResponse(null, { status: 405, headers: { ...paymentResponseHeaders(), allow: "POST" } });
}

export const GET = methodNotAllowed;
export const DELETE = methodNotAllowed;
export const HEAD = methodNotAllowed;
export const OPTIONS = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const PUT = methodNotAllowed;
