import { expect, test } from "./storefront-fixture";

test("the Cart return requires an explicit cancellation action", async ({ page, request }) => {
  const retired = await request.get("/checkout/cancel", { maxRedirects: 0 });
  expect(retired.status()).toBe(404);
  expect(retired.headers().location).toBeUndefined();

  await page.route("**/api/cart", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ count: 0, currency: "USD", lines: [], subtotal: 0 }),
  }));
  const cancellationRequests: string[] = [];
  await page.route("**/cart/checkout-cancel", (route) => {
    cancellationRequests.push(route.request().method());
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ status: "cancelled" }),
    });
  });
  const current = await page.goto("/cart?checkout=cancelled");
  expect(current?.status()).toBe(200);
  expect(current?.headers()["content-security-policy"]).toContain("frame-ancestors 'self'");
  expect(current?.headers()["x-frame-options"]).toBe("SAMEORIGIN");
  await expect(page.getByText("You returned from checkout. Your cart is still here.")).toBeVisible();
  const cancelButton = page.getByRole("button", { name: "Cancel pending checkout" });
  await expect(cancelButton).toBeEnabled();
  // A generic GET/query parameter must never authorize a payment mutation.
  await page.waitForLoadState("networkidle");
  expect(cancellationRequests).toEqual([]);
  await expect(page.getByText("Sandbox checkout was cancelled.")).toHaveCount(0);

  await cancelButton.click();
  await expect(page.getByRole("status").filter({ hasText: "Sandbox checkout was cancelled" })).toBeVisible();
  expect(cancellationRequests).toEqual(["POST"]);
  await expect(page).toHaveTitle("Cart | helix");
});
