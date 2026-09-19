import { PaymentOperationsError } from "@/lib/admin/payments/errors";
import type { PaymentReplayInput } from "@/lib/admin/payments/types";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REPLAY_FIELDS = ["itemId", "expectedVersion", "reason", "requestId", "dryRun"];

export function parsePaymentReplayInput(input: unknown): PaymentReplayInput {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new PaymentOperationsError("invalid_request", 400);
  }
  const value = input as Record<string, unknown>;
  if (
    Object.keys(value).some((key) => !REPLAY_FIELDS.includes(key)) ||
    typeof value.itemId !== "string" || !UUID_PATTERN.test(value.itemId) ||
    !Number.isSafeInteger(value.expectedVersion) ||
    (value.expectedVersion as number) < 1 ||
    (value.expectedVersion as number) > 2147483647 ||
    typeof value.reason !== "string" || value.reason.trim().length < 10 ||
    value.reason.length > 240 || /[\u0000-\u001f\u007f]/.test(value.reason) ||
    typeof value.requestId !== "string" || !UUID_PATTERN.test(value.requestId) ||
    (value.dryRun !== undefined && typeof value.dryRun !== "boolean")
  ) {
    throw new PaymentOperationsError("invalid_request", 400);
  }
  return {
    itemId: value.itemId.toLowerCase(),
    expectedVersion: value.expectedVersion as number,
    reason: value.reason.trim(),
    requestId: value.requestId.toLowerCase(),
    dryRun: value.dryRun ?? true,
  };
}
