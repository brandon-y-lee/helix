import { expect, test, type Page } from "@playwright/test";

async function readHeaderState(page: Page) {
  return page.locator(".site-header").evaluate((element) => {
    const style = window.getComputedStyle(element);
    const brand = element.querySelector(".brand");
    const brandStyle = brand ? window.getComputedStyle(brand) : null;
    const rect = element.getBoundingClientRect();

    return {
      backgroundColor: style.backgroundColor,
      borderBottomColor: style.borderBottomColor,
      brandColor: brandStyle?.color,
      color: style.color,
      headerTheme: element.getAttribute("data-header-theme"),
      navState: element.getAttribute("data-nav-state"),
      overlayOpen: element.getAttribute("data-overlay-open"),
      transform: style.transform,
      y: rect.y,
    };
  });
}

async function expectTransparentTop(page: Page, theme: "dark" | "light") {
  const header = page.locator(".site-header");

  await expect(header).toHaveAttribute("data-nav-state", "top");
  await expect(header).toHaveAttribute("data-header-theme", theme);

  await expect
    .poll(async () => (await readHeaderState(page)).backgroundColor)
    .toBe("rgba(0, 0, 0, 0)");
  await expect
    .poll(async () => (await readHeaderState(page)).borderBottomColor)
    .toBe("rgba(0, 0, 0, 0)");

  const topStyle = await readHeaderState(page);
  expect(topStyle.backgroundColor).toBe("rgba(0, 0, 0, 0)");
  expect(topStyle.borderBottomColor).toBe("rgba(0, 0, 0, 0)");
  expect(topStyle.y).toBe(0);
  expect(topStyle.brandColor).toBe(theme === "light" ? "rgb(251, 250, 246)" : "rgb(17, 19, 18)");
}

async function scrollDownUntilHidden(page: Page) {
  const header = page.locator(".site-header");

  await page.mouse.move(720, 450);
  await page.mouse.wheel(0, 560);
  await expect(header).toHaveAttribute("data-nav-state", "hidden");
  await expect.poll(async () => (await readHeaderState(page)).y).toBeLessThan(-20);
}

async function scrollUpUntilRevealed(page: Page) {
  const header = page.locator(".site-header");

  await page.mouse.move(720, 450);
  await page.mouse.wheel(0, -260);
  await expect(header).toHaveAttribute("data-nav-state", "revealed");
  await expect.poll(async () => (await readHeaderState(page)).y).toBe(0);
}

async function expectScrollCycle(page: Page, path: string, theme: "dark" | "light" = "dark") {
  await page.goto(path);
  await expectTransparentTop(page, theme);

  await scrollDownUntilHidden(page);

  const hiddenStyle = await readHeaderState(page);
  expect(hiddenStyle.transform).not.toBe("none");
  expect(hiddenStyle.y).toBeLessThan(-20);

  await scrollUpUntilRevealed(page);

  const revealedStyle = await readHeaderState(page);
  expect(revealedStyle.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
  expect(revealedStyle.borderBottomColor).not.toBe("rgba(0, 0, 0, 0)");
  expect(revealedStyle.y).toBe(0);

  await page.evaluate(() => window.scrollTo(0, 0));
  await expectTransparentTop(page, theme);
}

test.describe("global navbar scroll behavior", () => {
  test("homepage overlays the full video hero and cycles through top, hidden, and revealed states", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    const heroBox = await page.locator(".home-video-hero").boundingBox();
    const viewportHeight = await page.evaluate(() => window.innerHeight);

    expect(Math.abs((heroBox?.height ?? 0) - viewportHeight)).toBeLessThanOrEqual(1);
    expect(heroBox?.y).toBe(0);
    await expectTransparentTop(page, "light");

    await expectScrollCycle(page, "/", "light");
  });

  test("uses the same scroll model across product, editorial, account, and auth routes", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    for (const path of [
      "/products",
      "/products/recode-03-pdrn-5-ampoule",
      "/method",
      "/about",
      "/account/sign-in",
    ]) {
      await expectScrollCycle(page, path);
    }
  });

  test("route changes reset a hidden navbar to the new route top state", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    const header = page.locator(".site-header");

    await expectTransparentTop(page, "light");
    await scrollDownUntilHidden(page);

    await page.goto("/products");
    await expectTransparentTop(page, "dark");

    await page.goBack();
    await expect(header).toHaveAttribute("data-nav-state", /^(top|revealed)$/);
    const restored = await readHeaderState(page);
    if (await page.evaluate(() => window.scrollY <= 8)) {
      expect(restored.navState).toBe("top");
      expect(restored.headerTheme).toBe("light");
    } else {
      expect(restored.navState).toBe("revealed");
    }
  });

  test("drawers and keyboard focus force the navbar visible with a surfaced treatment", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/products");

    const header = page.locator(".site-header");

    await expectTransparentTop(page, "dark");
    await scrollDownUntilHidden(page);

    await page.getByLabel("Mei-Pelle home").focus();
    await expect(header).toHaveAttribute("data-nav-state", "revealed");

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.getByRole("button", { name: "SEARCH" }).click();
    await expect(page.getByRole("dialog", { name: "Search" })).toBeVisible();
    await expect(header).toHaveAttribute("data-overlay-open", "true");
    await expect(header).toHaveAttribute("data-nav-state", "revealed");
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: /CART \(0\)/ }).click();
    await expect(page.getByRole("dialog", { name: "Cart" })).toBeVisible();
    await expect(header).toHaveAttribute("data-overlay-open", "true");
    await expect(header).toHaveAttribute("data-nav-state", "revealed");
  });

  test("mobile menu pins the navbar visibly without flicker-prone top state changes", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/method");

    const header = page.locator(".site-header");

    await expectTransparentTop(page, "dark");
    await page.getByRole("button", { name: "Menu" }).click();

    await expect(page.getByRole("dialog", { name: "Menu" })).toBeVisible();
    await expect(header).toHaveAttribute("data-overlay-open", "true");
    await expect(header).toHaveAttribute("data-nav-state", "revealed");

    await page.evaluate(() => window.scrollTo(0, 320));
    await expect(header).toHaveAttribute("data-nav-state", "revealed");
  });
});
