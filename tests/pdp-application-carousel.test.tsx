import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  orderedPdpApplicationMedia,
  PDP_APPLICATION_TRANSITION_DURATION_MS,
  PdpApplicationCarousel,
} from "@/components/PdpApplicationCarousel";
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

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function mockReducedMotion(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches,
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

describe("PdpApplicationCarousel", () => {
  it("keeps an eyebrow inside every reserved state and exposes only the active copy", () => {
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
    expect(
      container.querySelector(
        ".pdp-application__copy > .pdp-application__eyebrow",
      ),
    ).toBeNull();
    const copyStates = container.querySelectorAll(".pdp-application__step");
    expect(copyStates).toHaveLength(3);
    for (const state of copyStates) {
      expect(
        state.querySelector(":scope > .pdp-application__eyebrow"),
      ).toHaveTextContent("APPLICATION");
      expect(
        state.querySelector(".pdp-application__step-body > span"),
      ).not.toBeNull();
      expect(
        state.querySelector(".pdp-application__step-body > p"),
      ).not.toBeNull();
    }
    expect(
      screen.getAllByRole("heading", { name: "APPLICATION" }),
    ).toHaveLength(1);
    const section = container.querySelector("[data-pdp-application]");
    expect(section).toHaveAttribute(
      "data-transition-duration",
      String(PDP_APPLICATION_TRANSITION_DURATION_MS),
    );
    expect(section).toHaveStyle({
      "--pdp-application-transition-duration": "900ms",
    });
    const firstState = container.querySelector(
      '[data-pdp-application-state="1"]',
    );
    expect(firstState).toHaveAttribute("data-state", "active");
    expect(firstState).toHaveAttribute("data-has-media", "false");
    expect(
      screen.queryByRole("button", { name: /previous/i }),
    ).not.toBeInTheDocument();
  });

  it("selects real image previews and keeps copy and main media on the same step", () => {
    const { container } = render(
      <PdpApplicationCarousel
        productName="CLEANSE"
        steps={steps}
        media={orderedPdpApplicationMedia(productMedia)}
      />,
    );
    const next = screen.getByRole("button", {
      name: "Show next application step",
    });

    for (const order of [1, 2, 3]) {
      const thumbnail = container.querySelector(
        `[data-pdp-application-thumbnail="${order}"]`,
      );
      expect(thumbnail).toHaveAttribute("data-has-media", "true");
      expect(thumbnail?.querySelector("img")).toHaveAttribute(
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
        '[data-pdp-application-state="2"]',
      ),
    ).toHaveAttribute("data-state", "active");
    expect(
      container.querySelector(
        '[data-pdp-application-state="2"] [data-pdp-application-main-image="2"]',
      ),
    ).toHaveAttribute(
      "src",
      expect.stringContaining("application-2.png"),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Show application step 3 of 3" }),
    );
    expect(
      screen.getByText("Third application step.").closest("article"),
    ).toHaveAttribute("aria-hidden", "false");

    fireEvent.click(next);
    expect(
      screen.getByText("First application step.").closest("article"),
    ).toHaveAttribute("aria-hidden", "false");
    fireEvent.click(next);
    expect(
      screen
        .getByText("Second application step is deliberately longer.")
        .closest("article"),
    ).toHaveAttribute("aria-hidden", "false");
    fireEvent.click(next);
    expect(
      screen.getByText("Third application step.").closest("article"),
    ).toHaveAttribute("aria-hidden", "false");
  });

  it("does not autoplay and retires synchronized outgoing layers after 900ms", () => {
    vi.useFakeTimers();
    mockReducedMotion(false);
    const { container } = render(
      <PdpApplicationCarousel
        productName="CLEANSE"
        steps={steps}
        media={orderedPdpApplicationMedia(productMedia)}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(
      screen.getByRole("button", { name: "Show application step 1 of 3" }),
    ).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(
      screen.getByRole("button", { name: "Show next application step" }),
    );
    expect(
      container.querySelectorAll(
        '.pdp-application__visual-state[data-state="active"]',
      ),
    ).toHaveLength(1);
    expect(
      container.querySelectorAll(
        '.pdp-application__visual-state[data-state="outgoing"]',
      ),
    ).toHaveLength(1);
    expect(
      container.querySelectorAll(
        '.pdp-application__step[data-state="outgoing"]',
      ),
    ).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(899);
    });
    expect(
      container.querySelectorAll(
        '.pdp-application__visual-state[data-state="outgoing"]',
      ),
    ).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(
      container.querySelectorAll(
        '.pdp-application__visual-state[data-state="outgoing"]',
      ),
    ).toHaveLength(0);
    expect(
      container.querySelectorAll(
        '.pdp-application__step[data-state="outgoing"]',
      ),
    ).toHaveLength(0);
  });

  it("maps sorted application media to positions independently of visible copy", () => {
    const relabeledSteps = [
      { ...steps[0], copy: "Replacement application copy 1." },
      { ...steps[1], copy: "Replacement application copy 2." },
      { ...steps[2], copy: "Replacement application copy 3." },
    ] as const;
    const { container } = render(
      <PdpApplicationCarousel
        productName="CLEANSE"
        steps={relabeledSteps}
        media={orderedPdpApplicationMedia(productMedia)}
      />,
    );

    for (const order of [1, 2, 3]) {
      const state = container.querySelector(
        `[data-pdp-application-state="${order}"]`,
      );
      expect(state).toHaveAttribute("data-has-media", "true");
      expect(state?.querySelector("img")).toHaveAttribute(
        "src",
        expect.stringContaining(`application-${order}.png`),
      );
    }
    expect(
      orderedPdpApplicationMedia(productMedia).map((media) => media.sortOrder),
    ).toEqual([1, 2, 3]);
  });

  it("keeps each missing position on its own hue fallback", () => {
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

    const first = container.querySelector('[data-pdp-application-state="1"]');
    const second = container.querySelector('[data-pdp-application-state="2"]');
    const third = container.querySelector('[data-pdp-application-state="3"]');
    expect(first).toHaveAttribute("data-has-media", "true");
    expect(second).toHaveAttribute("data-has-media", "false");
    expect(second?.querySelector("img")).toBeNull();
    expect(
      second?.querySelector(".pdp-application__shape--one"),
    ).not.toBeNull();
    expect(third).toHaveAttribute("data-has-media", "true");
    const secondThumbnail = container.querySelector(
      '[data-pdp-application-thumbnail="2"]',
    );
    expect(secondThumbnail).toHaveAttribute("data-has-media", "false");
    expect(
      secondThumbnail?.querySelector(".pdp-application__swatch-fallback"),
    ).not.toBeNull();
    expect(secondThumbnail?.querySelector("img")).toBeNull();
  });

  it("resolves rapid input to the latest matching copy and image", () => {
    vi.useFakeTimers();
    mockReducedMotion(false);
    const { container } = render(
      <PdpApplicationCarousel
        productName="CLEANSE"
        steps={steps}
        media={productMedia}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Show application step 2 of 3" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Show application step 3 of 3" }),
    );

    expect(
      screen.getByText("Third application step.").closest("article"),
    ).toHaveAttribute("data-state", "active");
    expect(
      container.querySelector(
        '[data-pdp-application-state="3"] [data-pdp-application-main-image="3"]',
      ),
    ).toHaveAttribute(
      "src",
      expect.stringContaining("application-3.png"),
    );
    expect(
      screen.getByRole("button", { name: "Show application step 3 of 3" }),
    ).toHaveAttribute("aria-pressed", "true");

    act(() => vi.advanceTimersByTime(900));
    expect(
      container.querySelectorAll('[data-state="outgoing"]'),
    ).toHaveLength(0);
  });

  it("retires outgoing copy and media immediately for reduced motion", () => {
    vi.useFakeTimers();
    mockReducedMotion(true);
    const { container } = render(
      <PdpApplicationCarousel
        productName="CLEANSE"
        steps={steps}
        media={productMedia}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Show application step 2 of 3" }),
    );
    act(() => vi.advanceTimersByTime(1));

    expect(
      container.querySelectorAll('[data-state="outgoing"]'),
    ).toHaveLength(0);
  });
});
