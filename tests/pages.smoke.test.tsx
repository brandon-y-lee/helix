import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

// Mock the catalog data layer so the async server pages render deterministically
// without touching Supabase or the network. formatPrice and types stay real.
vi.mock("@/lib/catalog-cache", () => {
  return {
    getCachedProducts: vi.fn(),
    getCachedProduct: vi.fn(),
    getCachedRelatedProducts: vi.fn(),
  };
});

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn(async () => null),
}));

import HomePage from "@/app/page";
import ProductsPage from "@/app/products/page";
import MethodPage from "@/app/method/page";
import AboutPage from "@/app/about/page";
import CartPage from "@/app/cart/page";
import CheckoutPage from "@/app/checkout/page";
import SignInPage from "@/app/account/sign-in/page";
import AdminPage from "@/app/admin/page";
import { CartProvider } from "@/components/CartProvider";
import { getCachedProducts } from "@/lib/catalog-cache";
import type { Product } from "@/lib/products";

const mockedGetProducts = getCachedProducts as unknown as Mock;

function makeProduct(overrides: Partial<Product> & Pick<Product, "slug" | "name">): Product {
  const base: Product = {
    id: "11111111-1111-4111-8111-111111111111",
    slug: overrides.slug,
    displayName: overrides.displayName ?? overrides.name,
    formalTitle: overrides.formalTitle ?? overrides.name,
    name: overrides.displayName ?? overrides.name,
    tagline: "Tagline",
    cardTagline: overrides.cardTagline ?? "Tagline",
    collection: "Cleanse",
    actionName: null,
    routineNumber: null,
    subtitle: "Tagline",
    descriptor: "A short descriptor.",
    productType: "Cleanser",
    badge: null,
    currency: "USD",
    featuredRank: 0,
    sortOrder: 0,
    blurb: "A short descriptor.",
    description: "Description.",
    editorialDescription: "Description.",
    benefits: [],
    howToUse: "",
    editorialHowToUse: "",
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
    productDetails: {},
    cautions: [],
    finish: null,
    volume: null,
    skinTypes: [],
    concerns: [],
    routineStep: null,
    routineOrder: null,
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
    slug: "reset-01-calming-gel-cleanser",
    name: "RESET",
    displayName: "RESET",
    collection: "THE SYSTEM",
    routineNumber: "01",
    routineStep: "Cleanse",
    productType: "Gel cleanser",
    keyIngredients: ["6-Type Cica Complex", "Centella-derived support"],
    usageTime: ["AM", "PM"],
  }),
  makeProduct({
    slug: "refine-02-pore-treatment-pads",
    name: "REFINE",
    displayName: "REFINE",
    collection: "THE SYSTEM",
    routineNumber: "02",
    routineStep: "Treat",
    productType: "Toner pad",
    keyIngredients: ["Panthenol", "Sodium hyaluronate", "LHA"],
    ingredients: "Panthenol, Sodium Hyaluronate, Glycerin",
    usageTime: ["AM", "PM"],
  }),
  makeProduct({
    slug: "recode-03-pdrn-5-ampoule",
    name: "RECODE",
    displayName: "RECODE",
    collection: "THE SYSTEM",
    routineNumber: "03",
    routineStep: "Treat",
    productType: "Ampoule / Serum",
    keyIngredients: ["Sodium DNA (50,000 ppm)", "Niacinamide", "Copper Tripeptide-1"],
    ingredients: "Sodium DNA (50,000 ppm), Niacinamide, Glycerin, Copper Tripeptide-1",
    usageTime: ["AM", "PM"],
  }),
  makeProduct({
    slug: "frame-04-pdrn-eye-cream",
    name: "FRAME",
    displayName: "FRAME",
    collection: "THE SYSTEM",
    routineNumber: "04",
    routineStep: "Eye",
    productType: "Eye contour cream",
    keyIngredients: ["Sodium DNA", "Niacinamide", "Panthenol"],
    ingredients: "Sodium DNA, Niacinamide, Panthenol",
    usageTime: ["AM", "PM"],
  }),
  makeProduct({
    slug: "seal-05-green-collagen-cream",
    name: "SEAL",
    displayName: "SEAL",
    collection: "THE SYSTEM",
    routineNumber: "05",
    routineStep: "Moisturize",
    productType: "Cream",
    keyIngredients: ["Green collagen complex", "Sodium hyaluronate", "Panthenol"],
    ingredients: "Sodium Hyaluronate, Panthenol",
    usageTime: ["AM", "PM"],
  }),
  makeProduct({
    slug: "lift-06-pdrn-mask-system",
    name: "LIFT",
    displayName: "LIFT",
    collection: "INTENSIVE",
    routineNumber: "07",
    routineStep: "Weekly intensive",
    productType: "Sheet mask",
    keyIngredients: ["Sodium DNA (5,000 ppm)", "Niacinamide", "Glycerin"],
    ingredients: "Sodium DNA (5,000 ppm), Niacinamide, Glycerin",
    usageTime: ["Weekly", "PM"],
  }),
];

