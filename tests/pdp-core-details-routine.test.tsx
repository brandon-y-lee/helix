import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PdpCoreDetailsRoutine } from "@/components/PdpCoreDetailsRoutine";
import { coreDetailsIslandItems } from "@/components/ProductDetail.adapters";
import type { Product } from "@/lib/products";

const cartMock = vi.hoisted(() => ({
  add: vi.fn(),
  openCartDrawer: vi.fn(),
  resetErrors: vi.fn(),
}));

vi.mock("@/components/CartProvider", () => ({
  useCartDrawer: () => ({
    openCartDrawer: cartMock.openCartDrawer,
  }),
}));
vi.mock("@/components/useCart", async () => {
  const { useState } = await import("react");
  return {
    useCartMutations: () => {
      const [addError, setAddError] = useState<Error | null>(null);
      const [addPending, setAddPending] = useState(false);
      return {
        add: async (...args: Parameters<typeof cartMock.add>) => {
          setAddError(null);
          setAddPending(true);
          const added = await cartMock.add(...args);
          if (!added) {
            setAddError(new Error(
              "Cart is temporarily unavailable. Try again in a moment.",
            ));
          }
          setAddPending(false);
          return added;
        },
        addError,
        addPending,
        isAdding: () => addPending,
        resetErrors: () => {
          cartMock.resetErrors();
          setAddError(null);
        },
      };
    },
  };
});

const coreRows = [
  [
    "cleanse-01-calming-gel-cleanser",
    "CLEANSE",
    "Gel cleanser",
    2200,
    "Balanced, not tight",
    ["Clear", "Balance"],
    ["Multi-biotics complex", "LHA"],
  ],
  [
    "treat-03-pdrn-5-ampoule",
    "TREAT",
    "Ampoule / Serum",
    2500,
    "Clean, hydrated, non-sticky",
    ["Hydrate", "Smooth"],
    ["PDRN", "Niacinamide"],
  ],
  [
    "seal-05-green-collagen-cream",
    "SEAL",
    "Cream",
    2600,
    "Composed, not overloaded",
    ["Cushion", "Comfort"],
    ["Green collagen complex", "Panthenol"],
  ],
] as const;

function makeCoreProduct(
  row: (typeof coreRows)[number],
  index: number,
): Product {
  const [slug, displayName, productType, price, finish, benefits, ingredients] =
    row;
  return {
    id: `${displayName.toLowerCase()}-id`,
    slug,
    displayName,
    formalTitle: `${displayName} formal title`,
    cardTagline: `${displayName} card tagline`,
    routineGroup: "core",
    routineStepNumber: index + 1,
    routineStepName: displayName,
    routineSort: (index + 1) * 10,
    productType,
    badge: null,
    currency: "USD",
    sortOrder: index,
    description: `${displayName} description`,
    benefits: [...benefits],
    howToUse: "",
    formulaNotes: [],
    variants: [
      {
        id: `${displayName.toLowerCase()}-variant`,
        label: "Full size",
        price,
        compareAtPrice: null,
        sku: null,
        available: true,
        inventoryStatus: "in_stock",
        volume: "50 mL",
        packCount: null,
        optionValues: { size: "Full size" },
        sortOrder: 0,
      },
    ],
    swatch: ["#d9e2dc", "#81998d"],
    media: [],
    cardMedia: null,
    cardHoverMedia: null,
    heroMedia: null,
    detailMedia: null,
    cartMedia: null,
    searchMedia: null,
    status: "available",
    catalogStatus: "active",
    madeFor: "All skin types",
    goodFor: `${displayName} good for`,
    texture: `${displayName} texture`,
    keyIngredients: [...ingredients],
    ingredients: null,
    cautions: [],
    finish,
    volume: "50 mL",
    skinTypes: ["All skin types"],
    concerns: [],
    usageTime: ["Morning", "Night"],
    seoTitle: null,
    seoDescription: null,
    searchKeywords: [],
    pdpContent: {
      schemaVersion: 1,
      profileTitleTokens: null,
      routineOverlay: null,
      outcomeHeading: null,
      outcomeLabels: null,
      howToUseSteps: null,
      applicationSteps: null,
      ingredientCards: null,
      ingredientStory: null,
      routineGuidance: `${displayName} catalog routine guidance`,
    },
    createdAt: "2026-06-14T00:00:00.000Z",
  };
}

const products = coreRows.map(makeCoreProduct);

function activeState(container: HTMLElement) {
  const state = container.querySelector<HTMLElement>(
    '.pdp-details-routine__state[data-state="active"]',
  );
  if (!state) throw new Error("Active details state not found");
  return within(state);
}

beforeEach(() => {
  cartMock.add.mockReset();
  cartMock.add.mockResolvedValue(true);
  cartMock.openCartDrawer.mockReset();
});

