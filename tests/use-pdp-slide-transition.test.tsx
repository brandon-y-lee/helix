import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PDP_SLIDE_DURATION_MS,
  usePdpSlideTransition,
} from "@/components/product-detail/usePdpSlideTransition";

function mockReducedMotion(matches: () => boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: matches(),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("usePdpSlideTransition", () => {
  it("bounds the initial index and resets state for a new key", () => {
    const { result, rerender } = renderHook(
      ({ initialIndex, itemCount, resetKey }) =>
        usePdpSlideTransition({ initialIndex, itemCount, resetKey }),
      {
        initialProps: { initialIndex: 9, itemCount: 3, resetKey: "first" },
      },
    );

    expect(result.current.activeIndex).toBe(2);
    act(() => {
      result.current.select(1);
    });
    expect(result.current.direction).toBe("backward");

    rerender({ initialIndex: -4, itemCount: 3, resetKey: "second" });
    expect(result.current).toMatchObject({
      activeIndex: 0,
      direction: "forward",
      isTransitioning: false,
      outgoingIndex: null,
    });
  });

  it("ignores invalid selections and retires the outgoing index", () => {
    vi.useFakeTimers();
    mockReducedMotion(() => false);
    const { result } = renderHook(() =>
      usePdpSlideTransition({ initialIndex: 0, itemCount: 3, resetKey: "pdp" }),
    );

    act(() => {
      expect(result.current.select(0)).toBe(false);
      expect(result.current.select(3)).toBe(false);
      expect(result.current.select(2)).toBe(true);
    });
    expect(result.current).toMatchObject({
      activeIndex: 2,
      direction: "forward",
      isTransitioning: true,
      outgoingIndex: 0,
    });

    act(() => vi.advanceTimersByTime(PDP_SLIDE_DURATION_MS));
    expect(result.current).toMatchObject({
      activeIndex: 2,
      isTransitioning: false,
      outgoingIndex: null,
    });
  });

  it("resolves rapid and cyclic input from the latest active index", () => {
    vi.useFakeTimers();
    mockReducedMotion(() => false);
    const { result } = renderHook(() =>
      usePdpSlideTransition({ initialIndex: 0, itemCount: 3, resetKey: "pdp" }),
    );

    act(() => {
      result.current.select(1);
      result.current.select(2);
      result.current.advance(1, "forward");
    });
    expect(result.current).toMatchObject({
      activeIndex: 0,
      direction: "forward",
      outgoingIndex: 2,
    });
    expect(vi.getTimerCount()).toBe(1);

    act(() => vi.advanceTimersByTime(PDP_SLIDE_DURATION_MS));
    expect(result.current.outgoingIndex).toBeNull();
  });

  it("skips outgoing state for reduced motion and clears timers on unmount", () => {
    vi.useFakeTimers();
    let reducedMotion = true;
    mockReducedMotion(() => reducedMotion);
    const { result, unmount } = renderHook(() =>
      usePdpSlideTransition({ initialIndex: 0, itemCount: 3, resetKey: "pdp" }),
    );

    act(() => {
      result.current.select(1);
    });
    expect(result.current).toMatchObject({
      activeIndex: 1,
      isTransitioning: false,
      outgoingIndex: null,
    });

    reducedMotion = false;
    act(() => {
      result.current.select(2);
    });
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
