import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  orderedPdpApplicationMedia,
  PdpApplicationCarousel,
} from "@/components/product-detail/PdpApplicationCarousel";
import type { CorePdpApplicationStep } from "@/lib/content/core-pdp";
import type { ProductMedia } from "@/lib/products";

const steps = [
  {
    id: "01",
    copy: "First application step.",
    surface: "#d8ddd7",
    accent: "#97aa9b",
    detail: "#eef0ea",
  },
  {
    id: "02",
    copy: "Second application step is deliberately longer.",
    surface: "#c0cbc5",
    accent: "#789085",
    detail: "#d9d0c0",
  },
  {
    id: "03",
    copy: "Third application step.",
    surface: "#e4ded3",
    accent: "#93aaa7",
    detail: "#bbc7bc",
  },
] as const satisfies readonly [
  CorePdpApplicationStep,
  CorePdpApplicationStep,
  CorePdpApplicationStep,
];

function applicationMedia(sortOrder: number): ProductMedia {
  return {
    kind: "image",
    url: `https://example.supabase.co/application-${sortOrder}.png`,
    alt: `CLEANSE application visual ${sortOrder}`,
    width: 1122,
    height: 1402,
    role: "pdp_application",
    sortOrder,
    paletteId: null,
    palette: null,
  };
}

const productMedia = [
  applicationMedia(3),
  applicationMedia(1),
  applicationMedia(2),
];

let mobile = true;
let reducedMotion = false;
const mediaListeners = new Set<() => void>();

function resizeToMobile(value: boolean) {
  act(() => {
    mobile = value;
    for (const listener of mediaListeners) listener();
  });
}