describe("PdpCoreDetailsRoutine", () => {
  it.each([
    ["cleanse-01-calming-gel-cleanser", "CLEANSE"],
    ["treat-03-pdrn-5-ampoule", "TREAT"],
    ["seal-05-green-collagen-cream", "SEAL"],
  ])("defaults %s to %s", (currentSlug, displayName) => {
    const { container } = render(
      <PdpCoreDetailsRoutine
        items={coreDetailsIslandItems(products)}
        currentSlug={currentSlug}
      />,
    );

    expect(
      screen.getByRole("radio", {
        name: `Show ${displayName.toLowerCase()}, ${displayName}`,
      }),
    ).toHaveAttribute("aria-checked", "true");
    expect(activeState(container).getByRole("heading")).toHaveTextContent(
      displayName,
    );
  });

  it("keeps pointer selection persistent and updates every product field together", () => {
    const { container } = render(
      <PdpCoreDetailsRoutine
        items={coreDetailsIslandItems(products)}
        currentSlug="cleanse-01-calming-gel-cleanser"
      />,
    );
    const seal = screen.getByRole("radio", { name: "Show seal, SEAL" });

    fireEvent.pointerEnter(seal);
    fireEvent.pointerLeave(seal);

    expect(seal).toHaveAttribute("aria-checked", "true");
    expect(activeState(container).getByRole("heading")).toHaveTextContent(
      "SEAL",
    );
    expect(activeState(container).getByText("Cream")).toBeInTheDocument();
    expect(
      activeState(container).getByText("Composed, not overloaded"),
    ).toBeInTheDocument();
    expect(
      activeState(container).getByText("SEAL catalog routine guidance"),
    ).toBeInTheDocument();
    expect(
      activeState(container).getByText(
        "Green collagen complex • Panthenol",
      ),
    ).toBeInTheDocument();
    expect(
      activeState(container).getByRole("button", {
        name: "BUY SEAL - $26.00",
      }),
    ).toBeInTheDocument();
    expect(
      container.querySelector(
        '[data-media-replacement-key="pdp-details-seal"][data-state="active"]',
      ),
    ).toBeInTheDocument();
    expect(
      container.querySelector(".pdp-details-routine"),
    ).toHaveAttribute("data-direction", "forward");
    expect(
      container.querySelector(
        ".pdp-details-routine__steps [data-pdp-slide-layer]",
      ),
    ).toBeNull();
  });

  it("supports focus, arrow keys, and route resets", async () => {
    const { rerender } = render(
      <PdpCoreDetailsRoutine
        items={coreDetailsIslandItems(products)}
        currentSlug="cleanse-01-calming-gel-cleanser"
      />,
    );
    const treat = screen.getByRole("radio", { name: "Show treat, TREAT" });
    const seal = screen.getByRole("radio", { name: "Show seal, SEAL" });

    fireEvent.focus(treat);
    fireEvent.keyDown(treat, { key: "ArrowRight" });
    expect(seal).toHaveAttribute("aria-checked", "true");

    rerender(
      <PdpCoreDetailsRoutine
        items={coreDetailsIslandItems(products)}
        currentSlug="treat-03-pdrn-5-ampoule"
      />,
    );
    await waitFor(() => expect(treat).toHaveAttribute("aria-checked", "true"));
  });

  it("adds the active product, opens only after success, and guards duplicates", async () => {
    const user = userEvent.setup();
    let resolveAdd: ((value: boolean) => void) | undefined;
    cartMock.add.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          resolveAdd = resolve;
        }),
    );
    const { container } = render(
      <PdpCoreDetailsRoutine
        items={coreDetailsIslandItems(products)}
        currentSlug="cleanse-01-calming-gel-cleanser"
      />,
    );

    await user.click(screen.getByRole("radio", { name: "Show seal, SEAL" }));
    const buy = activeState(container).getByRole("button", {
      name: "BUY SEAL - $26.00",
    });
    await user.click(buy);
    fireEvent.click(buy);
    expect(cartMock.add).toHaveBeenCalledTimes(1);
    expect(cartMock.add).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: "seal-05-green-collagen-cream",
        name: "SEAL",
        variantId: "seal-variant",
        price: 2600,
      }),
    );
    expect(cartMock.openCartDrawer).not.toHaveBeenCalled();

    resolveAdd?.(true);
    await waitFor(() =>
      expect(cartMock.openCartDrawer).toHaveBeenCalledTimes(1),
    );

    cartMock.add.mockResolvedValueOnce(false);
    await user.click(screen.getByRole("radio", { name: "Show treat, TREAT" }));
    await user.click(
      activeState(container).getByRole("button", {
        name: "BUY TREAT - $25.00",
      }),
    );
    expect(cartMock.openCartDrawer).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByText(
        "Cart is temporarily unavailable. Try again in a moment.",
      ),
    ).toBeInTheDocument();
  });

  it("disables the exact active product CTA when no variant is purchasable", () => {
    const unavailableProducts = products.map((product) =>
      product.slug === "seal-05-green-collagen-cream"
        ? {
            ...product,
            variants: product.variants.map((variant) => ({
              ...variant,
              inventoryStatus: "out_of_stock" as const,
            })),
          }
        : product,
    );
    const { container } = render(
      <PdpCoreDetailsRoutine
        items={coreDetailsIslandItems(unavailableProducts)}
        currentSlug="seal-05-green-collagen-cream"
      />,
    );
    const buy = activeState(container).getByRole("button", {
      name: "OUT OF STOCK",
    });

    expect(buy).toBeDisabled();
    fireEvent.click(buy);
    expect(cartMock.add).not.toHaveBeenCalled();
    expect(cartMock.openCartDrawer).not.toHaveBeenCalled();
  });

  it("removes every Core cart payload in draft preview mode", () => {
    const items = coreDetailsIslandItems(products, true);
    expect(items.every((item) => item.purchase.item === null)).toBe(true);
    expect(items.every((item) => !item.purchase.purchasable)).toBe(true);

    const { container } = render(
      <PdpCoreDetailsRoutine
        items={items}
        currentSlug="cleanse-01-calming-gel-cleanser"
      />,
    );
    const buy = activeState(container).getByRole("button", {
      name: "Preview — purchasing disabled",
    });

    expect(buy).toBeDisabled();
    fireEvent.click(buy);
    expect(cartMock.add).not.toHaveBeenCalled();
    expect(cartMock.openCartDrawer).not.toHaveBeenCalled();
  });
});
