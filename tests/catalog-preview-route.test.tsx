import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  loadDraft: vi.fn(),
  loadBase: vi.fn(),
  project: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: routeMocks.redirect,
}));
vi.mock("@/lib/admin/capabilities", () => ({
  ADMIN_CAPABILITIES: { catalogRead: "catalog.read" },
  checkAdminCapability: routeMocks.authorize,
}));
vi.mock("@/lib/admin/catalog/service", () => ({
  getCatalogDraftForPreview: routeMocks.loadDraft,
}));
vi.mock("@/lib/catalog-editor/preview-data", () => ({
  loadCatalogPreviewBase: routeMocks.loadBase,
}));
vi.mock("@/lib/catalog-editor/preview-projection", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/lib/catalog-editor/preview-projection")
    >();
  return { ...actual, projectCatalogDraftPreview: routeMocks.project };
});
vi.mock("@/components/ProductDetail", () => ({
  ProductDetail: ({
    commerceDisabled,
  }: {
    commerceDisabled?: boolean;
  }) => (
    <div data-testid="real-pdp" data-commerce-disabled={commerceDisabled} />
  ),
}));
vi.mock("@/components/admin/CatalogPreviewToolbar", () => ({
  CatalogPreviewToolbar: ({ status }: { status: string }) => (
    <div data-testid="preview-toolbar">{status}</div>
  ),
}));

import CatalogDraftPreviewPage, {
  dynamic,
  fetchCache,
  metadata,
  revalidate,
} from "@/app/admin/catalog/preview/[draftId]/page";
import { catalogDocument } from "./fixtures/catalog-editor";

const draftId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function draftRecord(status = "draft") {
  return {
    id: draftId,
    product_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    status,
    version: 3,
    updated_at: "2026-07-29T18:30:00.000Z",
    document: structuredClone(catalogDocument),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  routeMocks.authorize.mockResolvedValue({
    status: "allowed",
    principal: { id: "admin-id", email: null },
    access: {},
  });
  routeMocks.loadDraft.mockResolvedValue(draftRecord());
  routeMocks.loadBase.mockResolvedValue({ product: {}, coreProducts: [] });
  routeMocks.project.mockReturnValue({
    product: {},
    coreProducts: [],
    warnings: [],
  });
  routeMocks.redirect.mockImplementation((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  });
});

describe("catalog draft preview route", () => {
  it("is dynamic, no-store, noindex, and isolated from public cache/search paths", () => {
    expect(dynamic).toBe("force-dynamic");
    expect(revalidate).toBe(0);
    expect(fetchCache).toBe("force-no-store");
    expect(metadata.robots).toMatchObject({
      index: false,
      follow: false,
    });

    const previewSource = readFileSync(
      resolve(
        process.cwd(),
        "app/admin/catalog/preview/[draftId]/page.tsx",
      ),
      "utf8",
    );
    const publicSource = readFileSync(
      resolve(process.cwd(), "app/products/[slug]/page.tsx"),
      "utf8",
    );
    expect(previewSource).not.toContain("@/lib/catalog-cache");
    expect(previewSource).not.toMatch(/algolia/i);
    expect(previewSource).not.toContain("CATALOG_EDITOR_BACKEND_URL");
    expect(previewSource).not.toContain("loadCatalogDraftPreview");
    expect(publicSource).not.toContain("@/lib/catalog-editor");
    expect(publicSource).toContain("getCachedPdpProduct");
  });

  it("redirects an anonymous request before reading the draft", async () => {
    routeMocks.authorize.mockResolvedValue({ status: "unauthenticated" });

    await expect(
      CatalogDraftPreviewPage({
        params: Promise.resolve({ draftId }),
      }),
    ).rejects.toThrow(
      `REDIRECT:/account/sign-in?next=%2Fadmin%2Fcatalog%2Fpreview%2F${draftId}`,
    );
    expect(routeMocks.loadDraft).not.toHaveBeenCalled();
  });

  it("renders the real PDP with preview commerce disabled", async () => {
    render(
      await CatalogDraftPreviewPage({
        params: Promise.resolve({ draftId }),
      }),
    );

    expect(screen.getByTestId("preview-toolbar")).toHaveTextContent("draft");
    expect(screen.getByText("Preview — purchasing disabled")).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Preview metadata" }),
    ).toBeVisible();
    expect(screen.getByText("CLEANSE 01 Calming Gel Cleanser")).toBeVisible();
    expect(screen.getByTestId("real-pdp")).toHaveAttribute(
      "data-commerce-disabled",
      "true",
    );
  });

  it.each([
    ["discarded", "Draft discarded"],
    ["published", "Draft already published"],
  ])("identifies a %s draft without rendering the PDP", async (status, title) => {
    routeMocks.loadDraft.mockResolvedValue(draftRecord(status));

    render(
      await CatalogDraftPreviewPage({
        params: Promise.resolve({ draftId }),
      }),
    );

    expect(screen.getByRole("heading", { name: title })).toBeVisible();
    expect(screen.queryByTestId("real-pdp")).not.toBeInTheDocument();
  });

  it("does not substitute a public PDP when the database is unavailable", async () => {
    routeMocks.loadDraft.mockRejectedValue(new Error("Database unavailable"));

    render(
      await CatalogDraftPreviewPage({
        params: Promise.resolve({ draftId }),
      }),
    );

    expect(
      screen.getByRole("heading", { name: "Draft preview unavailable" }),
    ).toBeVisible();
    expect(screen.getByText(/No public product data/)).toBeVisible();
    expect(routeMocks.loadBase).not.toHaveBeenCalled();
    expect(screen.queryByTestId("real-pdp")).not.toBeInTheDocument();
  });
});
