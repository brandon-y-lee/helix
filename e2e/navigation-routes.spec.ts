import { expect, test } from "./storefront-fixture";

test("retired navigation paths return 404 while current entry points remain available", async ({ request }) => {
  for (const path of [
    "/method", "/privacy-policy", "/terms-of-service", "/support", "/shipping",
    "/shipping-policy", "/returns", "/returns-exchanges", "/refund-policy",
  ]) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status(), path).toBe(404);
    expect(response.headers().location, path).toBeUndefined();
  }

  for (const path of ["/products", "/collections"]) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status(), path).toBe(308);
    expect(response.headers().location, path).toBe("/collections/shop");
  }

  for (const path of ["/system", "/collections/shop", "/privacy", "/terms", "/faq", "/contact"]) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status(), path).toBe(200);
  }
});
