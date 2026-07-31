import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

// Mock the catalog data layer so the async server pages render deterministically
// without touching Supabase or the network. formatPrice and types stay real.
vi.mock("@/lib/catalog-cache", () => {
  return {
    getCachedProducts: vi.fn(),
    getCachedProductCards: vi.fn(),
    getCachedIngredientIndexProducts: vi.fn(),
  };
});

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn(async () => null),
  getCurrentUserForPublicPage: vi.fn(async () => null),
}));

import HomePage from "@/app/page";
import ProductsPage from "@/app/products/page";
import CartPage from "@/app/cart/page";
import CheckoutPage from "@/app/checkout/page";
import SignInPage from "@/app/account/sign-in/page";
import AdminPage from "@/app/admin/page";
import AccessibilityPage from "@/app/accessibility/page";
import ContactPage from "@/app/contact/page";
import CookiePolicyPage from "@/app/cookie-policy/page";
import FAQPage from "@/app/faq/page";
import PrivacyChoicesPage from "@/app/privacy-choices/page";
import PrivacyPage from "@/app/privacy/page";
import TermsPage from "@/app/terms/page";
import { CartProvider } from "@/components/CartProvider";
import {
  getCachedIngredientIndexProducts,
  getCachedProductCards,
  getCachedProducts,
} from "@/lib/catalog-cache";
import type { Product } from "@/lib/products";

const mockedGetProducts = getCachedProducts as unknown as Mock;
const mockedGetProductCards = getCachedProductCards as unknown as Mock;
const mockedGetIngredientProducts =
  getCachedIngredientIndexProducts as unknown as Mock;

function makeProduct(
  overrides: Partial<Product> & Pick<Product, "slug" | "displayName">,
): Product {
  const base: Product = {
    id: "11111111-1111-4111-8111-111111111111",
    slug: overrides.slug,
    displayName: overrides.displayName,
    formalTitle: overrides.formalTitle ?? overrides.displayName,
    cardTagline: overrides.cardTagline ?? "Tagline",
    routineGroup: "beyond_core",
    routineStepNumber: null,
    routineStepName: null,
    routineSort: 100,
    productType: "Cleanser",
    badge: null,
    currency: "USD",
    sortOrder: 0,
    description: "Description.",
    benefits: [],
    howToUse: "",
    formulaNotes: [],
    variants: [
      {
        id: "50ml",
        label: "50 ml",
        price: 2000,
        compareAtPrice: null,
        sku: null,
        available: true,
        inventoryStatus: "in_stock",
        volume: "50 ml",
        packCount: null,
        optionValues: { size: "50 ml" },
        sortOrder: 0,
      },
    ],
    swatch: ["#ffffff", "#000000"],
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
    goodFor: "Everyday",
    texture: "Light gel",
    keyIngredients: [],
    ingredients: null,
    cautions: [],
    finish: null,
    volume: null,
    skinTypes: [],
    concerns: [],
    usageTime: [],
    seoTitle: null,
    seoDescription: null,
    searchKeywords: [],
    createdAt: "2026-06-14T00:00:00.000Z",
  };
  return { ...base, ...overrides };
}

const fixtures: Product[] = [
  makeProduct({
    slug: "cleanse-01-calming-gel-cleanser",
    displayName: "CLEANSE",
    routineGroup: "core",
    routineStepNumber: 1,
    routineStepName: "Cleanse",
    routineSort: 10,
    productType: "Gel cleanser",
    keyIngredients: ["6-Type Cica Complex", "Centella-derived support"],
    usageTime: ["AM", "PM"],
  }),
  makeProduct({
    slug: "refine-02-pore-treatment-pads",
    displayName: "REFINE",
    routineSort: 110,
    productType: "Toner pad",
    keyIngredients: ["Panthenol", "Sodium hyaluronate", "LHA"],
    ingredients: "Panthenol, Sodium Hyaluronate, Glycerin",
    usageTime: ["AM", "PM"],
  }),
  makeProduct({
    slug: "treat-03-pdrn-5-ampoule",
    displayName: "TREAT",
    routineGroup: "core",
    routineStepNumber: 2,
    routineStepName: "Treat",
    routineSort: 20,
    productType: "Ampoule / Serum",
    keyIngredients: ["Sodium DNA (50,000 ppm)", "Niacinamide", "Copper Tripeptide-1"],
    ingredients: "Sodium DNA (50,000 ppm), Niacinamide, Glycerin, Copper Tripeptide-1",
    usageTime: ["AM", "PM"],
  }),
  makeProduct({
    slug: "frame-04-pdrn-eye-cream",
    displayName: "FRAME",
    routineSort: 120,
    productType: "Eye contour cream",
    keyIngredients: ["Sodium DNA", "Niacinamide", "Panthenol"],
    ingredients: "Sodium DNA, Niacinamide, Panthenol",
    usageTime: ["AM", "PM"],
  }),
  makeProduct({
    slug: "seal-05-green-collagen-cream",
    displayName: "SEAL",
    routineGroup: "core",
    routineStepNumber: 3,
    routineStepName: "Seal",
    routineSort: 30,
    productType: "Cream",
    keyIngredients: ["Green collagen complex", "Sodium hyaluronate", "Panthenol"],
    ingredients: "Sodium Hyaluronate, Panthenol",
    usageTime: ["AM", "PM"],
  }),
  makeProduct({
    slug: "lift-06-pdrn-mask-system",
    displayName: "LIFT",
    routineSort: 130,
    productType: "Sheet mask",
    keyIngredients: ["Sodium DNA (5,000 ppm)", "Niacinamide", "Glycerin"],
    ingredients: "Sodium DNA (5,000 ppm), Niacinamide, Glycerin",
    usageTime: ["Weekly", "PM"],
  }),
];

