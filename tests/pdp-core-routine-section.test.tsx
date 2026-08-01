import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PdpCoreRoutineSection } from "@/components/PdpCoreRoutineSection";
import { PDP_SLIDE_DURATION_MS } from "@/components/usePdpSlideTransition";

const productRows: Array<
  [string, string, string, string, number, number, string, string]
> = [
  ["cleanse", "CLEANSE", "Cleanse", "Gel cleanser", 1, 10, "#d9e2dc", "#a7bcb0"],
  ["treat", "TREAT", "Treat", "Treatment serum", 2, 20, "#e4c175", "#a7772f"],
  ["seal", "SEAL", "Seal", "Barrier cream", 3, 30, "#e7e1d7", "#b8aa92"],
];

const products = productRows.map(
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
      kind: "image" as const,
      url: `https://example.supabase.co/${slug}.webp`,
      alt: `${displayName} texture`,
      width: 1024,
      height: 1024,
      role: "core_routine_texture" as const,
      sortOrder: 24,
      paletteId: null,
      palette: null,
    },
    editorialMedia: {
      kind: "image" as const,
      url: `https://example.supabase.co/${slug}-editorial.webp`,
      alt: `${displayName} editorial`,
      width: 1200,
      height: 1500,
      role: "core_routine_editorial" as const,
      sortOrder: 1,
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
    ).toHaveLength(3);
    expect(container.querySelectorAll(".pdp-core-routine img")).toHaveLength(6);
    expect(
      container.querySelector(
        '.pdp-core-routine__visual-state[data-state="active"] img',
      ),
    ).toHaveAttribute(
      "src",
      expect.stringContaining("treat-editorial.webp"),
    );
    expect(
      container.querySelector(
        '.pdp-core-routine__callout-state[data-state="active"] .pdp-core-routine__annotation',
      ),
    ).toHaveTextContent("TREATTreatment serum");
    expect(container.querySelectorAll("a")).toHaveLength(0);
    expect(
      container.querySelectorAll("[data-pdp-slide-viewport]"),
    ).toHaveLength(2);
    expect(
      container.querySelector(
        ".pdp-core-routine__steps [data-pdp-slide-layer]",
      ),
    ).toBeNull();
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
    expect(
      container.querySelector(
        '.pdp-core-routine__callout-state[data-state="active"] img',
      ),
    ).toHaveAttribute("src", expect.stringContaining("treat.webp"));
    expect(
      container.querySelector(
        '.pdp-core-routine__visual-state[data-state="active"] img',
      ),
    ).toHaveAttribute(
      "src",
      expect.stringContaining("treat-editorial.webp"),
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

  it("uses the selected product hue when only that editorial image is missing", () => {
    const productsWithMissingTreatEditorial = products.map((product) =>
      product.slug === "treat"
        ? { ...product, editorialMedia: null }
        : product,
    );
    const { container } = render(
      <PdpCoreRoutineSection
        products={productsWithMissingTreatEditorial}
        currentSlug="treat"
      />,
    );

    const activeVisual = container.querySelector<HTMLElement>(
      '.pdp-core-routine__visual-state[data-state="active"]',
    );
    expect(activeVisual).toHaveAttribute("data-media", "fallback");
    expect(activeVisual).toHaveStyle({
      "--core-from": "#e4c175",
      "--core-to": "#a7772f",
    });
    expect(activeVisual?.querySelector("img")).toBeNull();

    fireEvent.click(
      screen.getByRole("radio", { name: "Show step 3, SEAL" }),
    );
    expect(
      container.querySelector(
        '.pdp-core-routine__visual-state[data-state="active"] img',
      ),
    ).toHaveAttribute(
      "src",
      expect.stringContaining("seal-editorial.webp"),
    );
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
      vi.advanceTimersByTime(PDP_SLIDE_DURATION_MS);
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
    expect(
      container.querySelectorAll(
        '.pdp-core-routine__visual-state[data-state="outgoing"]',
      ),
    ).toHaveLength(0);
    expect(container.querySelector(".pdp-core-routine")).toHaveAttribute(
      "data-pdp-slide-transitioning",
      "false",
    );
  });
});
