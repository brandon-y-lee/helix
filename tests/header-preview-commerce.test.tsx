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
vi.mock("@/components/CartProvider", () => ({
  useCartDrawer: () => ({
    cartDrawerOpen: false,
    openCartDrawer: headerMocks.openCartDrawer,
    closeCartDrawer: headerMocks.closeCartDrawer,
    returnFocusAfterCartDrawerClose: vi.fn(),
  }),
}));
vi.mock("@/components/useCart", () => ({
  useCartCount: () => ({ count: 2, hasLoadedCart: true, error: null }),
}));
vi.mock("@/components/SearchOverlay", () => ({
  SearchOverlay: () => null,
}));
vi.mock("@/components/Sheet", () => ({
  Sheet: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

import { Header } from "@/components/Header";

beforeEach(() => {
  headerMocks.pathname =
    "/admin/catalog/preview/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  headerMocks.openCartDrawer.mockReset();
  headerMocks.closeCartDrawer.mockReset();
});

describe("Header draft preview commerce", () => {
  it("keeps the cart control visible but prevents the drawer from opening", () => {
    render(<Header commerceDisabled />);
    const cart = screen.getByRole("button", {
      name: "Cart unavailable in draft preview",
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
