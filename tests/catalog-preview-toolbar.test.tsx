import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CatalogPreviewToolbar } from "@/components/admin/CatalogPreviewToolbar";

const navigation = vi.hoisted(() => ({
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => navigation,
}));

beforeEach(() => {
  navigation.refresh.mockReset();
});

describe("CatalogPreviewToolbar", () => {
  it("offers keyboard-operable editor, refresh, and published actions", async () => {
    const user = userEvent.setup();
    render(
      <CatalogPreviewToolbar
        productName="CLEANSE"
        status="draft"
        version={7}
        lastSavedLabel="Jul 29, 2026, 6:30 PM UTC"
        editorPath="/admin/catalog/draft-id"
        publishedPath="/products/cleanse-01-calming-gel-cleanser"
      />,
    );

    expect(
      screen.getByRole("complementary", {
        name: "Draft preview controls",
      }),
    ).toHaveTextContent("Draft Preview");
    expect(screen.getByText("CLEANSE")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Back to Editor" }),
    ).toHaveAttribute("href", "/admin/catalog/draft-id");
    expect(
      screen.getByRole("link", { name: "Open Published PDP" }),
    ).toHaveAttribute(
      "href",
      "/products/cleanse-01-calming-gel-cleanser",
    );

    await user.tab();
    expect(screen.getByRole("link", { name: "Back to Editor" })).toHaveFocus();
    await user.tab();
    expect(
      screen.getByRole("button", { name: "Refresh Preview" }),
    ).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(navigation.refresh).toHaveBeenCalledTimes(1);
  });

  it("does not invent a published link", () => {
    render(
      <CatalogPreviewToolbar
        productName="New product"
        status="draft"
        version={1}
        lastSavedLabel="Jul 29, 2026, 6:30 PM UTC"
        editorPath="/admin/catalog/draft-id"
        publishedPath={null}
      />,
    );

    expect(
      screen.queryByRole("link", { name: "Open Published PDP" }),
    ).not.toBeInTheDocument();
  });
});
