import { test, expect, type Page } from "@playwright/test";

// Search is Algolia-backed. These tests intercept the Algolia host with
// page.route and return fixtures, so they never contact live Algolia. The dev
// server is started with deterministic NON-SECRET NEXT_PUBLIC_ALGOLIA_* values
// (see playwright.config.ts) so the browser client builds and issues requests
// we can intercept.

const SERUM_HIT = {
  objectID: "e2e-serum",
  productId: "e2e-serum",
  slug: "northpoint-renewal-serum",
  title: "Northpoint Renewal Serum",
  subtitle: "Overnight resurfacing concentrate",
  descriptor: "A nightly serum that refines tone.",
  collection: "Treat",
  category: "Treat",
  badge: null,
  status: "available",
  priceMin: 5400,
  priceMax: 7800,
  currency: "USD",
  available: true,
  waitlist: false,
  variantCount: 2,
  variantNames: ["30 ml", "50 ml"],
  keywords: ["Treat"],
  swatch: ["#e3ddea", "#c2b5d6"],
  sortOrder: 0,
  featuredRank: 0,
  createdAt: "2026-06-14T00:00:00.000Z",
  madeFor: null,
  goodFor: null,
  texture: null,
};

// Intercept Algolia query requests and return a fixture based on the query.
async function mockAlgolia(page: Page) {
  await page.route(/algolia/i, async (route) => {
    let query = "";
    try {
      const body = JSON.parse(route.request().postData() ?? "{}");
      query = (body?.requests?.[0]?.query ?? "").toString().toLowerCase();
    } catch {
      // leave query empty
    }
    const hits = query.includes("zzz") ? [] : [SERUM_HIT];
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
            params: "",
          },
        ],
      }),
    });
  });
}

test("empty query prompts the user to type", async ({ page }) => {
  await page.goto("/search");
  await expect(page.getByText("Type to search the collection.")).toBeVisible();
});

test("Algolia-backed results render with a count and link to the PDP", async ({
  page,
}) => {
  await mockAlgolia(page);
  await page.goto("/search");

  await page.getByLabel("Search products").fill("serum");
  await expect(page.getByText(/1 result for/i)).toBeVisible();

  const link = page
    .getByRole("link", { name: /Northpoint Renewal Serum/ })
    .first();
  await expect(link).toBeVisible();
  await link.click();

  await expect(page).toHaveURL(/\/products\/northpoint-renewal-serum$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Northpoint Renewal Serum" }),
  ).toBeVisible();
});

test("no-results query shows a clear empty state", async ({ page }) => {
  await mockAlgolia(page);
  await page.goto("/search");

  await page.getByLabel("Search products").fill("zzznotathing");
  await expect(page.getByText(/No products match/i)).toBeVisible();
});

test("error state is shown when the search request fails", async ({ page }) => {
  await page.route(/algolia/i, (route) => route.abort("failed"));
  await page.goto("/search");

  await page.getByLabel("Search products").fill("serum");
  await expect(page.locator(".search-message--error")).toContainText(
    /something went wrong/i,
  );
});

test("header search overlay opens, focuses the input, and closes on Escape", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Search" }).click();
  const dialog = page.getByRole("dialog", { name: "Search" });
  await expect(dialog).toBeVisible();
  await expect(page.getByLabel("Search products")).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("catalog sync webhook rejects unauthorized requests", async ({
  request,
}) => {
  const payload = { type: "INSERT", table: "products", record: { id: "x" } };

  const noHeader = await request.post(
    "/api/webhooks/supabase/catalog-search-sync",
    { data: payload },
  );
  expect(noHeader.status()).toBe(401);

  const wrongSecret = await request.post(
    "/api/webhooks/supabase/catalog-search-sync",
    { headers: { "x-webhook-secret": "not-the-secret" }, data: payload },
  );
  expect(wrongSecret.status()).toBe(401);
});

test("admin reindex route rejects unauthorized requests", async ({
  request,
}) => {
  const res = await request.post("/api/admin/search-reindex", {});
  expect(res.status()).toBe(401);
});
