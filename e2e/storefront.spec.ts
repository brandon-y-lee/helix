import { test, expect } from "@playwright/test";

// Storefront parity v1 coverage. Data comes from the seeded dev Supabase
// catalog (verified reachable + seeded by global-setup, so these fail fast if
// Supabase is misconfigured rather than hanging).

test("shop renders Supabase products with a count", async ({ page }) => {
  const shopifyRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().toLowerCase().includes("shopify")) {
      shopifyRequests.push(request.url());
    }
  });

  await page.goto("/products");
  await expect(
    page.getByRole("heading", { level: 1, name: "RAISE YOUR BASELINE." }),
  ).toBeVisible();
  await expect(page.locator(".product-count")).toHaveText("6 products");
  await expect(page.locator(".product-card")).toHaveCount(6);
  await expect(page.getByRole("link", { name: "RESET", exact: true })).toBeVisible();
  await expect(page.getByText("Fresh, balanced skin").first()).toBeVisible();
  await expect(page.locator('[data-media-kind="placeholder"]').first()).toBeVisible();
  expect(shopifyRequests).toEqual([]);
});

test("collection filter narrows the grid", async ({ page }) => {
  await page.goto("/products");
  await page.getByRole("button", { name: "THE SYSTEM" }).click();
  await expect(page.locator(".product-count")).toHaveText("5 products");
  await expect(page.getByRole("link", { name: "RESET", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "LIFT", exact: true })).toHaveCount(0);
});

test("sort control reorders products", async ({ page }) => {
  await page.goto("/products");
  await page.getByLabel("Sort products").selectOption("name-asc");
  await expect(page.locator(".product-card__name").first()).toHaveText(
    "FRAME",
  );
  await page.getByLabel("Sort products").selectOption("name-desc");
  await expect(page.locator(".product-card__name").first()).toHaveText(
    "SEAL",
  );
});

test("product detail loads by slug and variant selection updates state", async ({
  page,
}) => {
  await page.goto("/products/recode-03-pdrn-5-ampoule");
  await expect(
    page.getByRole("heading", { level: 1, name: "RECODE" }),
  ).toBeVisible();
  // Structured metadata section is present.
  await expect(page.getByRole("heading", { name: "WHAT IT DOES" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "FORMULA NOTES" })).toBeVisible();

  const thirtyMl = page.getByRole("button", { name: "30 mL", exact: true });
  await thirtyMl.click();
  await expect(thirtyMl).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".pdp__price")).toHaveText("$25.00");
});

test("add to cart updates the count and persists across reload", async ({
  page,
}) => {
  await page.goto("/products/reset-01-calming-gel-cleanser");
  await page.getByRole("button", { name: /Add to cart/ }).click();
  await expect(page.getByText("Added to cart")).toBeVisible();

  // Header cart trigger reflects the item.
  await expect(page.getByRole("button", { name: /CART \(1\)/ })).toBeVisible();

  // Reload: server-backed guest cart persists.
  await page.reload();
  await expect(page.getByRole("button", { name: /CART \(1\)/ })).toBeVisible();

  // Cart page shows the line item, then clear empties it.
  await page.goto("/cart");
  await expect(page.getByText("RESET")).toBeVisible();
  await expect(page.locator('[data-media-kind="placeholder"]').first()).toBeVisible();
  await page.getByRole("button", { name: "Clear cart" }).click();
  await expect(page.getByText(/your cart is empty/i)).toBeVisible();
});

test("product card hover reveals direct buy for a single available variant", async ({
  page,
}) => {
  await page.goto("/products");
  const resetCard = page.locator(".product-card").filter({ hasText: "RESET" }).first();
  await resetCard.hover();
  const buyButton = resetCard.getByRole("button", { name: /Buy RESET/i });
  await expect(buyButton).toBeVisible();
  await buyButton.click();
  await expect(page.getByRole("button", { name: /CART \(1\)/ })).toBeVisible();
});

test("unknown product slug shows a clear not-found state", async ({ page }) => {
  const response = await page.goto("/products/does-not-exist");
  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { level: 1, name: "Not found" }),
  ).toBeVisible();
});
