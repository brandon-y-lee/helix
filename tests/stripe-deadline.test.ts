// @vitest-environment node

import https from "node:https";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getStripeClient } from "@/lib/stripe/server";
import { isPaymentDeadlineError, withPaymentDeadline } from "@/lib/payments/deadline";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Stripe payment execution deadline", () => {
  it("aborts a cached SDK client's stalled response body without a second request", async () => {
    vi.useFakeTimers();
    // A regression to the default Node transport must fail without contacting Stripe.
    vi.spyOn(https, "request").mockImplementation(() => { throw new Error("Unexpected Node request"); });
    let body: ReadableStreamDefaultController<Uint8Array> | undefined;
    const request = vi.fn<typeof fetch>(async (_input, init) => new Response(new ReadableStream({
      start(controller) {
        body = controller;
        init?.signal?.addEventListener("abort", () => controller.error(init.signal?.reason), { once: true });
      },
    })));
    vi.stubGlobal("fetch", request);
    const stripe = getStripeClient({
      environment: "sandbox", accountId: "acct_1Tm9WRFEzyaKzdmq", secretKey: "sk_test_deadline_fixture",
      webhookSecret: "whsec_fixture", standardShippingRateId: null, automaticTaxEnabled: false,
      rewardCouponIds: { points200: null, points400: null, points600: null, referral15: null },
    });
    let stopped = false;
    const pending = withPaymentDeadline({ deadlineAtMs: Date.now() + 100, now: Date.now }, () =>
      stripe.accounts.retrieve(null),
    ).catch((error: unknown) => { stopped = isPaymentDeadlineError(error); });

    await vi.advanceTimersByTimeAsync(100);
    const stoppedAtDeadline = stopped;
    if (!stopped) body?.error(new DOMException("Stop synthetic response", "AbortError"));
    await pending;

    expect(stoppedAtDeadline).toBe(true);
    expect(request).toHaveBeenCalledOnce();
    expect(https.request).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
