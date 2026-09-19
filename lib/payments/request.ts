import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { resolveCheckoutOrigin } from "@/lib/checkout/origin";

type PaymentRequestStatus = 400 | 401 | 403 | 413 | 503;

const REQUEST_ERRORS: Record<PaymentRequestStatus, string> = {
  400: "Invalid payment request.",
  401: "Payment request is not authenticated.",
  403: "Payment request is not allowed.",
  413: "Payment request is too large.",
  503: "Payment service is temporarily unavailable.",
};

export class PaymentRequestError extends Error {
  constructor(readonly status: PaymentRequestStatus) {
    super(REQUEST_ERRORS[status]);
    this.name = "PaymentRequestError";
  }
}

export async function readPaymentRequestBytes(
  request: Request,
  maxBytes: number,
): Promise<Buffer> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) throw new PaymentRequestError(503);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    reader = request.body?.getReader();
    if (!reader) return Buffer.alloc(0);
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new PaymentRequestError(413);
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks, size);
  } catch (error) {
    if (error instanceof PaymentRequestError) throw error;
    throw new PaymentRequestError(400);
  } finally {
    reader?.releaseLock();
  }
}

export async function readPaymentJsonObject(
  request: Request,
  maxBytes: number,
): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^application\/json(?:\s*;\s*charset=(?:utf-8|"utf-8"))?$/i.test(contentType)) {
    throw new PaymentRequestError(400);
  }
  const bytes = await readPaymentRequestBytes(request, maxBytes);
  try {
    const body: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      throw new PaymentRequestError(400);
    }
    return body as Record<string, unknown>;
  } catch {
    throw new PaymentRequestError(400);
  }
}

export async function assertEmptyPaymentRequest(request: Request, maxBytes = 1024): Promise<void> {
  const body = await readPaymentJsonObject(request, maxBytes);
  if (Object.keys(body).length !== 0) throw new PaymentRequestError(400);
}

function isCanonicalWorkerSecret(value: string): boolean {
  return value.length === 43 && /^[A-Za-z0-9_-]{43}$/.test(value)
    && Buffer.from(value, "base64url").toString("base64url") === value;
}

export function authenticatePaymentWorker(request: Request): void {
  const expected = process.env.PAYMENT_WORKER_SECRET ?? "";
  if (!isCanonicalWorkerSecret(expected) || [
    "SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET", "CATALOG_WEBHOOK_SECRET", "SUPABASE_CATALOG_WEBHOOK_SECRET",
    "VERCEL_AUTOMATION_BYPASS_SECRET",
  ].some((name) => process.env[name]?.trim() === expected)) {
    throw new PaymentRequestError(503);
  }
  const authorization = request.headers.get("authorization") ?? "";
  if (authorization.length !== 50 || !/^Bearer [A-Za-z0-9_-]{43}$/i.test(authorization)) {
    throw new PaymentRequestError(401);
  }
  const actual = authorization.slice(7);
  if (!isCanonicalWorkerSecret(actual)) throw new PaymentRequestError(401);
  const expectedDigest = createHash("sha256").update(expected).digest();
  const actualDigest = createHash("sha256").update(actual).digest();
  if (!timingSafeEqual(expectedDigest, actualDigest)) throw new PaymentRequestError(401);
}

export function assertPaymentRequestOrigin(request: Request): void {
  let expectedOrigin: string;
  try {
    expectedOrigin = resolveCheckoutOrigin();
  } catch {
    throw new PaymentRequestError(503);
  }
  if (request.headers.get("origin") !== expectedOrigin) throw new PaymentRequestError(403);
}

export function paymentResponseHeaders(): Record<string, string> {
  return { "cache-control": "private, no-store", "referrer-policy": "no-referrer" };
}
