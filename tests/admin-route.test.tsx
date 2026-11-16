import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/lib/admin/capabilities", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin/capabilities")>()),
  checkAdminCapability: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => { throw new Error(`Redirect: ${url}`); },
}));

vi.mock("@/components/admin/shell/AdminRouteShell", () => ({
  AdminRouteShell: ({
    accountLabel,
    modules,
    children,
  }: {
    accountLabel: string;
    modules: readonly import("@/lib/admin/modules").AdminModule[];
    children: React.ReactNode;
  }) => (
    <div data-testid="admin-shell">
      <span>{accountLabel}</span>
      {modules.map((module) => (
        <a key={module.id} href={module.route}>
          {module.label}
        </a>
      ))}
      {children}
    </div>
  ),
}));

vi.mock("@/components/admin/shell/AdminAccessState", () => ({
  AdminAccessState: ({ state }: { state: string }) => (
    <div role="alert">{state}</div>
  ),
}));

import AdminError from "@/app/admin/error";
import AdminLayout, { metadata } from "@/app/admin/layout";
import AdminLoading from "@/app/admin/loading";
import AdminPage from "@/app/admin/page";
import { metadata as catalogMetadata } from "@/app/admin/catalog/page";
import { metadata as productEditorMetadata } from "@/app/admin/catalog/products/[productId]/page";
import {
  capabilitiesForRole,
  checkAdminCapability,
  type AdminRole,
} from "@/lib/admin/capabilities";

const mockedCheckCapability = checkAdminCapability as unknown as Mock;

function allowedAccess(role: AdminRole, capabilities = capabilitiesForRole(role)) {
  return {
    status: "allowed",
    principal: {
      id: "11111111-1111-4111-8111-111111111111",
      email: "operator@example.com",
    },
    access: {
      userId: "11111111-1111-4111-8111-111111111111",
      email: "operator@example.com",
      role,
      capabilities,
    },
  };
}

beforeEach(() => {
  mockedCheckCapability.mockReset();
  mockedCheckCapability.mockResolvedValue(
    allowedAccess("admin", ["admin.access"]),
  );
});

describe("admin route hierarchy", () => {
  it("presents the restricted hierarchy as helix Admin", async () => {
    expect(metadata.title).toEqual({
      default: "helix Admin",
      template: "%s | helix Admin",
    });
    expect(catalogMetadata.title).toBe("Catalog Editor");
    expect(productEditorMetadata.title).toBe("Edit Catalog Product");

    render(await AdminPage());
    expect(screen.getByText("helix Platform", { exact: false })).toBeVisible();
  });

  it("marks the entire hierarchy noindex and nofollow", () => {
    expect(metadata.robots).toMatchObject({
      index: false,
      follow: false,
    });
  });

  it("checks admin.access server-side before rendering the shell", async () => {
    mockedCheckCapability.mockResolvedValue({
      status: "allowed",
      principal: {
        id: "11111111-1111-4111-8111-111111111111",
        email: "operator@example.com",
      },
      access: {
        userId: "11111111-1111-4111-8111-111111111111",
        email: "operator@example.com",
        role: "admin",
        capabilities: ["admin.access"],
      },
    });

    render(await AdminLayout({ children: <p>Protected content</p> }));

    expect(mockedCheckCapability).toHaveBeenCalledWith("admin.access");
    expect(screen.getByTestId("admin-shell")).toHaveTextContent(
      "Protected content",
    );
  });

  it.each(["forbidden", "unavailable"] as const)(
    "renders the truthful %s state instead of the shell",
    async (status) => {
      mockedCheckCapability.mockResolvedValue({
        status,
        principal:
          status === "forbidden"
            ? {
                id: "11111111-1111-4111-8111-111111111111",
                email: "operator@example.com",
              }
            : null,
      });

      const layout = render(
        await AdminLayout({ children: <p>Protected content</p> }),
      );

      expect(screen.getByRole("alert")).toHaveTextContent(status);
      expect(screen.queryByTestId("admin-shell")).toBeNull();
      layout.unmount();

      render(await AdminPage());
      expect(screen.getByRole("alert")).toHaveTextContent(status);
      expect(screen.queryByRole("heading", { name: "Admin overview" })).toBeNull();
    },
  );

  it("sends signed-out shell and overview requests to the existing sign-in flow", async () => {
    mockedCheckCapability.mockResolvedValue({ status: "unauthenticated" });
    await expect(
      AdminLayout({ children: <p>Protected content</p> }),
    ).rejects.toThrow("Redirect: /account/sign-in?next=%2Fadmin");
    await expect(AdminPage()).rejects.toThrow(
      "Redirect: /account/sign-in?next=%2Fadmin",
    );
  });

  it("renders an honest empty registry state", async () => {
    render(await AdminPage());

    expect(
      screen.getByRole("heading", {
        name: "No admin modules available",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/analytics|activity feed/i)).toBeNull();
  });

  it.each(["admin", "catalog_publisher", "catalog_editor"] as const)(
    "filters the shell and overview for the verified %s principal",
    async (role) => {
      mockedCheckCapability.mockResolvedValue(allowedAccess(role));
      const layout = render(
        await AdminLayout({ children: <p>Protected content</p> }),
      );
      expect(screen.getByRole("link", { name: "Catalog Editor" })).toHaveAttribute(
        "href", "/admin/catalog",
      );
      expect(Boolean(screen.queryByRole("link", { name: "Demo orders" }))).toBe(
        role === "admin",
      );
      layout.unmount();

      render(await AdminPage());
      expect(screen.getByRole("heading", { name: "Catalog Editor" })).toBeVisible();
      expect(Boolean(screen.queryByRole("heading", { name: "Demo orders" }))).toBe(
        role === "admin",
      );
    },
  );

  it("provides loading and recoverable error surfaces", async () => {
    const reset = vi.fn();
    const { unmount } = render(<AdminLoading />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "session and helix Admin permissions",
    );
    unmount();

    render(<AdminError reset={reset} />);
    expect(screen.getByText("helix Admin")).toBeVisible();
    await screen.getByRole("button", { name: "Try again" }).click();
    expect(reset).toHaveBeenCalledOnce();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "No changes were made",
    );
  });
});
