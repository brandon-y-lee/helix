import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FORMER_BRAND_PATTERN } from "@/tests/helpers/former-identifiers";

let pathname = "/admin";

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

vi.mock("@/app/account/actions", () => ({
  signOutAction: vi.fn(),
}));

vi.mock("@/components/shell/Header", () => ({
  Header: ({ commerceDisabled }: { commerceDisabled?: boolean }) => (
    <div data-commerce-disabled={String(Boolean(commerceDisabled))}>
      Storefront customer navigation
    </div>
  ),
}));

vi.mock("@/components/shell/SiteFooter", () => ({
  SiteFooter: () => <div>Storefront customer footer</div>,
}));

vi.mock("@/components/cart/CartDrawer", () => ({
  CartDrawerHost: () => null,
}));

vi.mock("@/components/cart/CartProvider", () => ({
  CartProvider: ({
    children,
    disabled,
  }: {
    children: React.ReactNode;
    disabled?: boolean;
  }) => (
    <div data-testid="cart-provider" data-disabled={String(Boolean(disabled))}>
      {children}
    </div>
  ),
}));

import { ApplicationChrome } from "@/components/shell/ApplicationChrome";
import { AdminNavigation } from "@/components/admin/shell/AdminNavigation";
import { AdminShell } from "@/components/admin/shell/AdminShell";
import type { AdminModule } from "@/lib/admin/modules";
import { adminReturnPath } from "@/lib/admin/routes";

const modules: AdminModule[] = [
  {
    id: "catalog",
    label: "Catalog Editor",
    route: "/admin/catalog",
    description: "Catalog module.",
    requiredCapability: "catalog.read",
    navigationOrder: 10,
    status: "unavailable",
  },
];

beforeEach(() => {
  pathname = "/admin";
  window.localStorage.clear();
});

