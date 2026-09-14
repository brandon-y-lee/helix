import { expect, test } from "./storefront-fixture";

test("the retired cancellation route is absent and the current Cart return still cleans up", async ({ page, request }) => {
  const retired = await request.get("/checkout/cancel", { maxRedirects: 0 });
  expect(retired.status()).toBe(404);
  expect(retired.headers().location).toBeUndefined();

  await page.route("**/api/cart", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ count: 0, currency: "USD", lines: [], subtotal: 0 }),
  }));
  await page.route("**/cart/checkout-cancel", (route) => route.fulfill({ status: 204 }));
  const cleanup = page.waitForRequest((req) =>
    new URL(req.url()).pathname === "/cart/checkout-cancel" && req.method() === "POST",
  );
  const current = await page.goto("/cart?checkout=cancelled");
  expect(current?.status()).toBe(200);
  await cleanup;
  await expect(page.getByRole("status").filter({ hasText: "Sandbox checkout was cancelled" })).toBeVisible();
  await expect(page).toHaveTitle("Cart | helix");
});
