import "server-only";
import { parseProviderRetryAfter } from "@/lib/payments/retry-policy";
import type { PaymentIncidentCode } from "@/lib/payments/inbox";
import { isPaymentDeadlineError } from "@/lib/payments/deadline";
import { CheckoutConfigError } from "@/lib/checkout/config";

export class PaymentProviderReadError extends Error {
  constructor(readonly code: "provider_unavailable" | "provider_identity_mismatch" | "provider_schema_mismatch",
    readonly retryAfterSeconds?: number) {
    super("Payment provider facts could not be verified.");
    this.name = "PaymentProviderReadError";
  }
}

export function sanitizedPaymentProviderError(error: unknown): PaymentProviderReadError {
  if (error instanceof PaymentProviderReadError) return error;
  const candidate = error !== null && typeof error === "object"
    ? error as { statusCode?: unknown; headers?: unknown } : {};
  const headers = candidate.headers !== null && typeof candidate.headers === "object"
    ? candidate.headers as Record<string, unknown> : {};
  const code = candidate.statusCode === 401 || candidate.statusCode === 403 ? "provider_identity_mismatch"
    : candidate.statusCode === 400 ? "provider_schema_mismatch" : "provider_unavailable";
  return new PaymentProviderReadError(code, parseProviderRetryAfter(headers["retry-after"]));
}

export function classifyPaymentFailure(error: unknown): {
  disposition: "pending" | "quarantined"; code: PaymentIncidentCode; retryAfterSeconds?: number;
} {
  if (isPaymentDeadlineError(error)) return { disposition: "pending", code: "worker_deadline" };
  if (error instanceof CheckoutConfigError) return { disposition: "quarantined", code: "provider_identity_mismatch" };
  if (error instanceof Error && "recovery" in error && error.recovery instanceof PaymentProviderReadError) {
    return classifyPaymentFailure(error.recovery);
  }
  if (error instanceof PaymentProviderReadError) {
    return { disposition: error.code === "provider_unavailable" ? "pending" : "quarantined",
      code: error.code, ...(error.retryAfterSeconds ? { retryAfterSeconds: error.retryAfterSeconds } : {}) };
  }
  return { disposition: "pending", code: "storage_unavailable" };
}