beforeEach(() => {
  mockedGetProducts.mockReset();
  mockedGetProducts.mockResolvedValue(fixtures);
  mockedGetProductCards.mockReset();
  mockedGetProductCards.mockResolvedValue(fixtures);
  mockedGetIngredientProducts.mockReset();
  mockedGetIngredientProducts.mockResolvedValue(fixtures);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(
        JSON.stringify({ lines: [], count: 0, subtotal: 0, currency: "USD" }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    ),
  );
});

describe("storefront page smoke", () => {
  it("renders the Home server page", async () => {
    render(<CartProvider>{await HomePage()}</CartProvider>);

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Your skin starts with three steps.",
      }),
    ).toBeInTheDocument();
  });

  it("renders the Shop server page with catalog data", async () => {
    render(
      <CartProvider>
        {await ProductsPage({ searchParams: Promise.resolve({}) })}
      </CartProvider>,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "RAISE YOUR BASELINE." }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "CLEANSE" }),
    ).toHaveAttribute("href", "/products/cleanse-01-calming-gel-cleanser");
  });

  it("Shop renders a clear empty state when the catalog is empty", async () => {
    mockedGetProductCards.mockResolvedValue([]);
    render(await ProductsPage({ searchParams: Promise.resolve({}) }));
    expect(
      screen.getByRole("heading", { level: 1, name: "RAISE YOUR BASELINE." }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/no products are available/i),
    ).toBeInTheDocument();
  });

  it("renders the Cart empty state inside the provider", async () => {
    render(
      <CartProvider>
        {await CartPage({ searchParams: Promise.resolve({}) })}
      </CartProvider>,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Cart" }),
    ).toBeInTheDocument();
    expect(await screen.findByText(/your cart is empty/i)).toBeInTheDocument();
  });

  it("Cart renders a generic checkout cancellation notice", async () => {
    render(
      <CartProvider>
        {await CartPage({ searchParams: Promise.resolve({ checkout: "cancelled" }) })}
      </CartProvider>,
    );

    const notice = screen.getByRole("status");
    expect(notice).toHaveTextContent("Sandbox checkout was cancelled. Your cart is still here.");
    expect(notice).not.toHaveTextContent(/order|session|payment intent/i);
  });

  it("renders Checkout", () => {
    render(<CheckoutPage />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Checkout" }),
    ).toBeInTheDocument();
  });

  it("renders account sign-in", async () => {
    const { container } = render(
      await SignInPage({
        searchParams: Promise.resolve({ next: "/rewards" }),
      }),
    );

    expect(
      screen.getByRole("heading", { level: 1, name: "Sign in" }),
    ).toBeInTheDocument();
    expect(container.querySelector(".account-shell")).toBeInTheDocument();
    expect(container.querySelector('input[name="next"]')).toHaveValue(
      "/rewards",
    );
    expect(
      screen.getByRole("link", { name: "Forgot password" }),
    ).toHaveAttribute("href", "/account/forgot-password");
    expect(
      screen.getByRole("link", { name: "Create account" }),
    ).toHaveAttribute("href", "/account/sign-up");
  });

  it("renders support and legal static pages", () => {
    const pages = [
      { element: <FAQPage />, heading: /^FAQ$/i },
      { element: <ContactPage />, heading: /^Contact$/i },
      { element: <PrivacyPage />, heading: /^Privacy Policy$/i },
      { element: <TermsPage />, heading: /^Terms of Service$/i },
      { element: <CookiePolicyPage />, heading: /^Cookie Policy$/i },
      { element: <PrivacyChoicesPage />, heading: /^Your Privacy Choices$/i },
      { element: <AccessibilityPage />, heading: /^Accessibility Statement$/i },
    ];

    for (const page of pages) {
      const { unmount } = render(page.element);
      expect(
        screen.getByRole("heading", { level: 1, name: page.heading }),
      ).toBeInTheDocument();
      unmount();
    }
  });

  it("Admin renders its registered-module overview", () => {
    render(<AdminPage />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Admin overview" }),
    ).toBeInTheDocument();
  });
});
