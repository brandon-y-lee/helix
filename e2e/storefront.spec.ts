import { test, expect } from "@playwright/test";

// Storefront parity v1 coverage. Data comes from the seeded dev Supabase
// catalog (verified reachable + seeded by global-setup, so these fail fast if
// Supabase is misconfigured rather than hanging).

test("shop renders Supabase products with a count", async ({ page }) => {
  await page.goto("/products");
  await expect(page.getByRole("heading", { level: 1, name: "Shop" })).toBeVisible();
  await expect(page.locator(".product-count")).toHaveText("6 products");
  await expect(page.locator(".product-card")).toHaveCount(6);
  await expect(
    page.getByRole("link", { name: "Northpoint Renewal Serum", exact: true }),
  ).toBeVisible();
  // Availability badges from status are surfaced.
  await expect(page.getByText("Sold out").first()).toBeVisible();
});

test("collection filter narrows the grid", async ({ page }) => {
  await page.goto("/products");
  await page.getByRole("button", { name: "Treat" }).click();
  await expect(page.locator(".product-count")).toHaveText("2 products");
  await expect(
    page.getByRole("link", { name: "Northpoint Renewal Serum", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Groundwork Gel Cleanser", exact: true }),
  ).toHaveCount(0);
});

test("sort control reorders products", async ({ page }) => {
  await page.goto("/products");
  await page.getByLabel("Sort products").selectOption("name-asc");
  await expect(page.locator(".product-card__name").first()).toHaveText(
    "Clearview Eye Concentrate",
  );
  await page.getByLabel("Sort products").selectOption("name-desc");
  await expect(page.locator(".product-card__name").first()).toHaveText(
    "Summit Mineral Defense SPF 40",
  );
});

test("product detail loads by slug and variant selection updates state", async ({
  page,
}) => {
  await page.goto("/products/northpoint-renewal-serum");
  await expect(
    page.getByRole("heading", { level: 1, name: "Northpoint Renewal Serum" }),
  ).toBeVisible();
  // Structured metadata section is present.
  await expect(page.getByText("Made for")).toBeVisible();

  const fiftyMl = page.getByRole("button", { name: "50 ml", exact: true });
  await fiftyMl.click();
  await expect(fiftyMl).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".pdp__price")).toHaveText("$78.00");
});

test("add to cart updates the count and persists across reload", async ({
  page,
}) => {
  await page.goto("/products/northpoint-renewal-serum");
  await page.getByRole("button", { name: /Add to cart/ }).click();
  await expect(page.getByText("Added to cart")).toBeVisible();

  // Header cart badge reflects the item.
  await expect(page.locator(".cart-badge")).toHaveText("1");

  // Reload: localStorage-backed cart persists.
  await page.reload();
  await expect(page.locator(".cart-badge")).toHaveText("1");

  // Cart page shows the line item, then clear empties it.
  await page.goto("/cart");
  await expect(page.getByText("Northpoint Renewal Serum")).toBeVisible();
  await page.getByRole("button", { name: "Clear cart" }).click();
  await expect(page.getByText(/your cart is empty/i)).toBeVisible();
});

test("unknown product slug shows a clear not-found state", async ({ page }) => {
  const response = await page.goto("/products/does-not-exist");
  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { level: 1, name: "Not found" }),
  ).toBeVisible();
});