beforeEach(() => {
  mockedGetProducts.mockReset();
  mockedGetProducts.mockResolvedValue(fixtures);
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

// Storefront smoke verification: render each page component and assert its
// primary signal renders. The async [slug] detail page and the interactive
// cart/add-to-cart flows are covered by the e2e suite.
describe("storefront page smoke", () => {
  it("Home renders its hero h1 and featured cards", async () => {
    // HomePage is an async server component; await it to get its element tree.
    // ProductCard consumes the cart context, so wrap in CartProvider.
    render(<CartProvider>{await HomePage()}</CartProvider>);
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "ASCEND.",
      }),
    ).toBeInTheDocument();
    // Featured grid links to product detail pages.
    expect(
      screen.getByRole("link", { name: /Shop the system/i }),
    ).toHaveAttribute("href", "/products");
  });

  it("Shop renders its h1 and a card per product", async () => {
    render(
      <CartProvider>
        {await ProductsPage({ searchParams: Promise.resolve({}) })}
      </CartProvider>,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "RAISE YOUR BASELINE." }),
    ).toBeInTheDocument();
    for (const product of fixtures) {
      // Each card has a media link (aria-label includes the tagline) and a name
      // link (accessible name === product name); match the latter exactly.
      expect(
        screen.getByRole("link", { name: product.displayName }),
      ).toHaveAttribute("href", `/products/${product.slug}`);
    }
  });

  it("Method renders its instructional h1 and SPF education", async () => {
    render(await MethodPage());
    expect(
      screen.getByRole("heading", { level: 1, name: "THE METHOD." }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("A system for clearer, healthier, beautiful skin"),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "PROTECT" })).toBeInTheDocument();
    expect(screen.getAllByText("COMING SOON").length).toBeGreaterThan(0);
  });

  it("About renders its narrative h1", () => {
    render(<AboutPage />);
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "TWO CITIES. ONE STANDARD.",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("MEN DESERVE A BETTER SYSTEM.")).toBeInTheDocument();
  });

  it("Shop renders a clear empty state when the catalog is empty", async () => {
    mockedGetProducts.mockResolvedValue([]);
    render(await ProductsPage({ searchParams: Promise.resolve({}) }));
    expect(
      screen.getByRole("heading", { level: 1, name: "RAISE YOUR BASELINE." }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/no products are available/i),
    ).toBeInTheDocument();
  });

  it("Cart renders its h1 (empty state) inside the provider", async () => {
    render(
      <CartProvider>
        <CartPage />
      </CartProvider>,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Cart" }),
    ).toBeInTheDocument();
    expect(await screen.findByText(/your cart is empty/i)).toBeInTheDocument();
  });

  it("Checkout renders its h1", () => {
    render(<CheckoutPage />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Checkout" }),
    ).toBeInTheDocument();
  });

  it("Account sign-in renders its h1", async () => {
    render(await SignInPage({ searchParams: Promise.resolve({}) }));
    expect(
      screen.getByRole("heading", { level: 1, name: "Sign in" }),
    ).toBeInTheDocument();
  });

  it("Admin renders its h1", () => {
    render(<AdminPage />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Admin" }),
    ).toBeInTheDocument();
  });
});
