import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { CheckoutAdmissionError } from "@/lib/checkout/admission";
import { CHECKOUT_RECEIPT_COOKIE, GUEST_CART_COOKIE } from "@/lib/customer-state-identifiers";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function validToken(token: string | undefined): token is string {
  return typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token)
    && Buffer.from(token, "base64url").toString("base64url") === token;
}

function decision(value: unknown): value is {
  allowed: boolean; reused: boolean; expires_at: string | null; retry_after_seconds: number;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  return typeof data.allowed === "boolean" && typeof data.reused === "boolean"
    && (data.expires_at === null || typeof data.expires_at === "string")
    && typeof data.retry_after_seconds === "number" && Number.isInteger(data.retry_after_seconds)
    && data.retry_after_seconds >= 0 && data.retry_after_seconds <= 60;
}

/** Bind the guest's private receipt before exposing any payable Checkout URL. */
export async function ensureGuestReceiptBinding(input: { orderId: string; accountId: string }): Promise<void> {
  try {
    await bindReceipt(input);
  } catch (error) {
    if (error instanceof CheckoutAdmissionError) throw error;
    throw new CheckoutAdmissionError(503);
  }
}

async function bindReceipt(input: { orderId: string; accountId: string }): Promise<void> {
  const cookieStore = await cookies();
  const guestToken = cookieStore.get(GUEST_CART_COOKIE)?.value;
  if (!validToken(guestToken)) throw new CheckoutAdmissionError(503);
  const receiptToken = cookieStore.get(CHECKOUT_RECEIPT_COOKIE)?.value;
  const existingToken = validToken(receiptToken) ? receiptToken : null;
  const candidate = randomBytes(32).toString("base64url");
  const { data, error } = await createSupabaseAdminClient().rpc("bind_guest_checkout_receipt", {
    p_account_id: input.accountId,
    p_order_id: input.orderId,
    p_guest_token_hash: tokenHash(guestToken),
    p_existing_token_hash: existingToken ? tokenHash(existingToken) : null,
    p_candidate_token_hash: tokenHash(candidate),
  });
  if (error || !decision(data)) throw new CheckoutAdmissionError(503);
  if (!data.allowed) {
    if (data.reused || data.expires_at !== null) throw new CheckoutAdmissionError(503);
    throw new CheckoutAdmissionError(data.retry_after_seconds > 0 ? 429 : 503, data.retry_after_seconds || 1);
  }
  if (!data.expires_at
    || (data.reused && !existingToken) || data.retry_after_seconds !== 0) throw new CheckoutAdmissionError(503);
  const expiry = new Date(data.expires_at);
  const remaining = expiry.getTime() - Date.now();
  // The database owns the deadline; tolerate one minute of host clock skew.
  if (!Number.isFinite(remaining) || remaining <= 0 || remaining > 86_460_000) throw new CheckoutAdmissionError(503);
  if (data.reused) return;
  cookieStore.set(CHECKOUT_RECEIPT_COOKIE, candidate, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiry,
  });
}

/** Read-only: suitable for both the private page and its status route. */
export async function authorizeCheckoutReceipt(input: {
  orderId: string;
  sessionId: string;
  accountId: string;
  verifiedUserId: string | null;
}): Promise<boolean> {
  try {
    const cookieStore = await cookies();
    const receiptToken = cookieStore.get(CHECKOUT_RECEIPT_COOKIE)?.value;
    const guestToken = cookieStore.get(GUEST_CART_COOKIE)?.value;
    const receiptHash = validToken(receiptToken) ? tokenHash(receiptToken) : null;
    const guestHash = validToken(guestToken) ? tokenHash(guestToken) : null;
    if (!input.verifiedUserId && !receiptHash && !guestHash) return false;
    const { data, error } = await createSupabaseAdminClient().rpc("authorize_checkout_receipt", {
      p_account_id: input.accountId,
      p_order_id: input.orderId,
      p_session_id: input.sessionId,
      p_user_id: input.verifiedUserId,
      p_receipt_token_hash: receiptHash,
      p_guest_token_hash: guestHash,
    });
    return !error && data === true;
  } catch {
    return false;
  }
}
