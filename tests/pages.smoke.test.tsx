import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";

import HomePage from "@/app/page";
import ProductsPage from "@/app/products/page";
import CartPage from "@/app/cart/page";
import CheckoutPage from "@/app/checkout/page";
import AccountPage from "@/app/account/page";
import AdminPage from "@/app/admin/page";

// Scaffold smoke verification: render each synchronous page component and
// assert its unique <h1> signal renders. The async [slug] page is covered
// by the e2e suite, not here (async server components are awkward under RTL).
describe("page shell smoke", () => {
  it("Home renders its h1", () => {
    render(<HomePage />);
    expect(screen.getByRole("heading", { level: 1, name: "Home" })).toBeInTheDocument();
  });

  it("Products renders its h1 and links to product slugs", () => {
    render(<ProductsPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Products" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Renewal Serum" })).toHaveAttribute(
      "href",
      "/products/renewal-serum",
    );
    expect(screen.getByRole("link", { name: "Daily Moisturizer" })).toHaveAttribute(
      "href",
      "/products/daily-moisturizer",
    );
  });

  it("Cart renders its h1", () => {
    render(<CartPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Cart" })).toBeInTheDocument();
  });

  it("Checkout renders its h1", () => {
    render(<CheckoutPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Checkout" })).toBeInTheDocument();
  });

  it("Account renders its h1", () => {
    render(<AccountPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Account" })).toBeInTheDocument();
  });

  it("Admin renders its h1", () => {
    render(<AdminPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Admin" })).toBeInTheDocument();
  });
});
