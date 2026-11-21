import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { GUEST_CART_COOKIE } from "@/lib/customer-state-identifiers";

const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const valid = (raw?: string): raw is string => !!raw && /^[A-Za-z0-9_-]{43}$/.test(raw) &&
  Buffer.from(raw, "base64url").toString("base64url") === raw;
const options = () => ({ httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const,
  path: "/", maxAge: 24 * 60 * 60 });
const receiptName = (sessionId: string) => "helix_order_receipt_" + hash(sessionId).slice(0, 32);

/** Establish the per-generation secret on a separate response before reserving a guest's stock. */
export async function prepareBusinessGuestReceipt(cartId: string, generation: string) {
  const jar = await cookies();
  const guest = jar.get(GUEST_CART_COOKIE)?.value;
  if (!valid(guest)) throw new Error("Guest checkout identity is unavailable.");
  const name = "helix_checkout_attempt_" + hash(cartId + "/" + generation).slice(0, 32);
  const receipt = jar.get(name)?.value;
  if (!valid(receipt)) {
    jar.set(name, randomBytes(32).toString("base64url"), options());
    return null;
  }
  return { guestHash: hash(guest), receiptHash: hash(receipt),
    bindSession: (sessionId: string) => jar.set(receiptName(sessionId), receipt, options()) };
}

export async function readBusinessReceiptTokenHash(sessionId: string): Promise<string | null> {
  const raw = (await cookies()).get(receiptName(sessionId))?.value;
  return valid(raw) ? hash(raw) : null;
}
