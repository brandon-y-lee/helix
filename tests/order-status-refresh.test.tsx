import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrderStatusRefresh } from "@/components/cart/OrderStatusRefresh";

const navigation = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));

describe("authorized pending Order status refresh", () => {
  const fetchStatus = vi.fn();
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-18T12:00:00Z"));
    navigation.refresh.mockReset();
    fetchStatus.mockReset();
    vi.stubGlobal("fetch", fetchStatus);
    window.history.replaceState({}, "", "/checkout/success?session_id=cs_test_receipt");
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("waits at least five seconds, then refreshes server rendering only after an authoritative state change", async () => {
    fetchStatus.mockResolvedValue(new Response(JSON.stringify({ status: "paid", retryAfterSeconds: 5 })));
    render(<OrderStatusRefresh retryAfterSeconds={1} />);
    await act(() => vi.advanceTimersByTimeAsync(4999));
    expect(fetchStatus).not.toHaveBeenCalled();
    expect(navigation.refresh).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(fetchStatus).toHaveBeenCalledWith("/api/checkout/status?session_id=cs_test_receipt", expect.objectContaining({
      method: "POST", body: "{}", credentials: "same-origin", cache: "no-store", referrerPolicy: "no-referrer",
    }));
    expect(navigation.refresh).toHaveBeenCalledOnce();
    await act(() => vi.advanceTimersByTimeAsync(120000));
    expect(fetchStatus).toHaveBeenCalledOnce();
    expect(screen.getByRole("status")).toHaveTextContent("Payment status changed");
  });

  it("backs off pending checks and stops after two minutes without claiming payment", async () => {
    fetchStatus.mockImplementation(async () => new Response(JSON.stringify({ status: "pending", retryAfterSeconds: 5 })));
    render(<OrderStatusRefresh retryAfterSeconds={5} />);
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(fetchStatus).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(9999));
    expect(fetchStatus).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(fetchStatus).toHaveBeenCalledTimes(2);
    await act(() => vi.advanceTimersByTimeAsync(105000));
    const requestsAtDeadline = fetchStatus.mock.calls.length;
    await act(() => vi.advanceTimersByTimeAsync(120000));
    expect(fetchStatus).toHaveBeenCalledTimes(requestsAtDeadline);
    expect(navigation.refresh).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("Automatic checking has paused");
  });

  it("pauses while hidden and resumes without an immediate burst", async () => {
    fetchStatus.mockImplementation(async () => new Response(JSON.stringify({ status: "pending", retryAfterSeconds: 5 })));
    render(<OrderStatusRefresh retryAfterSeconds={5} />);
    await act(() => vi.advanceTimersByTimeAsync(2000));
    act(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await act(() => vi.advanceTimersByTimeAsync(20000));
    expect(fetchStatus).not.toHaveBeenCalled();
    act(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await act(() => vi.advanceTimersByTimeAsync(4999));
    expect(fetchStatus).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(fetchStatus).toHaveBeenCalledOnce();
  });

  it("honors Retry-After during an outage and preserves the pending state", async () => {
    fetchStatus.mockImplementation(async () => new Response(JSON.stringify({ status: "unavailable" }), {
      status: 503, headers: { "retry-after": "60" },
    }));
    render(<OrderStatusRefresh retryAfterSeconds={5} />);
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(fetchStatus).toHaveBeenCalledOnce();
    await act(() => vi.advanceTimersByTimeAsync(59999));
    expect(fetchStatus).toHaveBeenCalledOnce();
    expect(navigation.refresh).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(fetchStatus).toHaveBeenCalledTimes(2);
  });

  it("honors the shared provider cooldown returned with a pending result", async () => {
    fetchStatus.mockImplementation(async () => new Response(JSON.stringify({ status: "pending", retryAfterSeconds: 30 })));
    render(<OrderStatusRefresh retryAfterSeconds={5} />);
    await act(() => vi.advanceTimersByTimeAsync(34999));
    expect(fetchStatus).toHaveBeenCalledOnce();
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(fetchStatus).toHaveBeenCalledTimes(2);
  });

  it.each(["exception", "failed", "cancelled", "refunded", "partially_refunded", "unavailable"])("stops when the authorized route returns %s", async (status) => {
    fetchStatus.mockImplementation(async () => new Response(JSON.stringify({ status }), { status: status === "unavailable" ? 404 : 200 }));
    render(<OrderStatusRefresh retryAfterSeconds={5} />);
    await act(() => vi.advanceTimersByTimeAsync(120000));
    expect(fetchStatus).toHaveBeenCalledOnce();
    expect(navigation.refresh).toHaveBeenCalledOnce();
  });

  it("aborts a stalled request and never overlaps requests", async () => {
    let requestSignal: AbortSignal | undefined;
    fetchStatus.mockImplementation((_url, options: RequestInit) => new Promise((_resolve, reject) => {
      requestSignal = options.signal!;
      requestSignal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    }));
    render(<OrderStatusRefresh retryAfterSeconds={5} />);
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(fetchStatus).toHaveBeenCalledOnce();
    expect(requestSignal?.aborted).toBe(false);
    await act(() => vi.advanceTimersByTimeAsync(10000));
    expect(requestSignal?.aborted).toBe(true);
    expect(fetchStatus).toHaveBeenCalledOnce();
    expect(navigation.refresh).not.toHaveBeenCalled();
  });
});
