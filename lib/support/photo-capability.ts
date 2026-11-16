import "server-only";
import { createHash } from "node:crypto";
import { SupportError } from "@/lib/support/request";

/** Submission capabilities are random 32-byte secrets; only their digest is stored. */
export function hashSupportPhotoCapability(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(value)
    || Buffer.from(value, "base64url").length !== 32 || Buffer.from(value, "base64url").toString("base64url") !== value) {
    throw new SupportError("invalid_support_input");
  }
  return createHash("sha256").update(value).digest("hex");
}
