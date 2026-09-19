import { NextResponse } from "next/server";
import { ADMIN_CAPABILITIES, requireAdminCapability } from "@/lib/admin/capabilities";
import { CatalogAdminError } from "@/lib/admin/catalog/errors";
import { PaymentOperationsError } from "@/lib/admin/payments/errors";
import { parsePaymentReplayInput } from "@/lib/admin/payments/input";
import { replayPaymentOperation } from "@/lib/admin/payments/service";
import {
  assertPaymentRequestOrigin,
  paymentResponseHeaders,
  PaymentRequestError,
  readPaymentJsonObject,
} from "@/lib/payments/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  const headers = paymentResponseHeaders();
  try {
    assertPaymentRequestOrigin(request);
    await requireAdminCapability(ADMIN_CAPABILITIES.paymentsManage);
    const command = parsePaymentReplayInput(await readPaymentJsonObject(request, 4 * 1024));
    return NextResponse.json(await replayPaymentOperation(command), { headers });
  } catch (error) {
    if (error instanceof PaymentOperationsError) {
      return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status, headers });
    }
    if (error instanceof CatalogAdminError) {
      const status = error.status === 401 || error.status === 403 ? error.status : 503;
      return NextResponse.json({ error: {
        code: status === 503 ? "operations_unavailable" : "capability_required",
        message: status === 503 ? "Payment operations are temporarily unavailable." : "Payment operations access is required.",
      } }, { status, headers });
    }
    if (error instanceof PaymentRequestError) {
      return NextResponse.json({ error: { code: "invalid_request", message: error.message } }, { status: error.status, headers });
    }
    return NextResponse.json({ error: {
      code: "operations_unavailable",
      message: "Payment operations are temporarily unavailable.",
    } }, { status: 503, headers });
  }
}
