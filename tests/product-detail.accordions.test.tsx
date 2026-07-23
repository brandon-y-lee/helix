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

vi.mock("@/components/AfterpayMessaging", () => ({
  AfterpayMessaging: ({
    amount,
    currency,
    publishableKey,
  }: {
    amount: number;
    currency: string;
    publishableKey: string | null;
  }) =>
    publishableKey ? (
      <div
        data-testid="afterpay-messaging-boundary"
        data-amount={amount}
        data-currency={currency}
      />
    ) : null,
}));

function makeProduct(overrides: Partial<Product> = {}): Product {
  const base: Product = {
    id: "33333333-3333-4333-8333-333333333333",
    slug: "treat-03-pdrn-5-ampoule",
    displayName: "TREAT",
    formalTitle: "TREAT 02 PDRN 5 Ampoule",
    name: "TREAT",
    tagline: "Bounce and glow",
    cardTagline: "Bounce and glow",
    collection: "The Core",
    actionName: null,
    routineNumber: "02",
    routineGroup: "core",
    routineGroupLabel: "The Core",
    routineStepNumber: 2,
    routineStepName: "Treat",
    routineDisplayLabel: "02 — The Core",
    routineSort: 20,
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
    const signals = screen.getByRole("heading", { name: "QUICK SIGNALS" });
    const fullIngredients = screen.getByRole("heading", { name: "INGREDIENTS" });
    const details = screen.getByRole("heading", { name: "DETAILS" });

    expect(before(add, does)).toBe(true);
    expect(before(does, use)).toBe(true);
    expect(before(use, ingredients)).toBe(true);
    expect(before(ingredients, signals)).toBe(true);
    expect(before(fullIngredients, details)).toBe(true);
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

  it("renders the product-specific response meter without verified-buyer claims", () => {
    render(<ProductDetail product={makeProduct()} />);

    expect(
      screen.getByText("How refreshed did your skin look?"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("meter", {
        name: /How refreshed did your skin look\?: 87 out of 100/,
      }),
    ).toHaveAttribute("value", "87");
    expect(screen.queryByText(/Verified Buyer/i)).not.toBeInTheDocument();
  });

  it("keeps selected server product pricing in sync with main messaging and sticky controls", async () => {
    const user = userEvent.setup();
    const base = makeProduct();
    const secondVariant = {
      ...base.variants[0],
      id: "30ml",
      label: "30 mL",
      price: 4200,
      volume: "30 mL",
      optionValues: { size: "30 mL" },
      sortOrder: 1,
    };
    render(
      <ProductDetail
        product={makeProduct({ variants: [...base.variants, secondVariant] })}
        stripePublishableKey="pk_test_product"
      />,
    );

    const initialMessage = screen.getByTestId("afterpay-messaging-boundary");
    const initialAdd = screen.getByRole("button", {
      name: "Add to cart — $25.00",
    });
    expect(initialMessage).toHaveAttribute("data-amount", "2500");
    expect(initialMessage).toHaveAttribute("data-currency", "USD");
    expect(before(initialAdd, initialMessage)).toBe(true);
    expect(document.querySelector(".pdp-sticky-purchase")).not.toContainElement(
      initialMessage,
    );
    expect(screen.getAllByTestId("afterpay-messaging-boundary")).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "30 mL" }));

    expect(screen.getByTestId("afterpay-messaging-boundary")).toHaveAttribute(
      "data-amount",
      "4200",
    );
    expect(
      screen.getByRole("button", { name: "Add to cart — $42.00" }),
    ).toBeInTheDocument();
    expect(
      document.querySelector(
        ".pdp-sticky-purchase__variants button[aria-pressed='true']",
      ),
    ).toHaveTextContent("30 mL");
  });

  it("does not mount payment messaging for an unavailable product", () => {
    const base = makeProduct();
    render(
      <ProductDetail
        product={makeProduct({
          status: "sold_out",
          variants: base.variants.map((variant) => ({
            ...variant,
            available: false,
            inventoryStatus: "out_of_stock",
          })),
        })}
        stripePublishableKey="pk_test_product"
      />,
    );

    expect(
      screen.queryByTestId("afterpay-messaging-boundary"),
    ).not.toBeInTheDocument();
  });
});
