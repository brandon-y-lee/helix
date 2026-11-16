import "server-only";
import { assertEmailEnvironment, isEmailAddress, type EmailEnvironment } from "@/lib/email/config";
import { SupportError } from "@/lib/support/request";

/** Receiving is a separately qualified mailbox, never the website or sending identity. */
export function supportReceivingAddress(env: EmailEnvironment): string | null {
  assertEmailEnvironment(env);
  const address = env.HELIX_SUPPORT_RECEIVING_ADDRESS?.trim().toLowerCase();
  if (!address) return null;
  const domain = address.split("@")[1];
  if (!isEmailAddress(address) || address.length > 254 || !domain
    || domain === "vercel.app" || domain.endsWith(".vercel.app") || domain === "resend.dev") {
    throw new SupportError("support_unavailable");
  }
  return address;
}
