import { test, expect } from "@playwright/test";

// Route-load smoke gate: visit every baseline route and assert its unique
// <h1> signal is visible. Includes the async [slug] detail route, which
// renders the product name as its h1.
const routes: ReadonlyArray<{ path: string; heading: string | RegExp }> = [
  { path: "/", heading: "ASCEND." },
  { path: "/products", heading: "RAISE YOUR BASELINE." },
  { path: "/products/recode-03-pdrn-5-ampoule", heading: "RECODE" },
  { path: "/cart", heading: "Cart" },
  { path: "/checkout", heading: "Checkout" },
  { path: "/account", heading: "Sign in" },
  { path: "/admin", heading: "Admin" },
];

for (const { path, heading } of routes) {
  test(`${path} loads and shows its h1`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.ok(), `expected 2xx for ${path}`).toBeTruthy();
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  });
}

test("add to cart updates the cart and persists to checkout", async ({ page }) => {
  await page.goto("/products/recode-03-pdrn-5-ampoule");

  await page.getByRole("button", { name: "30 mL" }).click();
  await page.getByRole("button", { name: /Add to cart/ }).click();
  await expect(page.getByText("Added to cart")).toBeVisible();

  // Cart trigger in the header reflects the added item.
  await expect(page.getByRole("button", { name: /CART \(1\)/ })).toBeVisible();

  // Cart page shows the line item and a non-empty summary.
  await page.goto("/cart");
  await expect(page.getByText("RECODE")).toBeVisible();
  await expect(page.getByText("30 mL")).toBeVisible();
  await expect(page.getByRole("button", { name: "Checkout unavailable" })).toBeVisible();
});
