import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";

import HomePage from "@/app/page";
import ProductsPage from "@/app/products/page";
import CartPage from "@/app/cart/page";
import CheckoutPage from "@/app/checkout/page";
import AccountPage from "@/app/account/page";
import AdminPage from "@/app/admin/page";
import { CartProvider } from "@/components/CartProvider";
import { products } from "@/lib/products";

// Storefront smoke verification: render each synchronous page component and
// assert its primary signal renders. The async [slug] detail page and the
// interactive cart/add-to-cart flows are covered by the e2e suite.
describe("storefront page smoke", () => {
  it("Home renders its hero h1 and featured cards", () => {
    render(<HomePage />);
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

  it("Shop renders its h1 and a card per product", () => {
    render(<ProductsPage />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Shop" }),
    ).toBeInTheDocument();
    for (const product of products) {
      expect(
        screen.getByRole("link", {
          name: new RegExp(product.name, "i"),
        }),
      ).toHaveAttribute("href", `/products/${product.slug}`);
    }
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
