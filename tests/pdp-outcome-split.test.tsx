import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PdpOutcomeSplit } from "@/components/product-detail/PdpOutcomeSplit";
import {
  CORE_PDP_DESIGN_TOKENS,
  type CorePdpPresentation,
} from "@/lib/content/core-pdp";
import type { ProductMedia } from "@/lib/products";

const design = CORE_PDP_DESIGN_TOKENS.cleanse;
const presentation: CorePdpPresentation = {
  profileTitle: [{ text: "CLEANSE" }],
  profileMediaPosition: design.profileMediaPosition,
  routineOverlay: "Routine video.",
  outcomeHeading: "YOUR DAILY CLEANSER THAT:",
  outcomeOptions: [
    { ...design.outcomeOptions[0], label: "cleanses" },
    { ...design.outcomeOptions[1], label: "balances" },
    { ...design.outcomeOptions[2], label: "preps" },
  ],
  applicationSteps: [
    { ...design.applicationSteps[0], id: "01", copy: "Application 1" },
    { ...design.applicationSteps[1], id: "02", copy: "Application 2" },
    { ...design.applicationSteps[2], id: "03", copy: "Application 3" },
  ],
  ingredientsMediaPosition: design.ingredientsMediaPosition,
};

function outcomeMedia(sortOrder: number): ProductMedia {
  return {
    kind: "image",
    url: `https://example.supabase.co/outcome-${sortOrder}.webp`,
    alt: `CLEANSE outcome visual ${sortOrder}`,
    width: 1200,
    height: 1300,
    role: "pdp_outcome",
    sortOrder,
    paletteId: null,
    palette: null,
  };
}

function activeSlide(container: HTMLElement): HTMLElement {
  const slide = container.querySelector<HTMLElement>(
    '[data-pdp-outcome-state][data-active="true"]',
  );
  if (!slide) throw new Error("Missing active outcome slide");
  return slide;
}

describe("PdpOutcomeSplit", () => {
  it("maps orders 1, 2, and 3 to states 0, 1, and 2 for click, hover, and keyboard", () => {
    const { container } = render(
      <PdpOutcomeSplit
        productName="CLEANSE"
        heading={presentation.outcomeHeading}
        options={presentation.outcomeOptions}
        media={[
          outcomeMedia(3),
          outcomeMedia(1),
          outcomeMedia(2),
        ]}
      />,
    );
    const controls = screen.getAllByRole("button");

    expect(activeSlide(container)).toHaveAttribute("data-pdp-outcome-state", "1");
    expect(activeSlide(container).querySelector("img")).toHaveAttribute(
      "alt",
      "CLEANSE outcome visual 1",
    );

    fireEvent.pointerEnter(controls[1]);
    expect(activeSlide(container)).toHaveAttribute("data-pdp-outcome-state", "2");
    expect(activeSlide(container).querySelector("img")).toHaveAttribute(
      "alt",
      "CLEANSE outcome visual 2",
    );

    fireEvent.click(controls[2]);
    expect(activeSlide(container)).toHaveAttribute("data-pdp-outcome-state", "3");
    expect(activeSlide(container).querySelector("img")).toHaveAttribute(
      "alt",
      "CLEANSE outcome visual 3",
    );

    fireEvent.keyDown(controls[2], { key: "Home" });
    expect(activeSlide(container)).toHaveAttribute("data-pdp-outcome-state", "1");
  });

  it("keeps one accessible label and hides both painted text layers", () => {
    render(
      <PdpOutcomeSplit
        productName="CLEANSE"
        heading={presentation.outcomeHeading}
        options={presentation.outcomeOptions}
        media={[]}
      />,
    );

    const controls = screen.getAllByRole("button");
    expect(controls[0]).toHaveAccessibleName("cleanses");
    expect(controls[0].querySelectorAll(":scope > .sr-only")).toHaveLength(1);

    const paintedLabel = controls[0].querySelector(".pdp-ink-option__label");
    expect(paintedLabel).toHaveAttribute("aria-hidden", "true");
    expect(
      paintedLabel?.querySelectorAll(
        ".pdp-ink-option__outline, .pdp-ink-option__fill",
      ),
    ).toHaveLength(2);
  });

  it("does not use visible labels to select media", () => {
    const relabeled = {
      ...presentation,
      outcomeOptions: [
        { ...presentation.outcomeOptions[0], label: "future copy 1" },
        { ...presentation.outcomeOptions[1], label: "future copy 2" },
        { ...presentation.outcomeOptions[2], label: "future copy 3" },
      ] as const,
    };
    const { container } = render(
      <PdpOutcomeSplit
        productName="CLEANSE"
        heading={relabeled.outcomeHeading}
        options={relabeled.outcomeOptions}
        media={[
          outcomeMedia(2),
          outcomeMedia(1),
          outcomeMedia(3),
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "future copy 2" }));
    expect(activeSlide(container).querySelector("img")).toHaveAttribute(
      "alt",
      "CLEANSE outcome visual 2",
    );
  });

  it("keeps the corresponding hue fallback for a missing position", () => {
    const { container } = render(
      <PdpOutcomeSplit
        productName="CLEANSE"
        heading={presentation.outcomeHeading}
        options={presentation.outcomeOptions}
        media={[
          outcomeMedia(3),
          outcomeMedia(1),
        ]}
      />,
    );

    const second = container.querySelector<HTMLElement>(
      '[data-pdp-outcome-state="2"]',
    );
    const third = container.querySelector<HTMLElement>(
      '[data-pdp-outcome-state="3"]',
    );

    expect(second).toHaveAttribute("data-has-media", "false");
    expect(second?.querySelector("img")).toBeNull();
    expect(second?.querySelector(".pdp-outcome-split__shape--one")).not.toBeNull();
    expect(third).toHaveAttribute("data-has-media", "true");
    expect(third?.querySelector("img")).toHaveAttribute(
      "alt",
      "CLEANSE outcome visual 3",
    );
  });
});
