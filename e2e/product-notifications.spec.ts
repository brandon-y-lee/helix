import { expect, test } from "./storefront-fixture";

test("retired Product notification routes are unavailable, including demo links", async ({ page, request }) => {
  for (const path of ["/product-notifications", `/product-notifications?cancel=${"T".repeat(43)}`, "/helix-verification/product-notifications"]) {
    expect((await page.goto(path))?.status()).toBe(404);
  }
  for (const path of ["/api/product-waitlist", "/api/product-notifications/recovery", "/api/product-notifications/cancel"]) {
    expect((await request.post(path, { data: {} })).status()).toBe(404);
  }
});
