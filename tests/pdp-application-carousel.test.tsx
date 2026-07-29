import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  orderedPdpApplicationMedia,
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
});

describe("PdpApplicationCarousel", () => {
  it("renders all reserved copy states with step 01 selected by default", () => {
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
    const firstState = container.querySelector(
      '[data-pdp-application-state="1"]',
    );
    expect(firstState).toHaveAttribute("data-state", "active");
    expect(firstState).toHaveAttribute("data-has-media", "false");
    expect(
      screen.queryByRole("button", { name: /previous/i }),
    ).not.toBeInTheDocument();
  });

  it("selects swatches and cycles one right arrow from 01 through 03", () => {
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

  it("does not autoplay and keeps an active visual during transitions", () => {
    vi.useFakeTimers();
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

    act(() => {
      vi.advanceTimersByTime(560);
    });
    expect(
      container.querySelectorAll(
        '.pdp-application__visual-state[data-state="outgoing"]',
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
  });
});
