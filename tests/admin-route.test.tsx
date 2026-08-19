import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@/lib/admin/capabilities", () => ({
  ADMIN_CAPABILITIES: {
    access: "admin.access",
    catalogRead: "catalog.read",
    catalogEdit: "catalog.edit",
    catalogPublish: "catalog.publish",
    catalogDelivery: "catalog.delivery",
  },
  checkAdminCapability: vi.fn(),
}));

vi.mock("@/lib/admin/modules", () => ({
  getAdminModules: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));

vi.mock("@/components/admin/shell/AdminRouteShell", () => ({
  AdminRouteShell: ({
    accountLabel,
    children,
  }: {
    accountLabel: string;
    children: React.ReactNode;
  }) => (
    <div data-testid="admin-shell">
      <span>{accountLabel}</span>
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
import { checkAdminCapability } from "@/lib/admin/capabilities";
import { getAdminModules } from "@/lib/admin/modules";

const mockedCheckCapability = checkAdminCapability as unknown as Mock;
const mockedGetModules = getAdminModules as unknown as Mock;

beforeEach(() => {
  mockedCheckCapability.mockReset();
  mockedGetModules.mockReset();
  mockedGetModules.mockReturnValue([]);
});

describe("admin route hierarchy", () => {
  it("presents the restricted hierarchy as helix Admin", () => {
    expect(metadata.title).toEqual({
      default: "helix Admin",
      template: "%s | helix Admin",
    });
    expect(catalogMetadata.title).toBe("Catalog Editor");
    expect(productEditorMetadata.title).toBe("Edit Catalog Product");

    render(<AdminPage />);
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

      render(await AdminLayout({ children: <p>Protected content</p> }));

      expect(screen.getByRole("alert")).toHaveTextContent(status);
      expect(screen.queryByTestId("admin-shell")).toBeNull();
    },
  );

  it("renders an honest empty registry state", () => {
    render(<AdminPage />);

    expect(
      screen.getByRole("heading", {
        name: "No admin modules available",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/analytics|activity feed/i)).toBeNull();
  });

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
