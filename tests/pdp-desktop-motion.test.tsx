import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PdpApplicationCarousel } from "@/components/product-detail/PdpApplicationCarousel";
import { PdpDesktopMotion } from "@/components/product-detail/PdpDesktopMotion";
import { PdpProfileSplit } from "@/components/product-detail/PdpProfileSplit";
import { PdpCoreRoutineSection } from "@/components/product-detail/PdpCoreRoutineSection";
import { CORE_PDP_DESIGN_TOKENS, type CorePdpPresentation } from "@/lib/content/core-pdp";
import type { PdpProduct } from "@/lib/catalog/models";
import type { ProductMedia } from "@/lib/products";

const steps = [
  { id: "01", copy: "Apply the serum.", surface: "#eee", accent: "#aaa", detail: "#ccc" },
  { id: "02", copy: "Press into skin.", surface: "#eee", accent: "#aaa", detail: "#ccc" },
  { id: "03", copy: "Follow with moisturizer.", surface: "#eee", accent: "#aaa", detail: "#ccc" },
] as const;

const media: ProductMedia[] = steps.map((step, index) => ({
  kind: "image", url: `/application-${step.id}.webp`, alt: "Serum application",
  width: 1200, height: 1500, role: "pdp_application", sortOrder: index + 1,
  paletteId: null, palette: null,
}));

const product: PdpProduct = {
  id: "serum", slug: "super-serum", displayName: "Super Serum", routineGroup: "core",
  systemStepName: "TREAT", systemStepPosition: 3, routineSort: 20, productType: "Serum",
  description: "A serum.", howToUse: "Apply.", swatch: ["#eee", "#aaa"], media: [],
  cardMedia: null, detailMedia: null, cartMedia: null, madeFor: null,
  goodFor: "Dry skin", texture: "Lightweight", keyIngredients: [], ingredients: null,
  cautions: [], finish: "Hydrated", volume: null, skinTypes: ["All skin types"],
  usageTime: ["Morning"], pdpContent: null, productFamily: null, currency: "USD",
  status: "available", variants: [],
};
const presentation: CorePdpPresentation = {
  ...CORE_PDP_DESIGN_TOKENS.treat,
  profileTitle: [{ text: "Serum profile" }], routineOverlay: "Routine",
  outcomeHeading: "Outcomes", outcomeOptions: [
    { ...CORE_PDP_DESIGN_TOKENS.treat.outcomeOptions[0], label: "Hydrates" },
    { ...CORE_PDP_DESIGN_TOKENS.treat.outcomeOptions[1], label: "Smooths" },
    { ...CORE_PDP_DESIGN_TOKENS.treat.outcomeOptions[2], label: "Brightens" },
  ], applicationSteps: steps,
};
const routineProducts = ([
  ["biotic-reset", "CLEANSE", 1], ["super-serum", "TREAT", 3], ["ceramide-cushion", "SEAL", 5],
] as const).map(([slug, systemStepName, systemStepPosition]) => ({
  ...product, slug, systemStepName, systemStepPosition,
  textureMedia: { ...media[0], url: `/${slug}-texture.webp`, role: "core_routine_texture" as const },
  editorialMedia: { ...media[0], url: `/${slug}-editorial.webp`, role: "core_routine_editorial" as const },
}));

let frameTop = 1050;
let frameHeight = 500;
let reducedMotion = false;
const mediaListeners = new Set<() => void>();
const resizeCallbacks = new Set<() => void>();

function changeMotion(width: number, reduced = false) {
  act(() => {
    vi.stubGlobal("innerWidth", width);
    reducedMotion = reduced;
    for (const listener of mediaListeners) listener();
    window.dispatchEvent(new Event("resize"));
  });
}

function application(slug = "super-serum") {
  return (
    <PdpDesktopMotion productSlug={slug} label="Super Serum details">
      <PdpApplicationCarousel productName="Super Serum" steps={steps} media={media} />
    </PdpDesktopMotion>
  );
}

function scaleFor(image: Element | null) {
  if (!image) throw new Error("Expected rendered Product photograph");
  let scale = 1;
  let layer: HTMLElement | null = image as HTMLElement;
  while (layer && !layer.hasAttribute("data-pdp-panel")) {
    const match = getComputedStyle(layer).transform.match(/^scale\(([\d.]+)\)$/);
    if (match) scale *= Number(match[1]);
    layer = layer.parentElement;
  }
  return scale;
}

function scrollTo(y: number, settle = true) {
  act(() => {
    vi.stubGlobal("scrollY", y);
    window.dispatchEvent(new Event("scroll"));
    if (settle) vi.advanceTimersByTime(112);
  });
}

