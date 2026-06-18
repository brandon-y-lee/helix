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
  productType: "Treat",
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
  cardMedia: {
    kind: "gradient",
    colors: ["#e3ddea", "#c2b5d6"],
  },
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

test("empty query offers popular discovery suggestions", async ({ page }) => {
  await page.goto("/search");
  await expect(
    page.getByRole("heading", { name: "Popular searches" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Serum" })).toBeVisible();
});

test("Algolia-backed results render with a count and link to the PDP", async ({
  page,
}) => {
  await mockAlgolia(page);
  await page.goto("/search");

  await page.getByLabel("Search products").fill("serum");
  await expect(page.getByText(/1 result for/i)).toBeVisible();
  await expect(page.locator(".search-result")).toHaveCount(1);
  await expect(page.getByText("A nightly serum that refines tone.")).toBeVisible();
  await expect(page.getByText("Available")).toBeVisible();
  await expect(page.getByText("From $54.00")).toBeVisible();

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
  await expect(
    page.getByRole("heading", { name: "Popular searches" }),
  ).toBeVisible();
});

test("error state is shown when the search request fails", async ({ page }) => {
  await page.route(/algolia/i, (route) => route.abort("failed"));
  await page.goto("/search");

  await page.getByLabel("Search products").fill("serum");
  await expect(page.locator(".search-message--error")).toContainText(
    /something went wrong/i,
  );
});

test("header search opens a right drawer and Escape restores trigger focus", async ({
  page,
}) => {
  await page.goto("/");

  const trigger = page.getByRole("button", { name: "SEARCH" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Search" });
  await expect(dialog).toBeVisible();
  await expect(page.getByLabel("Search products")).toBeFocused();
  const box = await dialog.locator(".sheet__panel").boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(viewport!.width - 700);
  await expect(
    dialog.getByRole("heading", { name: "Popular searches" }),
  ).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("drawer traps focus and closes from the backdrop", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "SEARCH" }).click();
  const dialog = page.getByRole("dialog", { name: "Search" });

  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: "Close" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.locator(":focus")).toBeVisible();

  await dialog.click({ position: { x: 8, y: 100 } });
  await expect(dialog).toHaveCount(0);
});

test("search exposes a loading state while Algolia resolves", async ({ page }) => {
  await page.route(/algolia/i, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 800));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ results: [{ hits: [], nbHits: 0, query: "serum" }] }),
    });
  });
  await page.goto("/search");
  await page.getByLabel("Search products").fill("serum");
  await expect(page.getByRole("status", { name: "Searching" })).toBeVisible();
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
