import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PdpCoreRoutineSection } from "@/components/product-detail/PdpCoreRoutineSection";

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

describe("PdpCoreRoutineSection", () => {
  it("starts on the current product with persistent non-link states", () => {
    const { container } = render(
      <PdpCoreRoutineSection products={products} currentSlug="treat" />,
    );

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
      container.querySelector(
        '.pdp-core-routine__visual-state[data-state="active"] img',
      ),
    ).toHaveAttribute("src", expect.stringContaining("treat-editorial.webp"));
    expect(container.querySelectorAll("a")).toHaveLength(0);
  });

  it("maps pointer, focus, click, and keyboard selection to both media panels", () => {
    const { container } = render(
      <PdpCoreRoutineSection products={products} currentSlug="cleanse" />,
    );
    const first = screen.getByRole("radio", { name: "Show step 1, CLEANSE" });
    const second = screen.getByRole("radio", { name: "Show step 2, TREAT" });
    const third = screen.getByRole("radio", { name: "Show step 3, SEAL" });

    fireEvent.pointerEnter(second);
    expect(second).toHaveAttribute("aria-checked", "true");
    expect(
      container.querySelector(
        '.pdp-core-routine__callout-state[data-state="active"] img',
      ),
    ).toHaveAttribute("src", expect.stringContaining("treat.webp"));
    expect(
      container.querySelector(
        '.pdp-core-routine__visual-state[data-state="active"] img',
      ),
    ).toHaveAttribute("src", expect.stringContaining("treat-editorial.webp"));

    fireEvent.focus(third);
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

  it("uses a fallback only for the selected product missing editorial media", () => {
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
    expect(activeVisual?.querySelector("img")).toBeNull();

    fireEvent.click(
      screen.getByRole("radio", { name: "Show step 3, SEAL" }),
    );
    expect(
      container.querySelector(
        '.pdp-core-routine__visual-state[data-state="active"] img',
      ),
    ).toHaveAttribute("src", expect.stringContaining("seal-editorial.webp"));
  });
});
