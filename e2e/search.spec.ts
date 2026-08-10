import type { Page } from "@playwright/test";
import type { AlgoliaProductRecord } from "@/lib/algolia/record";
import type { StorefrontSnapshotProduct } from "@/test-support/storefront-baseline";
import { buildStorefrontSearchRecord } from "@/test-support/storefront-search-projection";
import { loadStorefrontSnapshot } from "@/test-support/storefront-snapshot-artifact";
import { expect, test } from "./storefront-fixture";

async function loadSearchJourney(): Promise<{
  product: StorefrontSnapshotProduct;
  record: AlgoliaProductRecord;
  offerPrice: number;
  searchTerm: string;
}> {
  const snapshot = await loadStorefrontSnapshot();
  const product = snapshot.products.find(
    ({ id }) => id === snapshot.journeys.searchableProductId,
  );
  if (!product) {
    throw new Error(
      `Search journey Product "${snapshot.journeys.searchableProductId}" is absent from the Storefront snapshot.`,
    );
  }
  if (!product.offer) {
    throw new Error(
      `Search journey Product "${product.id}" has no Product Offer in the Storefront snapshot.`,
    );
  }
  return {
    product,
    record: buildStorefrontSearchRecord(product),
    offerPrice: product.offer.price,
    searchTerm: product.searchKeywords[0] ?? product.displayName,
  };
}

async function mockAlgolia(page: Page, record: AlgoliaProductRecord) {
  await page.route(/algolia/i, async (route) => {
    const payload = JSON.parse(route.request().postData() ?? "{}");
    const query = String(payload?.requests?.[0]?.query ?? "").toLowerCase();
    const hits = query.includes("zzz") ? [] : [record];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        results: [
          {
            hits,
            nbHits: hits.length,
            page: 0,
            nbPages: 1,
            hitsPerPage: 12,
            processingTimeMS: 1,
            query,
          },
        ],
      }),
    });
  });
}

test("Algolia result opens its canonical product detail page", async ({
  page,
}) => {
  const { product, record, offerPrice, searchTerm } =
    await loadSearchJourney();
  await mockAlgolia(page, record);
  await page.goto("/search");

  await page
    .locator("main")
    .getByRole("searchbox", { name: "Search products" })
    .fill(searchTerm);
  await expect(page.getByText(/1 result for/i)).toBeVisible();
  const result = page.getByRole("link", {
    name: `${product.displayName} — ${product.productType}`,
  });
  await expect(result).toContainText(product.productType);
  await expect(result).toContainText(product.productType);
  await expect(result).toContainText(`$${(offerPrice / 100).toFixed(2)}`);
  await result.click();

  await expect(page).toHaveURL(product.path);
  await expect(
    page.getByRole("heading", { level: 1, name: product.displayName }),
  ).toBeVisible();
});

test("search reports a clear no-results state", async ({ page }) => {
  const { record } = await loadSearchJourney();
  await mockAlgolia(page, record);
  await page.goto("/search");

  await page
    .locator("main")
    .getByRole("searchbox", { name: "Search products" })
    .fill("zzznotathing");
  await expect(page.getByText(/No products match/i)).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Popular searches" }),
  ).toBeVisible();
});

test("header search manages initial focus and restores its trigger on Escape", async ({
  page,
}) => {
  const { record, searchTerm } = await loadSearchJourney();
  await mockAlgolia(page, record);
  await page.goto("/");

  const trigger = page
    .getByRole("navigation", { name: "Utilities" })
    .getByRole("button", { name: "SEARCH" });
  const panel = page.locator(".search-sheet");
  const overlay = panel.locator("..");
  await expect(panel).toHaveCount(1);
  await expect(panel).toHaveAttribute("data-state", "closed");
  await expect(overlay).toHaveAttribute("data-state", "closed");
  await expect(overlay).toHaveAttribute("aria-hidden", "true");
  await expect(overlay).toHaveAttribute("inert", "");
  const viewportOriginBeforeOpen = await page.evaluate(() => ({
    scrollX: window.scrollX,
    visualOffsetLeft: window.visualViewport?.offsetLeft ?? 0,
  }));

  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Search" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("data-state", "open");
  await expect(panel).toHaveCount(1);
  const input = dialog.getByLabel("Search products");
  await expect(input).toBeFocused();
  expect(
    await page.evaluate(() => ({
      scrollX: window.scrollX,
      visualOffsetLeft: window.visualViewport?.offsetLeft ?? 0,
    })),
  ).toEqual(viewportOriginBeforeOpen);
  await expect(
    dialog.getByRole("heading", { name: "Popular searches" }),
  ).toBeVisible();
  await input.fill(searchTerm);
  await expect(dialog.getByText(/1 result for/i)).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(panel).toHaveAttribute("data-state", "closed");
  await expect(overlay).toHaveAttribute("data-state", "closed");
  await expect(overlay).toHaveAttribute("aria-hidden", "true");
  await expect(overlay).toHaveAttribute("inert", "");
  await expect
    .poll(() => page.evaluate(() => document.body.style.overflow))
    .not.toBe("hidden");
  await expect(trigger).toBeFocused();

  await trigger.click();
  await expect(dialog).toBeVisible();
  await expect(input).toHaveValue(searchTerm);
  await expect(input).toBeFocused();
  await expect(dialog.getByText(/1 result for/i)).toBeVisible();

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(overlay).toHaveAttribute("data-state", "closed");
  await expect
    .poll(() => page.evaluate(() => document.body.style.overflow))
    .not.toBe("hidden");
  await expect(trigger).toBeFocused();
});
