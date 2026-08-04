import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FooterWordmark } from "@/components/shell/FooterWordmark";

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
    vi.spyOn(window, "getComputedStyle").mockReturnValue({
      getPropertyValue: (property: string) =>
        ({
          "--site-footer-wordmark-start-scale": "1.05",
          "--site-footer-wordmark-end-scale": "0.92",
          "--site-footer-wordmark-static-scale": "0.96",
          "--site-footer-wordmark-cover": "62%",
        })[property] ?? "",
    } as CSSStyleDeclaration);

    const { container } = render(<FooterWordmark />);
    const band = container.querySelector(
      ".site-footer__wordmark-band",
    ) as HTMLDivElement;
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
      band.style.getPropertyValue("--site-footer-wordmark-scale"),
    );

    top = -300;
    fireEvent.scroll(window);
    act(() => frames.shift()?.(16));
    const coveredScale = Number(
      band.style.getPropertyValue("--site-footer-wordmark-scale"),
    );

    expect(band).toHaveAttribute("data-scroll-zoom-mode", "javascript");
    expect(coveredScale).toBeLessThan(entryScale);
  });
});
