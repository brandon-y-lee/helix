import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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

describe("PdpApplicationCarousel", () => {
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
});
