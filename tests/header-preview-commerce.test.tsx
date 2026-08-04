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
  it("renders the theme selected by the application chrome", () => {
    render(<Header theme="light" />);

    expect(document.querySelector(".site-header")).toHaveAttribute(
      "data-header-theme",
      "light",
    );
  });

  it("keeps the cart control visible but prevents the drawer from opening", () => {
    render(<Header commerceDisabled theme="dark" />);
    const cart = screen.getByRole("button", {
      name: "Cart unavailable in draft preview",
    });

    expect(cart).toBeDisabled();
    fireEvent.click(cart);
    expect(headerMocks.openCartDrawer).not.toHaveBeenCalled();
  });

  it("does not change public header cart behavior", () => {
    headerMocks.pathname = "/products/cleanse-01-calming-gel-cleanser";
    render(<Header theme="dark" />);
    const cart = screen.getByRole("button", { name: /CART \(2\)/ });

    expect(cart).toBeEnabled();
    fireEvent.click(cart);
    expect(headerMocks.openCartDrawer).toHaveBeenCalledTimes(1);
  });
});
