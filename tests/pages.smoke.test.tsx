import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

// Mock the catalog data layer so the async server pages render deterministically
// without touching Supabase or the network. formatPrice and types stay real.
vi.mock("@/lib/catalog", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/catalog")>();
  return { ...actual, getProducts: vi.fn(), getProduct: vi.fn() };
});

import HomePage from "@/app/page";
import ProductsPage from "@/app/products/page";
import CartPage from "@/app/cart/page";
import CheckoutPage from "@/app/checkout/page";
import AccountPage from "@/app/account/page";
import AdminPage from "@/app/admin/page";
import { CartProvider } from "@/components/CartProvider";
import { getProducts } from "@/lib/catalog";
import type { Product } from "@/lib/products";

const mockedGetProducts = getProducts as unknown as Mock;

const fixtures: Product[] = [
  {
    slug: "alpha-cleanser",
    name: "Alpha Cleanser",
    tagline: "Daily wash",
    collection: "Cleanse",
    blurb: "A gentle daily cleanser.",
    description: "Description.",
    benefits: [],
    howToUse: "",
    variants: [{ id: "50ml", label: "50 ml", price: 2000 }],
    swatch: ["#ffffff", "#000000"],
  },
  {
    slug: "beta-serum",
    name: "Beta Serum",
    tagline: "Night serum",
    collection: "Treat",
    blurb: "An overnight serum.",
    description: "Description.",
    benefits: [],
    howToUse: "",
    variants: [{ id: "30ml", label: "30 ml", price: 5000 }],
    swatch: ["#ffffff", "#000000"],
  },
  {
    slug: "gamma-cream",
    name: "Gamma Cream",
    tagline: "Rich cream",
    collection: "Hydrate",
    blurb: "A restorative cream.",
    description: "Description.",
    benefits: [],
    howToUse: "",
    variants: [{ id: "50ml", label: "50 ml", price: 4000 }],
    swatch: ["#ffffff", "#000000"],
  },
];

beforeEach(() => {
  mockedGetProducts.mockReset();
  mockedGetProducts.mockResolvedValue(fixtures);
});

// Storefront smoke verification: render each page component and assert its
// primary signal renders. The async [slug] detail page and the interactive
// cart/add-to-cart flows are covered by the e2e suite.
describe("storefront page smoke", () => {
  it("Home renders its hero h1 and featured cards", async () => {
    // HomePage is an async server component; await it to get its element tree.
    render(await HomePage());
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: /skin that actually shows up/i,
      }),
    ).toBeInTheDocument();
    // Featured grid links to product detail pages.
    expect(
      screen.getByRole("link", { name: /Shop the collection/i }),
    ).toHaveAttribute("href", "/products");
  });

  it("Shop renders its h1 and a card per product", async () => {
    render(await ProductsPage());
    expect(
      screen.getByRole("heading", { level: 1, name: "Shop" }),
    ).toBeInTheDocument();
    for (const product of fixtures) {
      expect(
        screen.getByRole("link", { name: new RegExp(product.name, "i") }),
      ).toHaveAttribute("href", `/products/${product.slug}`);
    }
  });

  it("Shop renders a clear empty state when the catalog is empty", async () => {
    mockedGetProducts.mockResolvedValue([]);
    render(await ProductsPage());
    expect(
      screen.getByRole("heading", { level: 1, name: "Shop" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/no products are available/i),
    ).toBeInTheDocument();
  });

  it("Cart renders its h1 (empty state) inside the provider", () => {
    render(
      <CartProvider>
        <CartPage />
      </CartProvider>,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Cart" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/your cart is empty/i)).toBeInTheDocument();
  });

  it("Checkout renders its h1", () => {
    render(<CheckoutPage />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Checkout" }),
    ).toBeInTheDocument();
  });

  it("Account renders its h1", () => {
    render(<AccountPage />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Account" }),
    ).toBeInTheDocument();
  });

  it("Admin renders its h1", () => {
    render(<AdminPage />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Admin" }),
    ).toBeInTheDocument();
  });
});
