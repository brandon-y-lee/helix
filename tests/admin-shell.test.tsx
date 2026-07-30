import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

let pathname = "/admin";

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

vi.mock("@/app/account/actions", () => ({
  signOutAction: vi.fn(),
}));

vi.mock("@/components/Header", () => ({
  Header: () => <div>Storefront customer navigation</div>,
}));

vi.mock("@/components/SiteFooter", () => ({
  SiteFooter: () => <div>Storefront customer footer</div>,
}));

vi.mock("@/components/CartProvider", () => ({
  CartProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="cart-provider">{children}</div>
  ),
}));

vi.mock("@/components/StorefrontMain", () => ({
  StorefrontMain: ({ children }: { children: React.ReactNode }) => (
    <main>{children}</main>
  ),
}));

import { ApplicationChrome } from "@/components/ApplicationChrome";
import { AdminNavigation } from "@/components/admin/shell/AdminNavigation";
import { AdminShell } from "@/components/admin/shell/AdminShell";
import type { AdminModule } from "@/lib/admin/modules";

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
});

describe("admin shell navigation", () => {
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

  it("removes storefront customer chrome from every admin route", () => {
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
});
