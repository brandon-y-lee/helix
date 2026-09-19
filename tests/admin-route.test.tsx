import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { readMembership } = vi.hoisted(() => ({ readMembership: vi.fn() }));

vi.mock("@/lib/auth/session", () => ({
  getCurrentIdentity: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: readMembership }) }),
    }),
  }),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin",
  redirect: (destination: string) => { throw new Error(`REDIRECT:${destination}`); },
}));

vi.mock("@/app/account/actions", () => ({
  signOutAction: vi.fn(),
}));

import AdminError from "@/app/admin/error";
import AdminLayout, { metadata } from "@/app/admin/layout";
import AdminLoading from "@/app/admin/loading";
import AdminPage from "@/app/admin/page";
import { metadata as catalogMetadata } from "@/app/admin/catalog/page";
import { metadata as productEditorMetadata } from "@/app/admin/catalog/products/[productId]/page";
import { getCurrentIdentity } from "@/lib/auth/session";

const identity = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "operator@example.com",
};

function setMembership(role = "admin", active = true) {
  readMembership.mockResolvedValue({
    data: { user_id: identity.id, role, active },
    error: null,
  });
}

beforeEach(() => {
  vi.mocked(getCurrentIdentity).mockReset();
  vi.mocked(getCurrentIdentity).mockResolvedValue(identity);
  readMembership.mockReset();
  setMembership();
  window.localStorage.clear();
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
    expect(metadata.robots).toMatchObject({ index: false, follow: false });
  });

  it("shows payment navigation only for the active admin membership", async () => {
    const admin = render(await AdminLayout({ children: <p>Protected content</p> }));
    expect(screen.getByRole("link", { name: "Payments" })).toHaveAttribute(
      "href", "/admin/payments",
    );
    expect(screen.getByText("Protected content")).toBeVisible();
    admin.unmount();

    setMembership("catalog_publisher");
    render(await AdminLayout({ children: <p>Protected catalog content</p> }));
    expect(screen.getByRole("link", { name: "Catalog Editor" })).toHaveAttribute(
      "href", "/admin/catalog",
    );
    expect(screen.queryByRole("link", { name: "Payments" })).toBeNull();
  });

  it.each(["forbidden", "unavailable"] as const)(
    "renders the truthful %s state instead of the shell",
    async (status) => {
      if (status === "forbidden") setMembership("admin", false);
      else readMembership.mockResolvedValue({ data: null, error: { code: "outage" } });

      render(await AdminLayout({ children: <p>Protected content</p> }));

      expect(screen.getByRole("heading", {
        name: status === "forbidden" ? "Access denied" : "Authorization unavailable",
      })).toBeVisible();
      expect(screen.queryByText("Protected content")).toBeNull();
      expect(screen.queryByRole("link", { name: "Payments" })).toBeNull();
    },
  );

  it("uses current membership for a directly requested dashboard", async () => {
    const admin = render(await AdminPage());
    expect(screen.getByRole("heading", { name: "Payments" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Catalog Editor" })).toBeVisible();
    admin.unmount();

    setMembership("catalog_editor");
    render(await AdminPage());
    expect(screen.getByRole("heading", { name: "Catalog Editor" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Payments" })).toBeNull();
  });

  it.each(["inactive", "missing", "unknown", "unavailable"])(
    "denies a directly requested dashboard when membership is %s",
    async (state) => {
      if (state === "inactive") setMembership("admin", false);
      if (state === "missing") readMembership.mockResolvedValue({ data: null, error: null });
      if (state === "unknown") setMembership("unknown_role");
      if (state === "unavailable") {
        readMembership.mockResolvedValue({ data: null, error: { code: "outage" } });
      }

      render(await AdminPage());

      expect(screen.getByRole("heading", {
        name: state === "unavailable" ? "Authorization unavailable" : "Access denied",
      })).toBeVisible();
      expect(screen.queryByRole("heading", { name: "Payments" })).toBeNull();
      expect(screen.queryByRole("link", { name: "Open module" })).toBeNull();
    },
  );

  it("requires sign-in for a directly requested dashboard", async () => {
    vi.mocked(getCurrentIdentity).mockResolvedValue(null);
    await expect(AdminPage()).rejects.toThrow(
      "REDIRECT:/account/sign-in?next=%2Fadmin",
    );
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
    expect(screen.getByRole("alert")).toHaveTextContent("No changes were made");
  });
});
