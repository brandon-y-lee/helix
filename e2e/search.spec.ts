import type { Page } from "@playwright/test";
import type { AlgoliaProductRecord } from "@/lib/algolia/record";
import type { StorefrontSnapshotProduct } from "@/test-support/storefront-baseline";
import { buildStorefrontSearchRecord } from "@/test-support/storefront-search-projection";
import { loadStorefrontSnapshot } from "@/test-support/storefront-snapshot-artifact";
import { expect, test } from "./storefront-fixture";

async function loadSearchJourney(): Promise<{
  product: StorefrontSnapshotProduct;
  record: AlgoliaProductRecord;
  offerPrice: number | null;
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
  return {
    product,
    record: buildStorefrontSearchRecord(product),
    offerPrice: product.offer?.price ?? null,
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
  if (offerPrice === null) {
    await expect(result.locator(".search-result__price")).toHaveCount(0);
  } else {
    await expect(result).toContainText(`$${(offerPrice / 100).toFixed(2)}`);
  }
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

for (const entry of ["direct", "menu"] as const) {
  test(`mobile ${entry} search restores a visible header trigger without moving the reader`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const { record, searchTerm } = await loadSearchJourney();
    await mockAlgolia(page, record);
    await page.goto("/system");
    await expect(page.locator(".search-sheet")).toHaveAttribute("data-state", "closed");
    await page.evaluate(() => new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    }));

    const header = page.locator(".site-header");
    await page.evaluate(() => window.scrollTo(0, 600));
    await expect(header).toHaveAttribute("data-nav-state", "hidden");
    await page.evaluate(() => window.scrollBy(0, -180));
    await expect(header).toHaveAttribute("data-nav-state", "revealed");
    const trigger = header.getByRole("button", { name: "SEARCH", exact: true });
    await expect(trigger).toBeInViewport({ ratio: 1 });
    const origin = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
    expect(origin.y).toBeGreaterThan(100);

    if (entry === "menu") {
      await header.getByRole("button", { name: "Menu", exact: true }).click();
      const menu = page.getByRole("dialog", { name: "Menu", exact: true });
      await menu.getByRole("button", { name: "SEARCH", exact: true }).click();
      await expect(menu).toHaveCount(0);
    } else {
      await trigger.click();
    }

    const search = page.getByRole("dialog", { name: "Search", exact: true });
    await expect(search).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(1);
    const input = search.getByRole("searchbox", { name: "Search products" });
    await expect(input).toBeFocused();
    for (const suggestion of await search.locator(".search-suggestions__button").all()) {
      const target = await suggestion.boundingBox();
      expect(target).not.toBeNull();
      expect(target!.height).toBeGreaterThanOrEqual(44);
      expect(target!.width).toBeGreaterThanOrEqual(44);
    }
    await input.fill(searchTerm);
    await expect(search.getByText(/1 result for/i)).toBeVisible();
    const clearTarget = await search.getByRole("button", { name: "Clear search" }).boundingBox();
    expect(clearTarget).not.toBeNull();
    expect(clearTarget!.height).toBeGreaterThanOrEqual(44);
    expect(clearTarget!.width).toBeGreaterThanOrEqual(44);

    await page.keyboard.press("Escape");
    await expect(search).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
    await expect(trigger).toBeFocused();
    await expect(trigger).toBeInViewport({ ratio: 1 });
    await expect(header).toHaveAttribute("data-nav-state", "revealed");
    await expect.poll(() => page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }))).toEqual(origin);
  });
}
