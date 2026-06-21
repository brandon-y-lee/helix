import { expect, test, type Page } from "@playwright/test";

async function readHeaderStyle(page: Page) {
  return page.locator(".site-header").evaluate((element) => {
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();

    return {
      backgroundColor: style.backgroundColor,
      borderBottomColor: style.borderBottomColor,
      transform: style.transform,
      y: rect.y,
    };
  });
}

test.describe("homepage navbar scroll behavior", () => {
  test("starts transparent, hides on downward scroll, and reveals on upward scroll or focus", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    const header = page.locator(".site-header");

    await expect(header).toHaveAttribute("data-home", "true");
    await expect(header).toHaveAttribute("data-nav-state", "home-top");

    const topStyle = await readHeaderStyle(page);
    expect(topStyle.backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(topStyle.borderBottomColor).toBe("rgba(0, 0, 0, 0)");
    expect(topStyle.y).toBe(0);

    await page.evaluate(() => window.scrollTo(0, 420));
    await expect(header).toHaveAttribute("data-nav-state", "hidden");

    const hiddenStyle = await readHeaderStyle(page);
    expect(hiddenStyle.transform).not.toBe("none");

    await page.getByLabel("Mei-Pelle home").focus();
    await expect(header).toHaveAttribute("data-nav-state", "revealed");

    await page.evaluate(() => window.scrollTo(0, 520));
    await expect(header).toHaveAttribute("data-nav-state", "hidden");
    await page.evaluate(() => window.scrollTo(0, 180));
    await expect(header).toHaveAttribute("data-nav-state", "revealed");

    const surfacedStyle = await readHeaderStyle(page);
    expect(surfacedStyle.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
    expect(surfacedStyle.borderBottomColor).not.toBe("rgba(0, 0, 0, 0)");

    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(header).toHaveAttribute("data-nav-state", "home-top");
  });

  test("keeps non-home routes surfaced while scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 820 });
    await page.goto("/products");

    const header = page.locator(".site-header");

    await expect(header).toHaveAttribute("data-home", "false");
    await expect(header).toHaveAttribute("data-nav-state", "revealed");

    await page.evaluate(() => window.scrollTo(0, 520));
    await expect(header).toHaveAttribute("data-nav-state", "revealed");
  });

  test("keeps the mobile header surfaced while the menu is open", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    const header = page.locator(".site-header");

    await expect(header).toHaveAttribute("data-nav-state", "home-top");
    await page.getByRole("button", { name: "Menu" }).click();

    await expect(page.getByRole("dialog", { name: "Menu" })).toBeVisible();
    await expect(header).toHaveAttribute("data-overlay-open", "true");
    await expect(header).toHaveAttribute("data-nav-state", "revealed");
  });
});
