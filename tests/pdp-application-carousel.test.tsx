import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PdpApplicationCarousel } from "@/components/PdpApplicationCarousel";
import type { CorePdpApplicationStep } from "@/lib/content/core-pdp";

const steps = [
  {
    id: "01",
    copy: "First application step.",
    futureMediaFilename: "cleanse-pdp-application-01.webp",
    surface: "#d8ddd7",
    accent: "#97aa9b",
    detail: "#eef0ea",
  },
  {
    id: "02",
    copy: "Second application step is deliberately longer.",
    futureMediaFilename: "cleanse-pdp-application-02.webp",
    surface: "#c0cbc5",
    accent: "#789085",
    detail: "#d9d0c0",
  },
  {
    id: "03",
    copy: "Third application step.",
    futureMediaFilename: "cleanse-pdp-application-03.webp",
    surface: "#e4ded3",
    accent: "#93aaa7",
    detail: "#bbc7bc",
  },
] as const satisfies readonly [
  CorePdpApplicationStep,
  CorePdpApplicationStep,
  CorePdpApplicationStep,
];

afterEach(() => {
  vi.useRealTimers();
});

describe("PdpApplicationCarousel", () => {
  it("renders all reserved copy states with step 01 selected by default", () => {
    const { container } = render(
      <PdpApplicationCarousel productName="CLEANSE" steps={steps} />,
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
        '[data-future-media="cleanse-pdp-application-01.webp"]',
      ),
    ).toHaveAttribute("data-state", "active");
    expect(
      screen.queryByRole("button", { name: /previous/i }),
    ).not.toBeInTheDocument();
  });

  it("selects swatches and cycles one right arrow from 01 through 03", () => {
    const { container } = render(
      <PdpApplicationCarousel productName="CLEANSE" steps={steps} />,
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
        '[data-future-media="cleanse-pdp-application-02.webp"]',
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
      <PdpApplicationCarousel productName="CLEANSE" steps={steps} />,
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
});
