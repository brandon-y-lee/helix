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
import CartPage from "@/app/cart/page";
import CheckoutPage from "@/app/checkout/page";
import SignInPage from "@/app/account/sign-in/page";
import AdminPage from "@/app/admin/page";
import { CartProvider } from "@/components/CartProvider";
import { getCachedProducts } from "@/lib/catalog-cache";
import type { Product } from "@/lib/products";

const mockedGetProducts = getCachedProducts as unknown as Mock;

function makeProduct(overrides: Partial<Product> & Pick<Product, "slug" | "name">): Product {
  return {
    tagline: "Tagline",
    collection: "Cleanse",
    blurb: "A short descriptor.",
    description: "Description.",
    benefits: [],
    howToUse: "",
    variants: [{ id: "50ml", label: "50 ml", price: 2000 }],
    swatch: ["#ffffff", "#000000"],
    status: "available",
    madeFor: "All skin types",
    goodFor: "Everyday",
    texture: "Light gel",
    createdAt: "2026-06-14T00:00:00.000Z",
    ...overrides,
  };
}

const fixtures: Product[] = [
  makeProduct({ slug: "alpha-cleanser", name: "Alpha Cleanser", collection: "Cleanse" }),
  makeProduct({ slug: "beta-serum", name: "Beta Serum", collection: "Treat" }),
  makeProduct({ slug: "gamma-cream", name: "Gamma Cream", collection: "Hydrate" }),
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
      screen.getByRole("link", { name: /SHOP THE SYSTEM/i }),
    ).toHaveAttribute("href", "/products");
  });

  it("Shop renders its h1 and a card per product", async () => {
    render(
      <CartProvider>
        {await ProductsPage({ searchParams: Promise.resolve({}) })}
      </CartProvider>,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Shop" }),
    ).toBeInTheDocument();
    for (const product of fixtures) {
      // Each card has a media link (aria-label includes the tagline) and a name
      // link (accessible name === product name); match the latter exactly.
      expect(
        screen.getByRole("link", { name: product.name }),
      ).toHaveAttribute("href", `/products/${product.slug}`);
    }
  });

  it("Shop renders a clear empty state when the catalog is empty", async () => {
    mockedGetProducts.mockResolvedValue([]);
    render(await ProductsPage({ searchParams: Promise.resolve({}) }));
    expect(
      screen.getByRole("heading", { level: 1, name: "Shop" }),
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
