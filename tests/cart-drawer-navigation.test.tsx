import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AnchorHTMLAttributes } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CartLine } from "@/lib/cart/types";

const routeState = vi.hoisted(() => ({
  pathname: "/products",
}));

const cartMock = vi.hoisted(() => ({
  lines: [] as CartLine[],
  subtotal: 2200,
  count: 1,
  loading: false,
  hasLoadedCart: true,
  error: null as string | null,
  retryable: false,
  refresh: vi.fn(),
  setQuantity: vi.fn(),
  remove: vi.fn(),
  clear: vi.fn(),
  isLinePending: vi.fn(() => false),
  isClearing: false,
  isMutating: false,
  resetErrors: vi.fn(),
  checkoutPending: false,
  checkoutError: null,
  startCheckout: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => routeState.pathname,
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    onClick,
    children,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a
      href={href}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) event.preventDefault();
      }}
      {...props}
    >
      {children}
    </a>
  ),
}));

vi.mock("@/components/useCart", () => ({
  useCart: () => cartMock,
  useCartMutations: () => cartMock,
}));

import { CartView } from "@/components/CartView";

const line: CartLine = {
  key: "line-cleanse-200ml",
  slug: "cleanse-01-calming-gel-cleanser",
  name: "CLEANSE",
  collection: "THE SYSTEM",
  variantId: "200ml",
  variantLabel: "200 mL",
  price: 2200,
  quantity: 1,
  lineSubtotal: 2200,
  swatch: ["#dce8df", "#7e9285"],
  imageUrl: null,
  imageAlt: null,
  placeholderMedia: null,
  available: true,
  warning: null,
};

beforeEach(() => {
  routeState.pathname = "/products";
  cartMock.lines = [line];
  cartMock.subtotal = 2200;
  cartMock.count = 1;
  cartMock.loading = false;
  cartMock.error = null;
  cartMock.setQuantity.mockReset();
  cartMock.remove.mockReset();
  cartMock.clear.mockReset();
  cartMock.refresh.mockReset();
  cartMock.resetErrors.mockReset();
  cartMock.startCheckout.mockReset();
});

describe("CartView drawer navigation", () => {
  it("keeps drawer open while navigating and closes after /cart commits", async () => {
    const user = userEvent.setup();
    const onContinue = vi.fn();
    const { rerender } = render(
      <CartView mode="drawer" onContinue={onContinue} />,
    );

    const viewCart = screen.getByRole("link", { name: "View cart" });
    expect(viewCart).toHaveAttribute("href", "/cart");
    expect(viewCart).toHaveClass("btn--editorial-rounded");
    expect(screen.getByRole("button", { name: /Sandbox checkout/ })).toHaveClass(
      "btn--editorial-rounded",
    );
    expect(screen.getByRole("button", { name: /Increase CLEANSE quantity/ })).not.toHaveClass(
      "btn--editorial-rounded",
    );

    await user.click(viewCart);
    expect(onContinue).not.toHaveBeenCalled();
    expect(cartMock.clear).not.toHaveBeenCalled();
    expect(screen.getByText("CLEANSE")).toBeInTheDocument();

    routeState.pathname = "/cart";
    rerender(<CartView mode="drawer" onContinue={onContinue} />);

    await waitFor(() => expect(onContinue).toHaveBeenCalledTimes(1));
    expect(screen.getByText("CLEANSE")).toBeInTheDocument();
  });

  it("closes immediately when View cart is activated on the cart route", () => {
    routeState.pathname = "/cart";
    const onContinue = vi.fn();
    render(<CartView mode="drawer" onContinue={onContinue} />);

    fireEvent.click(screen.getByRole("link", { name: "View cart" }));

    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(cartMock.clear).not.toHaveBeenCalled();
  });

  it("preserves new-tab link behavior in the current drawer", () => {
    const onContinue = vi.fn();
    const { rerender } = render(
      <CartView mode="drawer" onContinue={onContinue} />,
    );

    fireEvent.click(screen.getByRole("link", { name: "View cart" }), {
      metaKey: true,
    });
    routeState.pathname = "/cart";
    rerender(<CartView mode="drawer" onContinue={onContinue} />);

    expect(onContinue).not.toHaveBeenCalled();
    expect(screen.getByText("CLEANSE")).toBeInTheDocument();
  });

  it("does not close for unrelated route changes", async () => {
    const user = userEvent.setup();
    const onContinue = vi.fn();
    const { rerender } = render(
      <CartView mode="drawer" onContinue={onContinue} />,
    );

    await user.click(screen.getByRole("link", { name: "View cart" }));
    routeState.pathname = "/account";
    rerender(<CartView mode="drawer" onContinue={onContinue} />);

    expect(onContinue).not.toHaveBeenCalled();
  });
});
