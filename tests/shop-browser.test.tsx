import type { ComponentProps } from "react";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ProductCard } from "@/lib/catalog/models";

const router = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/link", () => ({
  default: ({
    children,
    onNavigate,
    scroll,
    ...props
  }: ComponentProps<"a"> & {
    onNavigate?: (event: { preventDefault: () => void }) => void;
    scroll?: boolean;
  }) => (
    <a
      {...props}
      data-scroll={String(scroll)}
      onClick={(event) =>
        onNavigate?.({ preventDefault: () => event.preventDefault() })
      }
    >
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

vi.mock("motion/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("motion/react")>();
  return {
    ...actual,
    useReducedMotion: () => true,
  };
});

vi.mock("@/components/product/ProductGrid", () => ({
  ProductGrid: ({ products }: { products: ProductCard[] }) => (
    <ul aria-label="Product results">
      {products.map((product) => (
        <li key={product.id}>{product.displayName}</li>
      ))}
    </ul>
  ),
}));

import { ShopBrowser } from "@/components/product/ShopBrowser";

function product(
  id: string,
  displayName: string,
  price: number,
  createdAt: string,
) {
  return {
    id,
    slug: id,
    displayName,
    createdAt,
    variants: [{ price }],
  } as ProductCard;
}

const products = [
  product("alpha", "ALPHA", 25, "2026-01-01T00:00:00.000Z"),
  product("gamma", "GAMMA", 12, "2026-03-01T00:00:00.000Z"),
  product("beta", "BETA", 40, "2026-02-01T00:00:00.000Z"),
];

function productNames() {
  return within(screen.getByRole("list", { name: "Product results" }))
    .getAllByRole("listitem")
    .map((item) => item.textContent);
}

let phoneLayout = false;
const mediaListeners = new Set<() => void>();

function setPhoneLayout(matches: boolean) {
  act(() => {
    phoneLayout = matches;
    mediaListeners.forEach((listener) => listener());
  });
}

