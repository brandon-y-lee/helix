import { fireEvent, render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const headerMocks = vi.hoisted(() => ({
  pathname: "/admin/catalog/preview/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  openCartDrawer: vi.fn(),
  closeCartDrawer: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => headerMocks.pathname,
}));
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/components/cart/CartProvider", () => ({
  useCartDrawer: () => ({
    cartDrawerOpen: false,
    openCartDrawer: headerMocks.openCartDrawer,
    closeCartDrawer: headerMocks.closeCartDrawer,
    returnFocusAfterCartDrawerClose: vi.fn(),
  }),
}));
vi.mock("@/components/cart/useCart", () => ({
  useCartCount: () => ({ count: 2, hasLoadedCart: true, error: null }),
}));
vi.mock("@/components/search/SearchOverlay", () => ({
  SearchOverlay: () => null,
}));
vi.mock("@/components/overlays/Sheet", () => ({
  Sheet: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

import { Header } from "@/components/shell/Header";

beforeEach(() => {
  headerMocks.pathname =
    "/admin/catalog/preview/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  headerMocks.openCartDrawer.mockReset();
  headerMocks.closeCartDrawer.mockReset();
});

describe("Header draft preview commerce", () => {
  it("renders one accessible helix home link with the canonical wordmark", () => {
    const { container } = render(<Header />);

    const homeLink = screen.getByRole("link", { name: "helix home" });
    expect(homeLink).toHaveAttribute("href", "/");
    expect(homeLink.querySelector('[data-helix-identity="wordmark"]')).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(container).not.toHaveTextContent("MEI PELLE");
  });

  it("renders the standalone symbol for the compact mobile menu context", () => {
    render(<Header />);

    expect(screen.getByRole("img", { name: "helix" })).toHaveAttribute(
      "data-helix-identity",
      "symbol",
    );
  });

  it("keeps the cart control visible but prevents the drawer from opening", () => {
    render(<Header commerceDisabled />);
    const cart = screen.getByRole("button", {
      name: "Cart unavailable in Catalog Preview",
    });

    expect(cart).toBeDisabled();
    fireEvent.click(cart);
    expect(headerMocks.openCartDrawer).not.toHaveBeenCalled();
  });

  it("does not change public header cart behavior", () => {
    headerMocks.pathname = "/products/cleanse-01-calming-gel-cleanser";
    render(<Header />);
    const cart = screen.getByRole("button", { name: /CART \(2\)/ });

    expect(cart).toBeEnabled();
    fireEvent.click(cart);
    expect(headerMocks.openCartDrawer).toHaveBeenCalledTimes(1);
  });
});