beforeEach(() => {
  mobile = true;
  reducedMotion = false;
  mediaListeners.clear();
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === "(max-width: 820px)" ? mobile : query === "(prefers-reduced-motion: reduce)" && reducedMotion,
    addEventListener: (_event: string, listener: () => void) => mediaListeners.add(listener),
    removeEventListener: (_event: string, listener: () => void) => mediaListeners.delete(listener),
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("PdpApplicationCarousel", () => {
  it("lets phone keyboard users select and focus the montage steps within its bounds", () => {
    render(
      <PdpApplicationCarousel
        productName="Super Serum"
        steps={steps}
        media={productMedia}
        pdpPresentation="mobile-pilot"
      />,
    );
    const first = screen.getByRole("button", { name: "Show application step 1 of 3" });
    const second = screen.getByRole("button", { name: "Show application step 2 of 3" });
    const last = screen.getByRole("button", { name: "Show application step 3 of 3" });

    first.focus();
    fireEvent.keyDown(first, { key: "End" });
    expect(last).toHaveFocus();
    expect(last).toHaveAttribute("aria-pressed", "true");
    fireEvent.keyDown(last, { key: "ArrowRight" });
    expect(last).toHaveFocus();
    expect(last).toHaveAttribute("aria-pressed", "true");
    fireEvent.keyDown(last, { key: "Home" });
    expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: "ArrowLeft" });
    expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(second).toHaveFocus();
    expect(second).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByRole("heading", { name: "APPLICATION" })).toHaveLength(1);
    expect(screen.getByText("Application step 2 of 3: Second application step is deliberately longer.")).toHaveAttribute("aria-live", "polite");
  });

  it("keeps the selected step and a reachable control when a focused phone-only control leaves on resize", () => {
    render(
      <PdpApplicationCarousel
        productName="Super Serum"
        steps={steps}
        media={productMedia}
        pdpPresentation="mobile-pilot"
      />,
    );
    const previous = screen.getByRole("button", { name: "Show previous application step" });
    const next = screen.getByRole("button", { name: "Show next application step" });
    const third = screen.getByRole("button", { name: "Show application step 3 of 3" });
    fireEvent.click(third);
    fireEvent.click(previous);
    expect(screen.getByRole("button", { name: "Show application step 2 of 3" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(next);
    expect(third).toHaveAttribute("aria-pressed", "true");

    previous.focus();
    const nextFocus = vi.spyOn(next, "focus");
    resizeToMobile(false);
    expect(screen.queryByRole("button", { name: "Show previous application step" })).not.toBeInTheDocument();
    expect(next).toHaveFocus();
    expect(nextFocus).toHaveBeenCalledWith({ preventScroll: true });
    expect(third).toHaveAttribute("aria-pressed", "true");

    resizeToMobile(true);
    expect(next).toHaveFocus();
    expect(third).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Show previous application step" })).toBeVisible();
  });

  it("identifies the phone's selected image with text as well as its pressed state", () => {
    render(
      <PdpApplicationCarousel
        productName="Super Serum"
        steps={steps}
        media={productMedia}
        pdpPresentation="mobile-pilot"
      />,
    );
    const first = screen.getByRole("button", { name: "Show application step 1 of 3" });
    const second = screen.getByRole("button", { name: "Show application step 2 of 3" });
    const third = screen.getByRole("button", { name: "Show application step 3 of 3" });
    expect(within(first).getByText("Step 1")).toBeVisible();
    expect(within(second).getByText("Step 2")).toBeVisible();
    expect(within(third).getByText("Step 3")).toBeVisible();
    expect(within(first).getByText("Selected")).toBeVisible();

    fireEvent.click(second);
    expect(within(first).queryByText("Selected")).not.toBeInTheDocument();
    expect(within(second).getByText("Selected")).toBeVisible();
    expect(second).toHaveAttribute("aria-pressed", "true");
    resizeToMobile(false);
    expect(screen.queryByText("Selected")).not.toBeInTheDocument();
  });

  it("retires phone instructions after 250ms and immediately when motion is reduced", () => {
    vi.useFakeTimers();
    render(
      <PdpApplicationCarousel
        productName="Super Serum"
        steps={steps}
        media={productMedia}
        pdpPresentation="mobile-pilot"
      />,
    );
    const first = screen.getByText("First application step.").closest("article");
    const second = screen.getByText("Second application step is deliberately longer.").closest("article");
    const next = screen.getByRole("button", { name: "Show next application step" });
    fireEvent.click(next);
    act(() => vi.advanceTimersByTime(249));
    expect(first).toHaveAttribute("data-state", "outgoing");
    act(() => vi.advanceTimersByTime(1));
    expect(first).toHaveAttribute("data-state", "inactive");
    expect(second).toHaveAttribute("aria-hidden", "false");

    reducedMotion = true;
    fireEvent.click(next);
    expect(second).toHaveAttribute("data-state", "inactive");
    expect(screen.getByText("Third application step.").closest("article")).toHaveAttribute("aria-hidden", "false");
  });

  it("exposes one active accessible step while reserving every state", () => {
    const { container } = render(
      <PdpApplicationCarousel
        productName="CLEANSE"
        steps={steps}
        media={[]}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Show application step 1 of 3" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(container.querySelectorAll(".pdp-application__step")).toHaveLength(3);
    expect(
      container.querySelectorAll(".pdp-application__visual-state"),
    ).toHaveLength(3);
    expect(screen.getAllByRole("heading", { name: "APPLICATION" })).toHaveLength(
      1,
    );
    expect(
      container.querySelector('[data-pdp-application-state="1"]'),
    ).toHaveAttribute("data-has-media", "false");
    expect(
      screen.queryByRole("button", { name: /previous/i }),
    ).not.toBeInTheDocument();
  });

  it("keeps sorted previews, active copy, and main media synchronized", () => {
    const orderedMedia = orderedPdpApplicationMedia(productMedia);
    const { container } = render(
      <PdpApplicationCarousel
        productName="CLEANSE"
        steps={steps}
        media={orderedMedia}
      />,
    );
    expect(orderedMedia.map((media) => media.sortOrder)).toEqual([1, 2, 3]);

    for (const order of [1, 2, 3]) {
      expect(
        container.querySelector(
          `[data-pdp-application-thumbnail="${order}"] img`,
        ),
      ).toHaveAttribute(
        "src",
        expect.stringContaining(`application-${order}.png`),
      );
    }

    fireEvent.click(
      screen.getByRole("button", { name: "Show application step 2 of 3" }),
    );
    expect(
      screen
        .getByText("Second application step is deliberately longer.")
        .closest("article"),
    ).toHaveAttribute("aria-hidden", "false");
    expect(
      container.querySelector(
        '[data-pdp-application-state="2"] [data-pdp-application-main-image="2"]',
      ),
    ).toHaveAttribute("src", expect.stringContaining("application-2.png"));

    fireEvent.click(
      screen.getByRole("button", { name: "Show application step 1 of 3" }),
    );
    expect(container.querySelector("[data-pdp-application]")).toHaveAttribute(
      "data-direction",
      "backward",
    );

    const next = screen.getByRole("button", {
      name: "Show next application step",
    });
    fireEvent.click(next);
    fireEvent.click(next);
    expect(
      screen.getByText("Third application step.").closest("article"),
    ).toHaveAttribute("aria-hidden", "false");
    expect(container.querySelector("[data-pdp-application]")).toHaveAttribute(
      "data-direction",
      "forward",
    );
  });

  it("uses a local fallback only for a missing media position", () => {
    const { container } = render(
      <PdpApplicationCarousel
        productName="CLEANSE"
        steps={steps}
        media={orderedPdpApplicationMedia([
          applicationMedia(1),
          applicationMedia(3),
        ])}
      />,
    );

    const second = container.querySelector('[data-pdp-application-state="2"]');
    expect(second).toHaveAttribute("data-has-media", "false");
    expect(second?.querySelector("img")).toBeNull();
    expect(
      container.querySelector(
        '[data-pdp-application-thumbnail="2"] .pdp-application__swatch-fallback',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-pdp-application-state="3"] [data-pdp-application-main-image="3"]',
      ),
    ).toHaveAttribute("src", expect.stringContaining("application-3.png"));
  });

  it("uses the corresponding local fallback when one Product image fails", () => {
    const { container } = render(
      <PdpApplicationCarousel
        productName="CLEANSE"
        steps={steps}
        media={orderedPdpApplicationMedia(productMedia)}
      />,
    );
    const failedPosition = container.querySelector<HTMLElement>(
      '[data-pdp-application-state="2"]',
    );
    const failedImage = failedPosition?.querySelector("img");
    if (!failedImage) throw new Error("Expected application Product image");

    fireEvent.error(failedImage);

    expect(failedPosition?.querySelector("img")).toBeNull();
    expect(
      failedPosition?.querySelector(".pdp-application__shape--one"),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-pdp-application-state="3"] [data-pdp-application-main-image="3"]',
      ),
    ).toHaveAttribute("src", expect.stringContaining("application-3.png"));
  });
});
