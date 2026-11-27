import { expect, test } from "./storefront-fixture";
for (const width of [390, 1020]) {
  test(`footer signs up an address immediately at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const writes: unknown[] = [], unexpected: string[] = [];
    await page.route("**/*", async route => {
      const request = route.request(), url = new URL(request.url());
      const sameOrigin = url.origin === new URL(testInfo.project.use.baseURL as string).origin;
      if (sameOrigin && !url.search && request.method() === "GET" && url.pathname === "/api/cart") return route.fulfill({ json: { count: 0, lines: [], subtotal: 0, currency: "USD" } });
      if (sameOrigin && !url.search && request.method() === "POST" && url.pathname === "/api/marketing/newsletter") {
        const body = request.postDataJSON();
        writes.push({ body, referrer: await request.headerValue("referer") });
        const outcome = body.email === "repeat@example.invalid" ? "already_added" : "added";
        return route.fulfill({ status: 200, json: { outcome } });
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
    const email = form.getByRole("textbox", { name: "Email address" });
    const centers = await form.evaluate((element) => {
      const centerY = (node: Element) => {
        const { top, height } = node.getBoundingClientRect();
        return top + height / 2;
      };
      return {
        band: centerY(element.closest("section")!),
        input: centerY(element.querySelector("input")!),
        submit: centerY(element.querySelector("button")!),
      };
    });
    expect(centers.input).toBeCloseTo(centers.submit, 0);
    if (width === 1020) expect(centers.input).toBeCloseTo(centers.band, 0);
    await email.fill("repeat@example.invalid");
    expect(writes).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`footer-signup-${width}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await form.getByRole("button", { name: "Sign up" }).click();
    const status = footer.getByRole("status");
    await expect(status).toHaveText("This email has already been added.");
    await expect(email).toHaveValue("repeat@example.invalid");
    const note = await status.boundingBox();
    const field = await email.boundingBox();
    expect(note?.y).toBeGreaterThanOrEqual((field?.y ?? 0) + (field?.height ?? 0));
    await email.fill("footer@example.invalid");
    await expect(status).toHaveText("");
    await form.getByRole("button", { name: "Sign up" }).click();
    await expect(status).toHaveText("Thanks for signing up!");
    await expect(form).toHaveCount(0);
    await expect(status).toBeFocused();
    await status.screenshot({ path: testInfo.outputPath(`footer-signup-success-${width}.png`) });
    expect(writes).toEqual([
      { body: { email: "repeat@example.invalid" }, referrer: null },
      { body: { email: "footer@example.invalid" }, referrer: null },
    ]);
    expect(unexpected).toEqual([]);
  });
}
