import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PdpApplicationCarousel } from "@/components/product-detail/PdpApplicationCarousel";
import { PdpDesktopMotion } from "@/components/product-detail/PdpDesktopMotion";

const steps = [
  { id: "01", copy: "Apply the serum.", surface: "#eee", accent: "#aaa", detail: "#ccc" },
  { id: "02", copy: "Press into skin.", surface: "#eee", accent: "#aaa", detail: "#ccc" },
  { id: "03", copy: "Follow with moisturizer.", surface: "#eee", accent: "#aaa", detail: "#ccc" },
] as const;

let rowTop = 1500;
let reducedMotion = false;
const mediaListeners = new Set<() => void>();
let activeAnimations = new WeakMap<HTMLElement, Set<Animation>>();

function application(slug = "super-serum") {
  return (
    <PdpDesktopMotion productSlug={slug} label="Super Serum details">
      <PdpApplicationCarousel productName="Super Serum" steps={steps} media={[]} />
    </PdpDesktopMotion>
  );
}

function scrollTo(y: number) {
  act(() => {
    vi.stubGlobal("scrollY", y);
    window.dispatchEvent(new Event("scroll"));
  });
}

function changeMotion(width: number, reduced = false) {
  act(() => {
    vi.stubGlobal("innerWidth", width);
    reducedMotion = reduced;
    for (const listener of mediaListeners) listener();
    window.dispatchEvent(new Event("resize"));
  });
}

beforeEach(() => {
  rowTop = 1500;
  reducedMotion = false;
  mediaListeners.clear();
  activeAnimations = new WeakMap();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame", "performance"] });
  vi.stubGlobal("innerWidth", 1440);
  vi.stubGlobal("innerHeight", 1000);
  vi.stubGlobal("scrollY", 0);
  vi.stubGlobal("matchMedia", (query: string) => ({
    get matches() {
      return query === "(max-width: 820px)" ? window.innerWidth <= 820 : reducedMotion;
    },
    addEventListener: (_event: string, listener: () => void) => mediaListeners.add(listener),
    removeEventListener: (_event: string, listener: () => void) => mediaListeners.delete(listener),
  }));
  vi.spyOn(HTMLElement.prototype, "offsetTop", "get").mockImplementation(function (this: HTMLElement) {
    return this.hasAttribute("data-pdp-panel-row") ? rowTop : 0;
  });
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) {
    return this.hasAttribute("data-pdp-panel-row") ? 600 : 0;
  });

  // jsdom has no Web Animations renderer. Model the platform's initial frame,
  // duration and cancellation here; browser tests sample the actual easing.
  Object.defineProperty(HTMLElement.prototype, "animate", {
    configurable: true,
    value(this: HTMLElement, keyframes: Keyframe[], options: KeyframeAnimationOptions) {
      const element = this;
      const originalTransform = element.style.transform;
      const running = activeAnimations.get(element) ?? new Set<Animation>();
      activeAnimations.set(element, running);
      element.style.transform = String(keyframes[0].transform);
      const animation = {
        onfinish: null,
        effect: { getKeyframes: () => keyframes, getTiming: () => options },
        cancel() {
          clearTimeout(timer);
          element.style.transform = originalTransform;
          running.delete(animation);
        },
      } as unknown as Animation;
      const timer = setTimeout(() => {
        animation.cancel();
        animation.onfinish?.call(animation, new Event("finish") as AnimationPlaybackEvent);
      }, Number(options.duration));
      running.add(animation);
      return animation;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "getAnimations", {
    configurable: true,
    value(this: HTMLElement) { return Array.from(activeAnimations.get(this) ?? []); },
  });
});

