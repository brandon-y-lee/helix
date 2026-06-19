import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProductDetail } from "@/components/ProductDetail";
import type { Product } from "@/lib/products";

const cartMock = vi.hoisted(() => ({
  add: vi.fn(),
}));

vi.mock("@/components/CartProvider", () => ({
  useCart: () => cartMock,
}));

function makeProduct(overrides: Partial<Product> = {}): Product {
  const base: Product = {
    id: "33333333-3333-4333-8333-333333333333",
    slug: "recode-03-pdrn-5-ampoule",
    displayName: "RECODE",
    formalTitle: "RECODE 03 PDRN 5 Ampoule",
    name: "RECODE",
    tagline: "Bounce and glow",
    cardTagline: "Bounce and glow",
    collection: "THE SYSTEM",
    actionName: null,
    routineNumber: "03",
    subtitle: "Bounce and glow",
    descriptor: "A daily ampoule.",
    productType: "Ampoule",
    badge: null,
    currency: "USD",
    featuredRank: 0,
    sortOrder: 0,
    blurb: "A daily ampoule.",
    description: "A daily ampoule for smoother-looking bounce.",
    editorialDescription:
      "A light daily ampoule that helps skin look smoother, bouncier, and more switched on. Built for the step after cleansing.",
    benefits: [
      "Helps skin look smoother and more replenished",
      "Supports a bouncier-looking finish",
      "Layers cleanly under moisturizer",
    ],
    howToUse: "Apply after cleansing.",
    editorialHowToUse:
      "Pat a few drops over clean skin after REFINE. Follow with SEAL.",
    formulaNotes: ["Source formulation highlights PDRN and niacinamide."],
    variants: [
      {
        id: "15ml",
        label: "15 mL",
        price: 2500,
        compareAtPrice: null,
        sku: null,
        available: true,
        inventoryStatus: "in_stock",
        volume: "15 mL",
        packCount: null,
        optionValues: { size: "15 mL" },
        sortOrder: 0,
      },
    ],
    swatch: ["#edf4f5", "#87a3aa"],
    media: [],
    cardMedia: null,
    cardHoverMedia: null,
    heroMedia: null,
    detailMedia: null,
    cartMedia: null,
    searchMedia: null,
    status: "available",
    catalogStatus: "active",
    madeFor: "Dull-looking skin",
    goodFor: "Daily glow",
    texture: "Watery serum",
    keyIngredients: ["PDRN", "Niacinamide", "Peptides"],
    ingredients: "Water, Niacinamide, PDRN, Peptides",
    productDetails: {},
    cautions: [],
    finish: "Fresh glow",
    volume: "15 mL",
    skinTypes: ["All skin types"],
    concerns: ["Dullness", "Texture"],
    routineStep: "Treat",
    routineOrder: 3,
    usageTime: ["AM", "PM"],
    seoTitle: null,
    seoDescription: null,
    searchKeywords: [],
    createdAt: "2026-06-14T00:00:00.000Z",
  };
  return { ...base, ...overrides };
}

function before(a: Element, b: Element) {
  return Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
}

beforeEach(() => {
  cartMock.add.mockReset();
  cartMock.add.mockResolvedValue(true);
});

describe("ProductDetail purchase accordions", () => {
  it("renders accordions directly after the add-to-cart action", () => {
    render(<ProductDetail product={makeProduct()} />);

    const add = screen.getByRole("button", { name: /Add to cart/ });
    const does = screen.getByRole("button", { name: /WHAT IT DOES/ });
    const use = screen.getByRole("button", { name: /HOW TO USE/ });
    const ingredients = screen.getByRole("button", { name: /KEY INGREDIENTS/ });
    const details = screen.getByRole("heading", { name: "DETAILS" });
    const fullIngredients = screen.getByRole("heading", {
      name: "FULL INGREDIENTS",
    });

    expect(before(add, does)).toBe(true);
    expect(before(does, use)).toBe(true);
    expect(before(use, ingredients)).toBe(true);
    expect(before(ingredients, details)).toBe(true);
    expect(before(details, fullIngredients)).toBe(true);
  });

  it("uses a single-open collapsible accordion group", async () => {
    const user = userEvent.setup();
    render(<ProductDetail product={makeProduct()} />);

    const does = screen.getByRole("button", { name: /WHAT IT DOES/ });
    const use = screen.getByRole("button", { name: /HOW TO USE/ });
    const doesPanel = document.getElementById("pdp-accordion-does-panel");
    const usePanel = document.getElementById("pdp-accordion-use-panel");

    await user.click(does);
    expect(does).toHaveAttribute("aria-expanded", "true");
    expect(doesPanel).toHaveAttribute("data-open", "true");

    await user.click(use);
    expect(does).toHaveAttribute("aria-expanded", "false");
    expect(doesPanel).toHaveAttribute("data-open", "false");
    expect(use).toHaveAttribute("aria-expanded", "true");
    expect(usePanel).toHaveAttribute("data-open", "true");

    await user.click(use);
    expect(use).toHaveAttribute("aria-expanded", "false");
    expect(usePanel).toHaveAttribute("data-open", "false");
  });

  it("links key ingredients to the lower full ingredients section", async () => {
    const user = userEvent.setup();
    render(<ProductDetail product={makeProduct()} />);

    await user.click(screen.getByRole("button", { name: /KEY INGREDIENTS/ }));

    expect(screen.getByText("PDRN")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "View full ingredients" }),
    ).toHaveAttribute("href", "#full-ingredients");
    expect(document.getElementById("full-ingredients")).toHaveTextContent(
      "Water, Niacinamide, PDRN, Peptides",
    );
  });

  it("fails honestly when key ingredients or full INCI are unavailable", async () => {
    const user = userEvent.setup();
    render(
      <ProductDetail
        product={makeProduct({ keyIngredients: [], ingredients: null })}
      />,
    );

    await user.click(screen.getByRole("button", { name: /KEY INGREDIENTS/ }));

    expect(
      screen.getByText(/key ingredient notes are not available/i),
    ).toBeInTheDocument();
    expect(document.getElementById("full-ingredients")).toHaveTextContent(
      /checked on product packaging/i,
    );
  });
});
