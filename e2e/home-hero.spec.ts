import { expect, test } from "./storefront-fixture";

test("homepage hero CTAs remain usable on desktop and mobile", async ({
  page,
}) => {
  await page.goto("/");
  const hero = page.locator(".home-video-hero");
  await expect(
    hero.getByRole("heading", {
      level: 1,
      name: "Your skin starts with three steps.",
    }),
  ).toBeVisible();
  await expect(hero.getByRole("link", { name: "SEE THE SYSTEM" })).toHaveAttribute(
    "href",
    "/system",
  );

  await page.setViewportSize({ width: 390, height: 844 });
  const shopCore = hero.getByRole("link", { name: "SHOP THE CORE" });
  await expect(shopCore).toBeVisible();
  await shopCore.click();
  await expect(page).toHaveURL(/\/#core-three$/);
  await expect(
    page.getByRole("region", { name: "The Core", exact: true }),
  ).toBeInViewport();
});

test.describe("principles touch selection", () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

  test("a native vertical pan preserves selection while a deliberate tap selects", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "Native touch pan uses Chromium's input protocol; mandatory Chromium CI runs this proof.");
    await page.goto("/");
    const principles = page.locator(".home-lander-principles");
    const mission = principles.getByRole("button", { name: "mission", exact: true });
    const innovation = principles.getByRole("button", { name: "innovation", exact: true });
    // Prove hydrated event handling before the pan; SSR's default state alone
    // could otherwise make a pre-hydration gesture look like a success.
    await innovation.tap();
    await expect(innovation).toHaveAttribute("aria-pressed", "true");
    await expect(principles.getByRole("link", { name: "our formulas", exact: true })).toBeVisible();
    await mission.tap();
    await expect(mission).toHaveAttribute("aria-pressed", "true");
    await innovation.scrollIntoViewIfNeeded();
    await expect(mission).toHaveAttribute("aria-pressed", "true");
    const box = await innovation.boundingBox();
    if (!box) throw new Error("Innovation selector has no touch target.");
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    const distance = Math.min(140, y - 20);
    expect(distance).toBeGreaterThan(40);
    const initialScrollY = await page.evaluate(() => window.scrollY);
    const initialUrl = page.url();
    const input = await page.context().newCDPSession(page);
    try {
      await input.send("Input.dispatchTouchEvent", {
        type: "touchStart", touchPoints: [{ x, y, id: 1 }],
      });
      for (const fraction of [0.15, 0.4, 0.7, 1]) {
        await input.send("Input.dispatchTouchEvent", {
          type: "touchMove", touchPoints: [{ x, y: y - distance * fraction, id: 1 }],
        });
      }
      await input.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    } finally {
      await input.detach();
    }
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(initialScrollY + 20);
    await expect(mission).toHaveAttribute("aria-pressed", "true");
    await expect(innovation).toHaveAttribute("aria-pressed", "false");
    expect(page.url()).toBe(initialUrl);

    await innovation.tap();
    await expect(innovation).toHaveAttribute("aria-pressed", "true");
    await expect(principles.getByRole("link", { name: "our formulas", exact: true })).toHaveAttribute("href", "/about#quality-heading");
    await expect(principles.getByRole("link", { name: "our values", exact: true })).toHaveCount(0);
    await expect(principles.locator(".home-three-principles-visual__rail")).toHaveAttribute("data-active-principle", "innovation");
  });
});

for (const viewport of [{ width: 320, height: 568 }, { width: 568, height: 320 }]) {
  test(`homepage campaign actions fit at ${viewport.width} by ${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    const hero = page.locator(".home-video-hero");
    const measured = await hero.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const headerHeight = document.querySelector(".site-header")!.getBoundingClientRect().height;
      const headingTop = element.querySelector("h1")!.getBoundingClientRect().top;
      const actions = Array.from(element.querySelectorAll("a")).map((link) => {
        const rect = link.getBoundingClientRect();
        return { left: rect.left, right: rect.right, bottom: rect.bottom, height: rect.height };
      });
      return { bottom: bounds.bottom, headerHeight, headingTop, actions };
    });
    expect(measured.headingTop).toBeGreaterThanOrEqual(measured.headerHeight);
    for (const action of measured.actions) {
      expect(action.height).toBeGreaterThanOrEqual(48);
      expect(action.left).toBeGreaterThanOrEqual(16);
      expect(action.right).toBeLessThanOrEqual(viewport.width - 16);
      expect(action.bottom).toBeLessThan(measured.bottom);
    }
    await expect(page.locator(".home-video-hero__poster")).toHaveCSS("object-position", "64% 50%");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
  });
}