afterEach(() => {
  Reflect.deleteProperty(HTMLElement.prototype, "animate");
  Reflect.deleteProperty(HTMLElement.prototype, "getAnimations");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("Treat desktop editorial entrances", () => {
  it("enters the complete row once at the viewport bottom and releases its transform after one second", () => {
    render(application());
    const row = screen.getByRole("region", { name: "Super Serum application" });
    expect(row.style.transform).toBe("");
    scrollTo(499);
    expect(row.getAnimations()).toHaveLength(0);
    scrollTo(500);
    expect(row.style.transform).toBe("translate3d(0, 5%, 0)");
    expect(row.style.opacity).toBe("");
    expect(row.getAnimations()).toHaveLength(1);
    const effect = row.getAnimations()[0].effect as KeyframeEffect;
    expect(effect.getKeyframes().map((frame) => frame.opacity ?? 1)).toEqual([1, 1]);
    for (const panel of row.querySelectorAll<HTMLElement>("[data-pdp-panel]")) {
      expect(panel.style.transform).toBe("");
    }
    act(() => vi.advanceTimersByTime(999));
    expect(row.getAnimations()).toHaveLength(1);
    act(() => vi.advanceTimersByTime(1));
    expect(row.getAnimations()).toHaveLength(0);
    expect(row.style.transform).toBe("");
    expect(row.style.willChange).toBe("");
    scrollTo(0);
    scrollTo(600);
    expect(row.getAnimations()).toHaveLength(0);
  });

  it("skips initially visible, restored, passed and resize-exposed rows without replaying them", () => {
    for (const initialScroll of [600, 2500]) {
      vi.stubGlobal("scrollY", initialScroll);
      const { unmount } = render(application());
      const row = screen.getByRole("region", { name: "Super Serum application" });
      expect(row.getAnimations()).toHaveLength(0);
      scrollTo(0);
      scrollTo(600);
      expect(row.getAnimations()).toHaveLength(0);
      unmount();
    }
    vi.stubGlobal("scrollY", 0);
    render(application());
    const row = screen.getByRole("region", { name: "Super Serum application" });
    rowTop = 900;
    act(() => window.dispatchEvent(new Event("resize")));
    rowTop = 1500;
    act(() => window.dispatchEvent(new Event("resize")));
    scrollTo(600);
    expect(row.getAnimations()).toHaveLength(0);
  });

  it("respects PDP and motion eligibility, remembers suppressed visits, and cancels entrances without replay", () => {
    const otherPdp = render(application("biotic-reset"));
    const otherRow = screen.getByRole("region", { name: "Super Serum application" });
    scrollTo(600);
    expect(otherRow.getAnimations()).toHaveLength(0);
    otherPdp.unmount();

    for (const [width, reduced] of [[820, false], [1440, true]] as const) {
      scrollTo(0);
      changeMotion(width, reduced);
      const suppressed = render(application());
      const row = screen.getByRole("region", { name: "Super Serum application" });
      scrollTo(600);
      expect(row.getAnimations()).toHaveLength(0);
      scrollTo(0);
      changeMotion(1440);
      scrollTo(600);
      expect(row.getAnimations()).toHaveLength(0);
      suppressed.unmount();

      scrollTo(0);
      const active = render(application());
      const activeRow = screen.getByRole("region", { name: "Super Serum application" });
      scrollTo(600);
      expect(activeRow.getAnimations()).toHaveLength(1);
      changeMotion(width, reduced);
      expect(activeRow.getAnimations()).toHaveLength(0);
      expect(activeRow.style.transform).toBe("");
      expect(activeRow.style.willChange).toBe("");
      scrollTo(0);
      changeMotion(1440);
      scrollTo(600);
      expect(activeRow.getAnimations()).toHaveLength(0);
      active.unmount();
    }
  });

  it("keeps selection available during entrance and cancels the native animation on unmount", () => {
    const { unmount } = render(application());
    const row = screen.getByRole("region", { name: "Super Serum application" });
    scrollTo(600);
    const entrance = row.getAnimations()[0];
    const third = screen.getByRole("button", { name: "Show application step 3 of 3" });
    fireEvent.click(third);
    expect(third).toHaveAttribute("aria-pressed", "true");
    expect(row.getAnimations()).toEqual([entrance]);
    unmount();
    scrollTo(0);
    scrollTo(600);
    act(() => vi.advanceTimersByTime(1000));
    expect(row.getAnimations()).toHaveLength(0);
    expect(row.style.transform).toBe("");
    expect(row.style.willChange).toBe("");
  });
});