beforeEach(() => {
  frameTop = 1050;
  frameHeight = 500;
  reducedMotion = false;
  mediaListeners.clear();
  resizeCallbacks.clear();
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
  vi.stubGlobal("ResizeObserver", class {
    constructor(private callback: () => void) {}
    observe() { resizeCallbacks.add(this.callback); }
    disconnect() { resizeCallbacks.delete(this.callback); }
  });
  vi.spyOn(HTMLElement.prototype, "offsetTop", "get").mockImplementation(function (this: HTMLElement) {
    return this.matches(".pdp-application__visual, .pdp-profile-split__media, .pdp-core-routine__visual") ? frameTop : 0;
  });
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) {
    return this.matches(".pdp-application__visual, .pdp-profile-split__media, .pdp-core-routine__visual") ? frameHeight : 0;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("Treat desktop photographic motion", () => {
  it("retraces the reference crop on ascent, with a brief catch-up and fixed frame", () => {
    const { container } = render(application());
    const image = container.querySelector('[data-pdp-application-main-image="1"]');
    const frame = container.querySelector<HTMLElement>(".pdp-application__visual")!;
    expect(scaleFor(image)).toBe(1.2);

    scrollTo(800, false);
    act(() => vi.advanceTimersByTime(48));
    expect(scaleFor(image)).toBeGreaterThan(1.05);
    expect(scaleFor(image)).toBeLessThan(1.2);
    act(() => vi.advanceTimersByTime(64));
    expect(scaleFor(image)).toBe(1.05);
    scrollTo(1200);
    expect(scaleFor(image)).toBe(1.0125);
    scrollTo(2000);
    expect(scaleFor(image)).toBe(1);
    scrollTo(400);
    expect(scaleFor(image)).toBe(1.1125);
    scrollTo(-100);
    expect(scaleFor(image)).toBe(1.2);
    expect(frame.style.transform).toBe("");
    expect(frame.offsetTop).toBe(1050);
    expect(frame.offsetHeight).toBe(500);
  });

  it("requires Treat desktop eligibility and clears an in-flight zoom when motion is suppressed", () => {
    const { container, rerender } = render(application("biotic-reset"));
    const image = () => container.querySelector('[data-pdp-application-main-image="1"]');
    expect(scaleFor(image())).toBe(1);
    changeMotion(820);
    rerender(application());
    expect(scaleFor(image())).toBe(1);
    changeMotion(1440, true);
    expect(scaleFor(image())).toBe(1);
    changeMotion(1440);
    expect(scaleFor(image())).toBe(1.2);
    scrollTo(800, false);
    changeMotion(1440, true);
    act(() => vi.advanceTimersByTime(112));
    expect(scaleFor(image())).toBe(1);
    changeMotion(1440);
    expect(scaleFor(image())).toBe(1.05);
    changeMotion(820);
    scrollTo(400);
    expect(scaleFor(image())).toBe(1);
    changeMotion(1440);
    expect(scaleFor(image())).toBe(1.1125);
  });

  it("zooms only the named photographs and preserves the crop when application and routine selections change", () => {
    const { container } = render(
      <PdpDesktopMotion productSlug="super-serum" label="Super Serum details">
        <PdpProfileSplit product={product} presentation={presentation} media={{ ...media[0], alt: "Profile bottle" }} />
        <PdpApplicationCarousel productName="Super Serum" steps={steps} media={media} />
        <PdpCoreRoutineSection products={routineProducts} currentSlug="super-serum" />
      </PdpDesktopMotion>,
    );
    expect(scaleFor(screen.getByAltText("Profile bottle"))).toBe(1.2);
    for (const image of container.querySelectorAll('img[src*="editorial"]')) {
      expect(scaleFor(image)).toBe(1.2);
    }
    scrollTo(800);
    fireEvent.click(screen.getByRole("button", { name: "Show application step 3 of 3" }));
    fireEvent.click(screen.getByRole("radio", { name: "Show SEAL, Super Serum" }));
    expect(scaleFor(container.querySelector('[data-pdp-application-state="3"] img'))).toBe(1.05);
    expect(scaleFor(container.querySelector('.pdp-core-routine__visual-state[data-state="active"] img'))).toBe(1.05);
    for (const image of container.querySelectorAll('[data-pdp-application-thumbnail] img, img[src*="texture"]')) {
      expect(scaleFor(image)).toBe(1);
    }
    for (const layer of container.querySelectorAll<HTMLElement>("[data-pdp-slide-layer]")) {
      expect(layer.style.transform).toBe("");
    }
  });

  it("initializes at restored scroll, follows layout changes, and releases motion on unmount", () => {
    vi.stubGlobal("scrollY", 800);
    const { container, unmount } = render(application());
    const image = container.querySelector('[data-pdp-application-main-image="1"]');
    expect(scaleFor(image)).toBe(1.05);
    // The same scroll position is now before the frame's entry interval.
    frameTop = 2050;
    act(() => window.dispatchEvent(new Event("resize")));
    expect(scaleFor(image)).toBe(1.2);
    frameTop = 1050;
    act(() => { for (const callback of resizeCallbacks) callback(); });
    expect(scaleFor(image)).toBe(1.05);
    changeMotion(820);
    frameHeight = 1000;
    frameTop = 1100;
    changeMotion(1440);
    scrollTo(1100);
    expect(scaleFor(image)).toBe(1.05);
    scrollTo(400, false);
    unmount();
    act(() => {
      vi.advanceTimersByTime(112);
      window.dispatchEvent(new Event("scroll"));
      window.dispatchEvent(new Event("resize"));
      for (const callback of resizeCallbacks) callback();
      for (const callback of mediaListeners) callback();
      vi.advanceTimersByTime(112);
    });
    expect(scaleFor(image)).toBe(1);
    expect(resizeCallbacks.size).toBe(0);
  });

  it("keeps changing the crop while scroll events arrive immediately before animation frames", () => {
    const { container } = render(application());
    const image = container.querySelector('[data-pdp-application-main-image="1"]');
    const callbacks = new Map<number, FrameRequestCallback>();
    let frameId = 0;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callbacks.set(++frameId, callback);
      return frameId;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => callbacks.delete(id));

    for (let sample = 1; sample <= 10; sample++) {
      act(() => {
        vi.advanceTimersByTime(16);
        scrollTo(sample * 160, false);
        const pending = Array.from(callbacks.values());
        callbacks.clear();
        for (const callback of pending) callback(performance.now());
      });
    }
    expect(scaleFor(image)).toBeGreaterThan(1);
    expect(scaleFor(image)).toBeLessThan(1.2);
  });
});
