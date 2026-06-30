import { test, expect, type Page } from "@playwright/test";

// Search is Algolia-backed. These tests intercept the Algolia host with
// page.route and return fixtures, so they never contact live Algolia. The dev
// server is started with deterministic NON-SECRET NEXT_PUBLIC_ALGOLIA_* values
// (see playwright.config.ts) so the browser client builds and issues requests
// we can intercept.

const SERUM_HIT = {
  objectID: "e2e-serum",
  productId: "e2e-serum",
  slug: "treat-03-pdrn-5-ampoule",
  title: "TREAT",
  displayName: "TREAT",
  formalTitle: "TREAT 03 PDRN 5% Ampoule",
  cardTagline: "Bounce and glow",
  editorialDescription: "A lightweight ampoule that layers hydration with a polished finish.",
  subtitle: "Ampoule / Serum",
  descriptor: "A lightweight ampoule that layers hydration with a polished finish.",
  collection: "THE SYSTEM",
  collections: ["THE SYSTEM"],
  category: "THE SYSTEM",
  productType: "Ampoule / Serum",
  routineNumber: "03",
  routineStep: "Treat",
  badge: null,
  status: "available",
  priceMin: 2500,
  priceMax: 2500,
  currency: "USD",
  available: true,
  waitlist: false,
  variantCount: 1,
  variantNames: ["30 mL"],
  keywords: ["THE SYSTEM", "PDRN", "ampoule"],
  concerns: ["Texture"],
  ingredients: ["PDRN"],
  swatch: ["#dfe4e5", "#7f8f95"],
  placeholderMedia: {
    kind: "placeholder",
    alt: "TREAT search placeholder surface",
    paletteId: "treat-search",
    palette: {
      start: "#dfe4e5",
      end: "#7f8f95",
      accent: "#244B56",
      surface: "#FFFDF8",
      ink: "#111312",
      highlight: "#FAF2E8",
    },
  },
  cardMedia: {
    kind: "gradient",
    colors: ["#dfe4e5", "#7f8f95"],
  },
  sortOrder: 0,
  featuredRank: 0,
  createdAt: "2026-06-14T00:00:00.000Z",
  publishedAt: "2026-06-14T00:00:00.000Z",
  updatedAt: "2026-06-15T00:00:00.000Z",
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
  await expect(page.getByText("Bounce and glow")).toBeVisible();
  await expect(page.getByText("Available")).toBeVisible();
  await expect(page.getByText("$25.00")).toBeVisible();
  await expect(page.locator('[data-media-kind="placeholder"]').first()).toBeVisible();

  const link = page
    .getByRole("link", { name: /TREAT/ })
    .first();
  await expect(link).toBeVisible();
  await link.click();

  await expect(page).toHaveURL(/\/products\/treat-03-pdrn-5-ampoule$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "TREAT" }),
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
