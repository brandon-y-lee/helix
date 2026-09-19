import { NextResponse } from "next/server";
import { resolveCheckoutOrigin } from "@/lib/checkout/origin";
import { rewardTierById, type RewardTier } from "@/lib/rewards/rules";

const MAX_CHECKOUT_REQUEST_BYTES = 4 * 1024;

export class CheckoutRequestError extends Error {
  constructor(message: string, readonly status: 400 | 403 | 413) {
    super(message);
    this.name = "CheckoutRequestError";
  }
}

export function assertCheckoutRequestOrigin(request: Request): void {
  if (request.headers.get("origin") !== resolveCheckoutOrigin()) {
    throw new CheckoutRequestError("Checkout request is not allowed.", 403);
  }
}

async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^application\/json(?:\s*;\s*charset=(?:utf-8|"utf-8"))?$/i.test(contentType)) {
    throw new CheckoutRequestError("Invalid checkout request.", 400);
  }
  const reader = request.body?.getReader();
  if (!reader) throw new CheckoutRequestError("Invalid checkout request.", 400);
  try {
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_CHECKOUT_REQUEST_BYTES) {
        void reader.cancel().catch(() => undefined);
        throw new CheckoutRequestError("Checkout request is too large.", 413);
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const body: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("Expected object");
    }
    return body as Record<string, unknown>;
  } catch (error) {
    if (error instanceof CheckoutRequestError) throw error;
    throw new CheckoutRequestError("Invalid checkout request.", 400);
  } finally {
    reader.releaseLock();
  }
}

export async function readCheckoutRequest(request: Request): Promise<{
  rewardTierId: RewardTier["id"] | null;
}> {
  const body = await readJsonObject(request);
  if (Object.keys(body).some((key) => key !== "rewardTierId")) {
    throw new CheckoutRequestError("Invalid checkout request.", 400);
  }
  if (body.rewardTierId === undefined || body.rewardTierId === null) {
    return { rewardTierId: null };
  }
  const tier = rewardTierById(body.rewardTierId);
  if (!tier) throw new CheckoutRequestError("Invalid checkout request.", 400);
  return { rewardTierId: tier.id };
}

export async function readCheckoutCancellationRequest(request: Request): Promise<void> {
  const body = await readJsonObject(request);
  if (Object.keys(body).length > 0) {
    throw new CheckoutRequestError("Invalid checkout request.", 400);
  }
}

export function checkoutResponseHeaders(retryAfterSeconds?: number): Record<string, string> {
  const headers: Record<string, string> = { "cache-control": "no-store" };
  if (retryAfterSeconds !== undefined && Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    headers["retry-after"] = String(Math.min(60, Math.max(1, Math.ceil(retryAfterSeconds))));
  }
  return headers;
}

export function checkoutRequestErrorResponse(error: unknown): NextResponse | null {
  if (!(error instanceof CheckoutRequestError)) return null;
  return NextResponse.json(
    { error: error.message },
    { status: error.status, headers: checkoutResponseHeaders() },
  );
}
