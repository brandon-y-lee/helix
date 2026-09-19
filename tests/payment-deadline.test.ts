// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getPaymentDeadlineRemainingMs,
  paymentDeadlineFetch,
  PaymentDeadlineExceededError,
  withPaymentDeadline,
} from "@/lib/payments/deadline";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("hosted payment execution deadline", () => {
  it("aborts a slow response body after headers have arrived and awaits its failure", async () => {
    vi.useFakeTimers();
    const request = vi.fn<typeof fetch>(async (_input, init) => new Response(new ReadableStream({
      start(controller) {
        init?.signal?.addEventListener("abort", () => controller.error(init.signal?.reason), { once: true });
        controller.enqueue(new TextEncoder().encode('{"incomplete":'));
      },
    })));
    vi.stubGlobal("fetch", request);
    const pending = withPaymentDeadline({ deadlineAtMs: Date.now() + 100, now: Date.now }, async () => {
      const response = await paymentDeadlineFetch("https://provider.example.test/payment");
      return response.json();
    });
    const outcome = expect(pending).rejects.toBeInstanceOf(PaymentDeadlineExceededError);

    await vi.advanceTimersByTimeAsync(100);
    await outcome;

    expect(request).toHaveBeenCalledOnce();
    expect(request.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cannot extend an outer execution deadline by entering a longer inner scope", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async (_input, init) => new Response(new ReadableStream({
      start(controller) {
        init?.signal?.addEventListener("abort", () => controller.error(init.signal?.reason), { once: true });
      },
    }))));
    let failure: unknown;
    const pending = withPaymentDeadline({ deadlineAtMs: Date.now() + 10, now: Date.now }, () =>
      withPaymentDeadline({ deadlineAtMs: Date.now() + 100, now: Date.now }, async () =>
        (await paymentDeadlineFetch("https://provider.example.test/payment")).json()),
    ).catch((error: unknown) => { failure = error; });

    await vi.advanceTimersByTimeAsync(10);
    const stoppedAtOuterDeadline = failure instanceof PaymentDeadlineExceededError;
    await vi.advanceTimersByTimeAsync(100);
    await pending;

    expect(stoppedAtOuterDeadline).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps deadline exhaustion visible when an SDK converts the abort into an error result", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async (_input, init) => new Response(new ReadableStream({
      start(controller) {
        init?.signal?.addEventListener("abort", () => controller.error(init.signal?.reason), { once: true });
      },
    }))));
    const pending = withPaymentDeadline({ deadlineAtMs: Date.now() + 100, now: Date.now }, async () => {
      try {
        return await (await paymentDeadlineFetch("https://provider.example.test/payment")).json();
      } catch {
        return { error: "SDK converted the transport failure" };
      }
    });
    const outcome = pending.catch((error: unknown) => error);

    await vi.advanceTimersByTimeAsync(100);
    expect(await outcome).toBeInstanceOf(PaymentDeadlineExceededError);
  });

  it("keeps concurrent request deadlines independent", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async (_input, init) => new Response(new ReadableStream({
      start(controller) {
        init?.signal?.addEventListener("abort", () => controller.error(init.signal?.reason), { once: true });
      },
    }))));
    const stopped: string[] = [];
    const run = (name: string, durationMs: number) => withPaymentDeadline({
      deadlineAtMs: Date.now() + durationMs, now: Date.now,
    }, async () => (await paymentDeadlineFetch("https://provider.example.test/payment")).json())
      .catch((error: unknown) => {
        expect(error).toBeInstanceOf(PaymentDeadlineExceededError);
        stopped.push(name);
      });
    const first = run("first", 100);
    const second = run("second", 200);

    await vi.advanceTimersByTimeAsync(100);
    expect(stopped).toEqual(["first"]);
    expect(getPaymentDeadlineRemainingMs()).toBe(Infinity);
    await vi.advanceTimersByTimeAsync(100);
    await Promise.all([first, second]);
    expect(stopped).toEqual(["first", "second"]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("preserves a caller abort without misreporting deadline exhaustion", async () => {
    const caller = new AbortController();
    const failure = new Error("Caller stopped its request");
    vi.stubGlobal("fetch", vi.fn<typeof fetch>((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
    })));
    const pending = withPaymentDeadline({ deadlineAtMs: performance.now() + 1_000 }, () =>
      paymentDeadlineFetch("https://provider.example.test/payment", { signal: caller.signal }));
    caller.abort(failure);
    await expect(pending).rejects.toBe(failure);
  });

  it("refuses an expired scope before any provider operation", async () => {
    const operation = vi.fn(async () => "unexpected");
    await expect(withPaymentDeadline({ deadlineAtMs: 100, now: () => 100 }, operation))
      .rejects.toBeInstanceOf(PaymentDeadlineExceededError);
    expect(operation).not.toHaveBeenCalled();
  });
});
