import { test, expect } from "@playwright/test";

// Discovery / merchandising modules are rendered from the seeded Supabase
// catalog (server-side) — they are product discovery, not interactive search,
// so they do not depend on Algolia.

test("homepage discovery modules render", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Shop by collection" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Featured" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Build your daily routine" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "New arrivals" }),
  ).toBeVisible();
});

test("collection chip deep-links into the shop, pre-filtered", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("link", { name: "THE SYSTEM", exact: true }).click();

  await expect(page).toHaveURL(/\/products\?collection=THE%20SYSTEM$/);
  await expect(page.locator(".product-count")).toHaveText("5 products");
});

test("routine step navigates to a product detail page", async ({ page }) => {
  await page.goto("/");
  await page.locator(".routine-step__link").first().click();
  await expect(page).toHaveURL(/\/products\/[\w-]+$/);
  await expect(page.locator("h1")).toBeVisible();
});

test("PDP complete-the-routine renders and a related product navigates", async ({
  page,
}) => {
  await page.goto("/products/recode-03-pdrn-5-ampoule");
  await expect(
    page.getByRole("heading", { name: "COMPLETE THE SYSTEM" }),
  ).toBeVisible();

  const related = page.locator(".related .product-card__name").first();
  const name = (await related.textContent())?.trim() ?? "";
  expect(name.length).toBeGreaterThan(0);
  await related.click();

  await expect(page).toHaveURL(/\/products\/[\w-]+$/);
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
});
