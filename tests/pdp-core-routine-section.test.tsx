import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PdpCoreRoutineSection } from "@/components/PdpCoreRoutineSection";
import type { CoreRoutineProduct } from "@/lib/products";

const productRows: Array<
  [string, string, string, string, number, number, string, string]
> = [
  ["cleanse", "CLEANSE", "Cleanse", "Gel cleanser", 1, 10, "#d9e2dc", "#a7bcb0"],
  ["treat", "TREAT", "Treat", "Treatment serum", 2, 20, "#e4c175", "#a7772f"],
  ["seal", "SEAL", "Seal", "Barrier cream", 3, 30, "#e7e1d7", "#b8aa92"],
];

const products: CoreRoutineProduct[] = productRows.map(
  ([
    slug,
    displayName,
    routineStepName,
    productType,
    routineStepNumber,
    routineSort,
    swatchFrom,
    swatchTo,
  ]) => ({
    id: `${slug}-id`,
    slug,
    displayName,
    formalTitle: `${displayName} formal title`,
    productType,
    routineStepNumber,
    routineStepName,
    routineSort,
    swatch: [swatchFrom, swatchTo] as [string, string],
    textureMedia: {
      kind: "image",
      url: `https://example.supabase.co/${slug}.webp`,
      alt: `${displayName} texture`,
      width: 1024,
      height: 1024,
      role: "core_routine_texture",
      sortOrder: 24,
      paletteId: null,
      palette: null,
    },
  }),
);

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("PdpCoreRoutineSection", () => {
  it("starts on the current PDP and renders three persistent, non-link states", () => {
    const { container } = render(
      <PdpCoreRoutineSection products={products} currentSlug="treat" />,
    );

    expect(
      screen.getByRole("heading", {
        name: "The Mei Pelle CORE for clearer, healthier skin.",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText("The Core")).not.toBeInTheDocument();
    expect(screen.getByText("Your morning and evening essentials.")).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: "Show step 2, TREAT" }),
    ).toHaveAttribute("aria-checked", "true");
    expect(container.querySelector(".pdp-core-routine")).toHaveAttribute(
      "data-active-step",
      "02",
    );
    expect(
      container.querySelectorAll(".pdp-core-routine__visual-state"),
    ).toHaveLength(3);
    expect(
      container.querySelectorAll(".pdp-core-routine__visual img"),
    ).toHaveLength(0);
    expect(container.querySelectorAll(".pdp-core-routine img")).toHaveLength(3);
    expect(
      container.querySelector(
        '.pdp-core-routine__callout-state[data-state="active"] .pdp-core-routine__annotation',
      ),
    ).toHaveTextContent("TREATTreatment serum");
    expect(container.querySelectorAll("a")).toHaveLength(0);
  });

  it("persists hover, focus, click, and keyboard selections with direction", () => {
    const { container } = render(
      <PdpCoreRoutineSection products={products} currentSlug="cleanse" />,
    );
    const first = screen.getByRole("radio", { name: "Show step 1, CLEANSE" });
    const second = screen.getByRole("radio", { name: "Show step 2, TREAT" });
    const third = screen.getByRole("radio", { name: "Show step 3, SEAL" });

    fireEvent.pointerEnter(second);
    expect(second).toHaveAttribute("aria-checked", "true");
    expect(container.querySelector(".pdp-core-routine")).toHaveAttribute(
      "data-direction",
      "forward",
    );

    fireEvent.focus(third);
    expect(third).toHaveAttribute("aria-checked", "true");
    fireEvent.keyDown(third, { key: "ArrowLeft" });
    expect(second).toHaveAttribute("aria-checked", "true");
    fireEvent.keyDown(second, { key: "Home" });
    expect(first).toHaveAttribute("aria-checked", "true");
    expect(container.querySelector(".pdp-core-routine")).toHaveAttribute(
      "data-direction",
      "backward",
    );

    fireEvent.click(third);
    expect(third).toHaveAttribute("aria-checked", "true");
  });

  it("does not autoplay and retires only the outgoing transition layer", () => {
    vi.useFakeTimers();
    const { container } = render(
      <PdpCoreRoutineSection products={products} currentSlug="cleanse" />,
    );

    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(
      screen.getByRole("radio", { name: "Show step 1, CLEANSE" }),
    ).toHaveAttribute("aria-checked", "true");

    fireEvent.click(
      screen.getByRole("radio", { name: "Show step 2, TREAT" }),
    );
    expect(
      container.querySelectorAll(
        '.pdp-core-routine__visual-state[data-state="outgoing"]',
      ),
    ).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(640);
    });
    expect(
      container.querySelectorAll(
        '.pdp-core-routine__visual-state[data-state="outgoing"]',
      ),
    ).toHaveLength(0);
    expect(
      container.querySelectorAll(
        '.pdp-core-routine__visual-state[data-state="active"]',
      ),
    ).toHaveLength(1);
  });

  it("retires the outgoing layer immediately for reduced motion", () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: true,
        media: "(prefers-reduced-motion: reduce)",
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
    const { container } = render(
      <PdpCoreRoutineSection products={products} currentSlug="cleanse" />,
    );

    fireEvent.click(
      screen.getByRole("radio", { name: "Show step 2, TREAT" }),
    );
    act(() => {
      vi.advanceTimersByTime(20);
    });

    expect(
      container.querySelectorAll(
        '.pdp-core-routine__visual-state[data-state="outgoing"]',
      ),
    ).toHaveLength(0);
  });
});
