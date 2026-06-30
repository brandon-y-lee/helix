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
      bottom: rect.bottom,
      color: style.color,
      height: rect.height,
      headerTheme: element.getAttribute("data-header-theme"),
      navState: element.getAttribute("data-nav-state"),
      overlayOpen: element.getAttribute("data-overlay-open"),
      transform: style.transform,
      y: rect.y,
    };
  });
}

async function readLayoutState(page: Page, surfaceSelector: string) {
  return page.evaluate((selector) => {
    const header = document.querySelector(".site-header");
    const main = document.querySelector("main");
    const surface = document.querySelector(selector);
    const hueField = surface?.querySelector(".editorial-hue-field") ?? null;
    const headerRect = header?.getBoundingClientRect();
    const surfaceRect = surface?.getBoundingClientRect();
    const hueFieldRect = hueField?.getBoundingClientRect();
    const token = Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue("--site-header-height"),
    );

    return {
      headerBottom: headerRect?.bottom ?? null,
      headerHeight: headerRect?.height ?? null,
      headerY: headerRect?.y ?? null,
      hueFieldY: hueFieldRect?.y ?? null,
      mainLayout: main?.getAttribute("data-header-layout") ?? null,
      surfaceHeight: surfaceRect?.height ?? null,
      surfaceMinHeight: surface
        ? Number.parseFloat(getComputedStyle(surface).minHeight)
        : null,
      surfaceY: surfaceRect?.y ?? null,
      token,
      viewportHeight: window.innerHeight,
    };
  }, surfaceSelector);
}

function expectCloseTo(actual: number | null, expected: number, tolerance = 1) {
  expect(actual).not.toBeNull();
  expect(Math.abs((actual ?? 0) - expected)).toBeLessThanOrEqual(tolerance);
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
  expectCloseTo(topStyle.height, await page.evaluate(() => {
    return Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue("--site-header-height"),
    );
  }));
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
    const layout = await readLayoutState(page, ".home-video-hero");

    expect(layout.mainLayout).toBe("overlay");
    expect(Math.abs((heroBox?.height ?? 0) - viewportHeight)).toBeLessThanOrEqual(1);
    expect(heroBox?.y).toBe(0);
    expect(layout.headerBottom).toBeGreaterThan((layout.surfaceY ?? 0) + 1);
    expect(layout.headerBottom).toBeLessThan(layout.viewportHeight);
    await expectTransparentTop(page, "light");

    await expectScrollCycle(page, "/", "light");
  });

  test("non-home routes reserve the fixed header row before their first content", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    for (const { path, selector, viewportHero } of [
      { path: "/system", selector: ".method-hero", viewportHero: false },
      { path: "/about", selector: ".about-hero", viewportHero: false },
      { path: "/products", selector: ".shop-hero__surface", viewportHero: false },
      { path: "/products/treat-03-pdrn-5-ampoule", selector: ".pdp", viewportHero: false },
      { path: "/account/sign-in", selector: ".account-panel", viewportHero: false },
    ]) {
      await page.goto(path);
      await expectTransparentTop(page, "dark");

      const layout = await readLayoutState(page, selector);
      expect(layout.mainLayout).toBe("reserved");
      expectCloseTo(layout.headerY, 0);
      expectCloseTo(layout.headerHeight, layout.token);
      expect(layout.surfaceY).toBeGreaterThanOrEqual((layout.headerBottom ?? 0) - 1);

      if (path === "/system" || path === "/about") {
        expect((layout.surfaceY ?? 0) - (layout.headerBottom ?? 0)).toBeGreaterThan(20);
        expect((layout.surfaceY ?? 0) - (layout.headerBottom ?? 0)).toBeLessThanOrEqual(56);
        expectCloseTo(layout.hueFieldY, layout.surfaceY ?? 0, 2);
      }

      if (viewportHero) {
        const expectedHeroHeight = Math.min(760, layout.viewportHeight - layout.token);
        expectCloseTo(layout.surfaceMinHeight, expectedHeroHeight);
        expect(layout.surfaceHeight).toBeGreaterThanOrEqual(expectedHeroHeight - 1);
      }
    }
  });

  test("mobile reserved routes use the mobile header height without covering content", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    for (const { path, selector } of [
      { path: "/system", selector: ".method-hero" },
      { path: "/about", selector: ".about-hero" },
      { path: "/products", selector: ".shop-hero__surface" },
      { path: "/products/treat-03-pdrn-5-ampoule", selector: ".pdp" },
      { path: "/account/sign-in", selector: ".account-panel" },
    ]) {
      await page.goto(path);
      await expectTransparentTop(page, "dark");

      const layout = await readLayoutState(page, selector);
      expect(layout.mainLayout).toBe("reserved");
      expectCloseTo(layout.headerHeight, 62);
      expectCloseTo(layout.headerHeight, layout.token);
      expect(layout.surfaceY).toBeGreaterThanOrEqual((layout.headerBottom ?? 0) - 1);
      expect((layout.surfaceY ?? 0) - (layout.headerBottom ?? 0)).toBeLessThan(120);
    }
  });

  test("uses the same scroll model across product, editorial, account, and auth routes", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    for (const path of [
      "/products",
      "/products/treat-03-pdrn-5-ampoule",
      "/system",
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
    await expect(page.locator("main")).toHaveAttribute("data-header-layout", "overlay");
    await scrollDownUntilHidden(page);

    await page.goto("/products");
    await expect(page.locator("main")).toHaveAttribute("data-header-layout", "reserved");
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

    await page.getByLabel("Mei Pelle home").focus();
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
    await page.goto("/system");

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