describe("admin shell navigation", () => {
  it("keeps only same-origin admin return paths", () => {
    expect(
      adminReturnPath(
        "/admin/catalog/preview/123e4567-e89b-42d3-a456-426614174004",
      ),
    ).toBe(
      "/admin/catalog/preview/123e4567-e89b-42d3-a456-426614174004",
    );
    expect(adminReturnPath("https://attacker.example/admin")).toBe("/admin");
  });

  it("keeps desktop navigation keyboard reachable", async () => {
    const user = userEvent.setup();
    render(
      <AdminNavigation
        pathname="/admin"
        modules={[
          {
            ...modules[0],
            status: "active",
          },
        ]}
      />,
    );

    await user.tab();
    expect(screen.getByRole("link", { name: "Overview" })).toHaveFocus();
    await user.tab();
    expect(
      screen.getByRole("link", { name: "Catalog Editor" }),
    ).toHaveFocus();
  });

  it("closes the mobile drawer with Escape and restores menu focus", async () => {
    const user = userEvent.setup();
    render(
      <AdminShell accountLabel="operator@example.com" modules={modules}>
        <h1>Admin overview</h1>
      </AdminShell>,
    );

    const menuButton = screen.getByRole("button", { name: "Menu" });
    await user.click(menuButton);

    const dialog = screen.getByRole("dialog", { name: "Admin menu" });
    await waitFor(() => {
      expect(within(dialog).getByRole("button", { name: "Close" })).toHaveFocus();
    });

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog", { name: "Admin menu" })).toBeNull();
    expect(menuButton).toHaveFocus();
  });

  it("renders the canonical wordmark in the mobile admin header", () => {
    const { container } = render(
      <AdminShell accountLabel="operator@example.com" modules={modules}>
        <h1>Admin overview</h1>
      </AdminShell>,
    );

    const mobileBrand = container.querySelector(".admin-mobile-header__brand");
    expect(mobileBrand).toHaveAccessibleName("helix Admin");
    expect(
      mobileBrand?.querySelector('[data-helix-identity="wordmark"]'),
    ).toHaveAttribute("aria-hidden", "true");
    expect(mobileBrand).not.toHaveTextContent(FORMER_BRAND_PATTERN);
  });

  it("collapses the desktop sidebar and restores the browser preference", async () => {
    const user = userEvent.setup();
    const activeModules = [{ ...modules[0], status: "active" as const }];
    const first = render(
      <AdminShell accountLabel="operator@example.com" modules={activeModules}>
        <h1>Admin overview</h1>
      </AdminShell>,
    );
    const adminBrand = first.container.querySelector(".admin-brand");

    expect(adminBrand).toHaveAccessibleName("helix Admin");
    expect(
      adminBrand?.querySelector('[data-helix-identity="wordmark"]'),
    ).toHaveAttribute("aria-hidden", "true");
    expect(adminBrand).not.toHaveTextContent(FORMER_BRAND_PATTERN);
    expect(adminBrand).not.toHaveTextContent(/\bMP\b/);

    await user.click(
      screen.getByRole("button", { name: "Collapse admin sidebar" }),
    );
    expect(first.container.querySelector(".admin-shell")).toHaveAttribute(
      "data-sidebar-collapsed",
      "true",
    );
    expect(window.localStorage.getItem("helix-admin-sidebar-collapsed")).toBe(
      "true",
    );
    expect(screen.getByRole("link", { name: "Overview" })).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Catalog Editor" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeVisible();
    expect(
      adminBrand?.querySelector('[data-helix-identity="symbol"]'),
    ).toHaveAttribute("aria-hidden", "true");
    expect(adminBrand).toHaveAttribute("title", "helix Admin");

    first.unmount();
    const restored = render(
      <AdminShell accountLabel="operator@example.com" modules={activeModules}>
        <h1>Admin overview</h1>
      </AdminShell>,
    );
    await waitFor(() =>
      expect(restored.container.querySelector(".admin-shell")).toHaveAttribute(
        "data-sidebar-collapsed",
        "true",
      ),
    );
  });

  it("keeps the collapsed current route identifiable and keyboard togglable", async () => {
    pathname = "/admin/catalog/products/product-cleanse";
    window.localStorage.setItem("helix-admin-sidebar-collapsed", "true");
    const user = userEvent.setup();
    const { container } = render(
      <AdminShell
        accountLabel="operator@example.com"
        modules={[{ ...modules[0], status: "active" }]}
      >
        <h1>Product editor</h1>
      </AdminShell>,
    );

    const toggle = await screen.findByRole("button", {
      name: "Expand admin sidebar",
    });
    expect(
      screen.getByRole("link", { name: "Catalog Editor" }),
    ).toHaveAttribute("aria-current", "page");
    toggle.focus();
    await user.keyboard("{Enter}");
    expect(container.querySelector(".admin-shell")).not.toHaveAttribute(
      "data-sidebar-collapsed",
    );
  });

  it("removes storefront customer chrome from standard admin routes", () => {
    pathname = "/admin/catalog";
    render(
      <ApplicationChrome>
        <div>Protected admin content</div>
      </ApplicationChrome>,
    );

    expect(screen.getByText("Protected admin content")).toBeInTheDocument();
    expect(screen.queryByText("Storefront customer navigation")).toBeNull();
    expect(screen.queryByText("Storefront customer footer")).toBeNull();
    expect(screen.queryByTestId("cart-provider")).toBeNull();
  });

  it("renders draft previews in storefront chrome with commerce disabled", () => {
    pathname =
      "/admin/catalog/preview/123e4567-e89b-42d3-a456-426614174004";
    render(
      <ApplicationChrome>
        <div>Draft product detail</div>
      </ApplicationChrome>,
    );

    expect(screen.getByText("Draft product detail").closest("main")).toHaveAttribute(
      "data-storefront-main",
    );
    expect(screen.getByText("Storefront customer navigation")).toHaveAttribute(
      "data-commerce-disabled",
      "true",
    );
    expect(screen.getByTestId("cart-provider")).toHaveAttribute(
      "data-disabled",
      "true",
    );
    expect(
      screen.getByText("Draft product detail").closest("[data-viewport-page]"),
    ).toBeNull();
    expect(screen.getByText("Storefront customer footer")).toBeInTheDocument();
  });

  it("frames standard storefront pages to fill the viewport", () => {
    pathname = "/search";
    render(
      <ApplicationChrome>
        <div>Search page content</div>
      </ApplicationChrome>,
    );

    expect(
      screen.getByText("Search page content").closest("[data-viewport-page]"),
    ).toHaveClass("storefront-page-frame");
  });

  it("preserves declarative header presentation from storefront content", () => {
    pathname = "/";
    render(
      <ApplicationChrome>
        <div data-header-layout="overlay" data-header-theme="light">
          Homepage content
        </div>
      </ApplicationChrome>,
    );

    const homepageContent = screen.getByText("Homepage content");
    expect(homepageContent.closest("main")).toHaveAttribute(
      "data-storefront-main",
    );
    expect(homepageContent).toHaveAttribute("data-header-layout", "overlay");
    expect(homepageContent).toHaveAttribute("data-header-theme", "light");
    expect(homepageContent.closest("[data-viewport-page]")).toBeNull();
  });

  it("leaves product detail pages outside the viewport frame", () => {
    pathname = "/products/treat-03-pdrn-5-ampoule";
    render(
      <ApplicationChrome>
        <div>Product detail content</div>
      </ApplicationChrome>,
    );

    expect(
      screen.getByText("Product detail content").closest("[data-viewport-page]"),
    ).toBeNull();
  });
});