describe("ShopBrowser collection controls", () => {
  beforeEach(() => {
    router.push.mockClear();
    phoneLayout = false;
    mediaListeners.clear();
    vi.stubGlobal("matchMedia", (query: string) => ({
      get matches() { return query === "(max-width: 720px)" && phoneLayout; },
      media: query,
      addEventListener: (_event: string, listener: () => void) => mediaListeners.add(listener),
      removeEventListener: (_event: string, listener: () => void) => mediaListeners.delete(listener),
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sorts in a phone modal, traps focus and restores the collection trigger", async () => {
    setPhoneLayout(true);
    const user = userEvent.setup();
    render(<ShopBrowser products={products} activeCollection="shop" />);

    const trigger = screen.getByRole("button", { name: "Sort: Featured" });
    await user.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "Sort products" });
    expect(document.body.style.overflow).toBe("hidden");
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Featured" })).toHaveFocus());
    await user.keyboard("{End}");
    expect(within(dialog).getByRole("button", { name: "Newest first" })).toHaveFocus();
    await user.tab();
    expect(within(dialog).getByRole("button", { name: "Close" })).toHaveFocus();
    await user.tab({ shift: true });
    expect(within(dialog).getByRole("button", { name: "Newest first" })).toHaveFocus();

    await user.click(within(dialog).getByRole("button", { name: "Price, low to high" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(document.body.style.overflow).toBe("");
      expect(productNames()).toEqual(["GAMMA", "ALPHA", "BETA"]);
      expect(screen.getByRole("button", { name: "Sort: Price, low to high" })).toHaveFocus();
    });
  });

  it("keeps the open sort choice and keyboard position when crossing the phone boundary", async () => {
    setPhoneLayout(true);
    const user = userEvent.setup();
    render(<ShopBrowser products={products} activeCollection="shop" />);

    await user.click(screen.getByRole("button", { name: "Sort: Featured" }));
    await user.click(screen.getByRole("button", { name: "Price, high to low" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const trigger = screen.getByRole("button", { name: "Sort: Price, high to low" });
    await user.click(trigger);
    await user.keyboard("{End}");

    setPhoneLayout(false);
    await waitFor(() => {
      expect(screen.getAllByRole("dialog", { name: "Sort products" })).toHaveLength(1);
      expect(screen.getByRole("button", { name: "Newest first" })).toHaveFocus();
      expect(document.body.style.overflow).toBe("");
    });
    expect(screen.getByRole("button", { name: "Price, high to low" })).toHaveAttribute("aria-pressed", "true");
    expect(productNames()).toEqual(["BETA", "ALPHA", "GAMMA"]);

    await user.keyboard("{Home}");
    setPhoneLayout(true);
    await waitFor(() => {
      expect(screen.getAllByRole("dialog", { name: "Sort products" })).toHaveLength(1);
      expect(screen.getByRole("button", { name: "Featured" })).toHaveFocus();
      expect(document.body.style.overflow).toBe("hidden");
    });
    expect(screen.getByRole("button", { name: "Price, high to low" })).toHaveAttribute("aria-pressed", "true");

    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
      expect(document.body.style.overflow).toBe("");
    });
    expect(router.push).not.toHaveBeenCalled();
  });

  it("reveals the selected phone collection by scrolling only its navigation row", async () => {
    setPhoneLayout(true);
    const view = render(<ShopBrowser products={products} activeCollection="shop" />);
    const navigation = screen.getByRole("navigation", { name: "Shop collections" });
    const beyond = within(navigation).getByRole("link", { name: "Beyond the Core" });
    const shop = within(navigation).getByRole("link", { name: "Shop All" });
    const pageScroll = vi.spyOn(window, "scrollTo");
    vi.spyOn(navigation, "getBoundingClientRect").mockReturnValue({ left: 16, right: 304 } as DOMRect);
    vi.spyOn(beyond, "getBoundingClientRect").mockReturnValue({ left: 250, right: 434 } as DOMRect);

    await act(async () => {
      view.rerender(<ShopBrowser products={products} activeCollection="beyond-the-core" />);
    });
    expect(navigation.scrollLeft).toBe(130);

    vi.spyOn(shop, "getBoundingClientRect").mockReturnValue({ left: -114, right: -18 } as DOMRect);
    await act(async () => {
      view.rerender(<ShopBrowser products={products} activeCollection="shop" />);
    });
    expect(navigation.scrollLeft).toBe(0);
    expect(pageScroll).not.toHaveBeenCalled();
  });

  it("preserves scroll on collection routes and sorts through the custom menu", async () => {
    const user = userEvent.setup();
    const view = render(
      <ShopBrowser products={products} activeCollection="shop" />,
    );

    const collectionNav = screen.getByRole("navigation", {
      name: "Shop collections",
    });
    const collectionLinks = within(collectionNav).getAllByRole("link");

    expect(collectionLinks).toHaveLength(3);
    collectionLinks.forEach((link) => {
      expect(link).toHaveAttribute("data-scroll", "false");
    });
    expect(
      within(collectionNav).getByRole("link", { name: "Shop All" }),
    ).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();

    const sortTrigger = screen.getByRole("button", {
      name: "Sort: Featured",
    });
    await user.click(sortTrigger);

    const sortDialog = screen.getByRole("dialog", { name: "Sort products" });
    expect(sortTrigger).toHaveAttribute("aria-expanded", "true");
    expect(
      within(sortDialog).getByRole("button", { name: "Featured" }),
    ).toHaveAttribute("aria-pressed", "true");

    await user.click(
      within(sortDialog).getByRole("button", {
        name: "Price, high to low",
      }),
    );

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Sort products" }),
      ).not.toBeInTheDocument();
      expect(productNames()).toEqual(["BETA", "ALPHA", "GAMMA"]);
    });
    expect(
      screen.getByRole("button", { name: "Sort: Price, high to low" }),
    ).toHaveFocus();

    view.rerender(
      <ShopBrowser
        products={[products[1], products[0]]}
        activeCollection="core"
      />,
    );

    await waitFor(() => {
      expect(productNames()).toEqual(["ALPHA", "GAMMA"]);
    });
    expect(
      screen.getByRole("button", { name: "Sort: Price, high to low" }),
    ).toBeInTheDocument();
  });

  it("finishes the outgoing fade before routing without scrolling", async () => {
    const user = userEvent.setup();
    render(<ShopBrowser products={products} activeCollection="shop" />);

    await user.click(screen.getByRole("link", { name: "Core" }));

    await waitFor(() => {
      expect(router.push).toHaveBeenCalledWith("/collections/core", {
        scroll: false,
      });
    });
  });

  it("supports keyboard navigation, focus trapping, and Escape restoration", async () => {
    const user = userEvent.setup();
    render(<ShopBrowser products={products} activeCollection="shop" />);

    const sortTrigger = screen.getByRole("button", {
      name: "Sort: Featured",
    });
    await user.click(sortTrigger);

    const sortDialog = screen.getByRole("dialog", { name: "Sort products" });
    const featured = within(sortDialog).getByRole("button", {
      name: "Featured",
    });
    const newest = within(sortDialog).getByRole("button", {
      name: "Newest first",
    });

    await waitFor(() => expect(featured).toHaveFocus());
    await user.keyboard("{End}");
    expect(newest).toHaveFocus();

    await user.tab();
    expect(
      within(sortDialog).getByRole("button", { name: "Close sort menu" }),
    ).toHaveFocus();

    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Sort products" }),
      ).not.toBeInTheDocument();
      expect(sortTrigger).toHaveFocus();
    });
  });
});
