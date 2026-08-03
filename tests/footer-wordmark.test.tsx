import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FooterWordmark } from "@/components/FooterWordmark";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("FooterWordmark", () => {
  it("updates its fallback scale as the footer crosses the viewport", () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("CSS", {
      supports: vi.fn(() => false),
    });
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.stubGlobal("innerHeight", 800);

    const { container } = render(<FooterWordmark />);
    const band = container.querySelector(
      ".site-footer__wordmark-band",
    ) as HTMLDivElement;
    const heading = container.querySelector("h2") as HTMLHeadingElement;
    let top = 900;

    vi.spyOn(band, "getBoundingClientRect").mockImplementation(
      () =>
        ({
          top,
          bottom: top + 300,
          height: 300,
          left: 0,
          right: 1000,
          width: 1000,
          x: 0,
          y: top,
          toJSON: () => ({}),
        }) as DOMRect,
    );

    act(() => frames.shift()?.(0));
    const entryScale = Number(
      heading.style.getPropertyValue("--site-footer-wordmark-scale"),
    );

    top = -300;
    fireEvent.scroll(window);
    act(() => frames.shift()?.(16));
    const coveredScale = Number(
      heading.style.getPropertyValue("--site-footer-wordmark-scale"),
    );

    expect(band).toHaveAttribute("data-scroll-zoom-mode", "javascript");
    expect(coveredScale).toBeLessThan(entryScale);
  });
});
