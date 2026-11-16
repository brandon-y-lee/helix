import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CartProvider } from "@/components/cart/CartProvider";

vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NOT_FOUND"); },
  usePathname: () => "/helix-verification/admin/preview",
  useRouter: () => ({ refresh: vi.fn() }),
}));

import CatalogPreviewVerificationPage, { dynamic, metadata } from "@/app/helix-verification/admin/preview/page";

beforeEach(() => {
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("HELIX_VERIFICATION_ADAPTER", "1");
});

afterEach(() => vi.unstubAllEnvs());

describe("Catalog Preview presentation verification", () => {
  it("is dynamic and excluded from indexing", () => {
    expect(dynamic).toBe("force-dynamic");
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it.each([undefined, "", "0", "true"])(
    "rejects execution without the explicit local adapter flag: %s",
    async (flag) => {
      vi.stubEnv("HELIX_VERIFICATION_ADAPTER", flag);
      await expect(CatalogPreviewVerificationPage({})).rejects.toThrow("NOT_FOUND");
    },
  );

  it("rejects Vercel even with the local adapter enabled", async () => {
    vi.stubEnv("VERCEL", "1");
    await expect(CatalogPreviewVerificationPage({})).rejects.toThrow("NOT_FOUND");
  });

  it.each(["", "unknown", "toString", "__proto__", [], ["success"], ["success", "warning"]])(
    "rejects unsupported or ambiguous state queries: %s",
    async (state) => {
      await expect(CatalogPreviewVerificationPage({
        searchParams: Promise.resolve({ state }),
      })).rejects.toThrow("NOT_FOUND");
    },
  );

  it("renders synthetic metadata and the actual PDP with purchases disabled", async () => {
    const html = renderToStaticMarkup(
      <CartProvider disabled>{await CatalogPreviewVerificationPage({})}</CartProvider>,
    );
    expect(html).toContain("Synthetic verification product");
    expect(html).toContain("Catalog Preview metadata");
    expect(html).toContain("Synthetic profile");
    expect(html).toContain("Synthetic ingredient story");
    expect(html).toContain("Preview — purchasing disabled");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Preview — purchasing disabled<\/button>/);
    expect(html).not.toContain("Open Published PDP");
  });

  it.each([
    ["discarded", "Draft discarded"],
    ["published", "Draft already published"],
    ["invalid", "Draft not found"],
    ["missing", "Draft not found"],
    ["forbidden", "Catalog access required"],
    ["auth-unavailable", "Authentication unavailable"],
    ["backend-unavailable", "Catalog Preview unavailable"],
    ["canonical-unavailable", "Canonical product unavailable"],
    ["product-unavailable", "Product deleted or archived"],
    ["schema-error", "Draft schema unsupported"],
    ["validation-error", "Draft validation failed"],
  ])("renders the %s production state without a PDP", async (state, title) => {
    const html = renderToStaticMarkup(
      <CartProvider disabled>{await CatalogPreviewVerificationPage({
        searchParams: Promise.resolve({ state }),
      })}</CartProvider>,
    );
    expect(html).toContain(`<h1 id="preview-state">${title}</h1>`);
    expect(html).not.toContain("data-catalog-draft-preview");
  });

  it("renders the actual warning presentation alongside a commerce-disabled PDP", async () => {
    const html = renderToStaticMarkup(
      <CartProvider disabled>{await CatalogPreviewVerificationPage({
        searchParams: Promise.resolve({ state: "warning" }),
      })}</CartProvider>,
    );
    const document = new DOMParser().parseFromString(html, "text/html");
    expect(document.querySelector('[aria-label="Catalog Preview warnings"]')?.textContent)
      .toBe("Confirm the Product Education before publishing.");
    expect(document.querySelector("[data-catalog-draft-preview]")).not.toBeNull();
  });
});
