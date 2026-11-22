import { expect, test } from "./storefront-fixture";
for (const width of [390, 1440]) {
  test(`footer signs up an address immediately at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const writes: unknown[] = [], unexpected: string[] = [];
    await page.route("**/*", async route => {
      const request = route.request(), url = new URL(request.url());
      const sameOrigin = url.origin === new URL(testInfo.project.use.baseURL as string).origin;
      if (sameOrigin && !url.search && request.method() === "GET" && url.pathname === "/api/cart") return route.fulfill({ json: { count: 0, lines: [], subtotal: 0, currency: "USD" } });
      if (sameOrigin && !url.search && request.method() === "POST" && url.pathname === "/api/marketing/newsletter") {
        writes.push({ body: request.postDataJSON(), referrer: await request.headerValue("referer") });
        return route.fulfill({ status: 200, json: { ok: true } });
      }
      if (url.pathname.startsWith("/api/") || !["GET", "HEAD"].includes(request.method())) { unexpected.push(request.method()+" "+url.pathname); return route.abort(); }
      return route.fallback();
    });
    await page.clock.install();
    await page.goto("/");
    const form = page.getByRole("form", { name: "Newsletter signup" });
    await form.scrollIntoViewIfNeeded();
    const footer = page.getByRole("contentinfo");
    await expect(footer.getByText("New arrivals, looksmaxxing tips, and little gifts for your inbox.")).toBeVisible();
    await expect(form.getByRole("checkbox")).toHaveCount(0);
    await page.clock.fastForward(13000);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await form.getByRole("textbox", { name: "Email address" }).fill("footer@example.invalid");
    expect(writes).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`footer-signup-${width}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await form.getByRole("button", { name: "Sign up" }).click();
    await expect(page.getByRole("contentinfo").getByRole("status")).toHaveText("You’re signed up.");
    expect(writes).toEqual([{ body: { email: "footer@example.invalid" }, referrer: null }]);
    expect(unexpected).toEqual([]);
  });
}
