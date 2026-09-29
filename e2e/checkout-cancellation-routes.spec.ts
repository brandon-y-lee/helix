import { expect, test } from "./storefront-fixture";
import { createCartLayoutFixture } from "./cart-fixture";
import { formatPrice } from "@/lib/products";
import { REWARD_TIERS } from "@/lib/rewards/rules";

test("the Cart return refreshes Points only after verified cancellation", async ({ page, request, storefront }) => {
  const retired = await request.get("/checkout/cancel", { maxRedirects: 0 });
  expect(retired.status()).toBe(404);
  expect(retired.headers().location).toBeUndefined();

  const cart = createCartLayoutFixture(storefront.snapshot.products, { lineCount: 1, quantity: 1 });
  const tier = REWARD_TIERS[0];
  let cancelled = false;
  await page.route("**/api/cart", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify(cart),
  }));
  await page.route("**/api/rewards/summary", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      authenticated: true, pointsBalance: cancelled ? tier.points : 0,
      affordableTiers: cancelled ? [tier] : [],
    }),
  }));
  const cancellationRequests: string[] = [];
  await page.route("**/cart/checkout-cancel", (route) => {
    cancellationRequests.push(route.request().method());
    cancelled = cancellationRequests.length === 3;
    return route.fulfill({
      status: cancellationRequests.length === 1 ? 503 : 200,
      contentType: "application/json",
      body: JSON.stringify({ status: cancellationRequests.length === 2 ? "processing" : "cancelled" }),
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
  const pointsBalance = page.locator("#content .summary-row").filter({ hasText: "Available Points Balance" });
  await expect(pointsBalance).toHaveText("Available Points Balance0");
  await expect(page.getByRole("button", { name: `Sandbox checkout ${formatPrice(cart.subtotal)}` })).toBeEnabled();

  for (const message of ["We couldn't cancel checkout. Try again in a moment.", "This payment is still processing. Try again shortly."]) {
    await cancelButton.click();
    await expect(page.getByRole("status").filter({ hasText: message })).toBeVisible();
    await expect(page).toHaveURL(/\/cart\?checkout=cancelled$/);
    await expect(pointsBalance).toHaveText("Available Points Balance0");
    await expect(cancelButton).toBeEnabled();
  }

  await cancelButton.click();
  await expect(page).toHaveURL(/\/cart\?checkout=cancelled$/);
  await expect(page.getByRole("status").filter({ hasText: "Sandbox checkout was cancelled." })).toBeVisible();
  await expect(cancelButton).toBeDisabled();
  await expect(pointsBalance).toHaveText(`Available Points Balance${tier.points}`);
  await expect(page.getByRole("radio", { name: `${tier.label} (${tier.points} Points)` })).toBeVisible();
  await expect(page.getByRole("button", { name: `Sandbox checkout ${formatPrice(cart.subtotal)}` })).toBeEnabled();
  await expect(page.getByRole("status").filter({ hasText: "Sandbox checkout was cancelled." })).toBeVisible();
  expect(cancellationRequests).toEqual(["POST", "POST", "POST"]);
  await expect(page).toHaveTitle("Cart | helix");
});
