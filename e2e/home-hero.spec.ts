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
