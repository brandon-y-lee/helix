import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/catalog-cache", () => ({
  getCachedProductCards: vi.fn(async () => []),
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUserForPublicPage: vi.fn(async () => null),
}));

import SignInPage from "@/app/account/sign-in/page";
import CartPage from "@/app/cart/page";
import CollectionPage, {
  generateMetadata as generateCollectionMetadata,
} from "@/app/collections/[collection]/page";
import { CartProvider } from "@/components/cart/CartProvider";

beforeEach(() => {
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

describe("storefront route states", () => {
  it("renders a clear Shop empty state", async () => {
    render(
      await CollectionPage({
        params: Promise.resolve({ collection: "shop" }),
      }),
    );

    expect(
      screen.getByRole("heading", { level: 1, name: "raise your baseline" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("navigation", { name: "Shop collections" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Shop All" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      screen.getByText(/no products are available in this collection/i),
    ).toBeInTheDocument();
    expect(
      await generateCollectionMetadata({
        params: Promise.resolve({ collection: "shop" }),
      }),
    ).toEqual({ title: "Shop All | Mei Pelle" });
  });

  it("renders the Cart empty state inside its provider", async () => {
    render(
      <CartProvider>
        {await CartPage({ searchParams: Promise.resolve({}) })}
      </CartProvider>,
    );

    expect(screen.getByRole("heading", { level: 1, name: "Cart" })).toBeVisible();
    expect(await screen.findByText(/your cart is empty/i)).toBeVisible();
  });

  it("renders a generic checkout cancellation notice without order details", async () => {
    render(
      <CartProvider>
        {await CartPage({
          searchParams: Promise.resolve({ checkout: "cancelled" }),
        })}
      </CartProvider>,
    );

    const notice = screen.getByRole("status");
    expect(notice).toHaveTextContent(
      "Sandbox checkout was cancelled. Your cart is still here.",
    );
    expect(notice).not.toHaveTextContent(/order|session|payment intent/i);
  });

  it("wires the safe sign-in return path and recovery links", async () => {
    const { container } = render(
      await SignInPage({
        searchParams: Promise.resolve({ next: "/rewards" }),
      }),
    );

    expect(
      screen.getByRole("heading", { level: 1, name: "Sign in" }),
    ).toBeVisible();
    expect(container.querySelector('input[name="next"]')).toHaveValue(
      "/rewards",
    );
    expect(screen.getByRole("link", { name: "Forgot password" })).toHaveAttribute(
      "href",
      "/account/forgot-password",
    );
    expect(screen.getByRole("link", { name: "Create account" })).toHaveAttribute(
      "href",
      "/account/sign-up",
    );
  });
});
