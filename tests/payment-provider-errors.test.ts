import { describe, expect, it } from "vitest";
import { classifyPaymentFailure, sanitizedPaymentProviderError } from "@/lib/payments/provider-errors";
import { CheckoutConfigError } from "@/lib/checkout/config";
import { PaymentDeadlineExceededError } from "@/lib/payments/deadline";

describe("safe payment recovery errors", () => {
  it("retains only bounded retry timing from a provider outage", () => {
    const error = sanitizedPaymentProviderError({ statusCode: 429, headers: { "retry-after": "7200" },
      message: "private@example.test sk_test_secret", raw: { customer: "secret" } });
    expect(classifyPaymentFailure(error)).toEqual({ disposition: "pending", code: "provider_unavailable", retryAfterSeconds: 7200 });
    expect(JSON.stringify(error)).not.toContain("secret");
    expect(error.message).not.toContain("private");
  });
  it("quarantines authorization and mode errors instead of repeatedly using invalid credentials", () => {
    for (const statusCode of [401, 403]) {
      expect(classifyPaymentFailure(sanitizedPaymentProviderError({ statusCode })))
        .toEqual({ disposition: "quarantined", code: "provider_identity_mismatch" });
    }
    expect(classifyPaymentFailure(new CheckoutConfigError("live_mode_blocked", "live key details")))
      .toEqual({ disposition: "quarantined", code: "provider_identity_mismatch" });
    expect(classifyPaymentFailure(new CheckoutConfigError("checkout_misconfigured", "bad account")))
      .toEqual({ disposition: "quarantined", code: "provider_identity_mismatch" });
    expect(classifyPaymentFailure(new PaymentDeadlineExceededError()))
      .toEqual({ disposition: "pending", code: "worker_deadline" });
  });
});
