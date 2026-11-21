import { expect, test } from "./storefront-fixture";
for (const width of [390, 1440]) {
  test(`footer signup keeps scoped synthetic consent at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const writes: unknown[] = [], unexpected: string[] = [];
    await page.route("**/*", async route => {
      const request = route.request(), url = new URL(request.url());
      const sameOrigin = url.origin === new URL(testInfo.project.use.baseURL as string).origin;
      if (sameOrigin && !url.search && request.method() === "GET" && url.pathname === "/api/cart") return route.fulfill({ json: { count: 0, lines: [], subtotal: 0, currency: "USD" } });
      if (sameOrigin && !url.search && request.method() === "GET" && url.pathname === "/api/marketing/readiness") return route.fulfill({ json: { ready: true, scope: "lifecycle_reviews" } });
      if (sameOrigin && !url.search && request.method() === "POST" && url.pathname === "/api/marketing/subscription") {
        writes.push({ body: request.postDataJSON(), referrer: await request.headerValue("referer") });
        return route.fulfill({ status: 202, json: { ok: true } });
      }
      if (url.pathname.startsWith("/api/") || !["GET", "HEAD"].includes(request.method())) { unexpected.push(request.method()+" "+url.pathname); return route.abort(); }
      return route.fallback();
    });
    await page.goto("/privacy");
    const form = page.getByRole("form", { name: "Email signup" });
    await form.scrollIntoViewIfNeeded();
    const consent = form.getByRole("checkbox");
    await expect(consent).not.toBeChecked();
    await expect(form.getByRole("button", { name: "Sign up" })).toBeDisabled();
    await form.getByRole("textbox", { name: "Email address" }).fill("footer@example.invalid");
    await consent.check();
    expect(writes).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`footer-signup-${width}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await form.getByRole("button", { name: "Sign up" }).click();
    await expect(page.getByRole("contentinfo").getByRole("status")).toHaveText("If this address is eligible, check your inbox to confirm.");
    expect(writes).toEqual([{ body: { email: "footer@example.invalid", consent: true, scope: "lifecycle_reviews", source: "email_preferences" }, referrer: null }]);
    expect(unexpected).toEqual([]);
  });
}
