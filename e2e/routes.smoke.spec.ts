import { test, expect } from "@playwright/test";

// Route-load smoke gate: visit every baseline route and assert its unique
// <h1> signal is visible. Includes the async [slug] detail route, which
// renders the raw slug as its h1.
const routes: ReadonlyArray<{ path: string; heading: string }> = [
  { path: "/", heading: "Home" },
  { path: "/products", heading: "Products" },
  { path: "/products/renewal-serum", heading: "renewal-serum" },
  { path: "/cart", heading: "Cart" },
  { path: "/checkout", heading: "Checkout" },
  { path: "/account", heading: "Account" },
  { path: "/admin", heading: "Admin" },
];

for (const { path, heading } of routes) {
  test(`${path} loads and shows h1 "${heading}"`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.ok(), `expected 2xx for ${path}`).toBeTruthy();
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  });
}
