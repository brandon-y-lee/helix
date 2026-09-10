import { expect, test } from "./storefront-fixture";
import { expectStableIdentityLayout } from "./identity-assertions";
import { createCartLayoutFixture } from "./cart-fixture";

test("global navbar follows scroll direction and returns to its top state", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/");
  const header = page.locator(".site-header");
  const homepageSurface = page.locator(
    'main[data-storefront-main] > [data-header-layout="overlay"][data-header-theme="light"]',
  );
  await expect(header).toHaveAttribute("data-nav-state", "top");
  await expect(homepageSurface).toHaveCount(1);
  expect(
    await page.evaluate(() => {
      const headerElement = document.querySelector(".site-header");
      const heroElement = document.querySelector(
        'main[data-storefront-main] > [data-header-layout="overlay"]',
      );
      if (!headerElement || !heroElement) return false;
      return (
        headerElement.getBoundingClientRect().bottom >
        heroElement.getBoundingClientRect().top
      );
    }),
  ).toBe(true);

  await page.evaluate(() => window.scrollTo(0, 600));
  await expect(header).toHaveAttribute("data-nav-state", "hidden");

  await page.evaluate(() => window.scrollBy(0, -240));
  await expect(header).toHaveAttribute("data-nav-state", "revealed");

  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(header).toHaveAttribute("data-nav-state", "top");
  expect(pageErrors, "The shared shell must hydrate without runtime recovery errors").toEqual([]);
});

test("client navigation updates declarative header presentation", async ({
  page,
}) => {
  await page.goto("/");
  const overlaySurface = page.locator(
    'main[data-storefront-main] > [data-header-layout="overlay"]',
  );
  await expect(overlaySurface).toHaveCount(1);

  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("link", { name: "SHOP" })
    .click();
  await expect(page).toHaveURL(/\/collections\/shop$/);
  await expect(overlaySurface).toHaveCount(0);
  await expect(page.locator(".site-header")).toHaveAttribute(
    "data-nav-state",
    "top",
  );

  await page.getByLabel("helix home").click();
  await expect(page).toHaveURL(/\/$/);
  await expect(overlaySurface).toHaveCount(1);
});

test("shared Helix identities remain accessible and responsive", async ({
  page,
}) => {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");

    const homeLink = page.getByRole("link", { name: "helix home" });
    const wordmark = homeLink.locator('[data-helix-identity="wordmark"]');
    await expect(homeLink).toBeVisible();
    await expect(wordmark).toHaveAttribute("aria-hidden", "true");
    await homeLink.focus();
    await expect(homeLink).toBeFocused();

    await expectStableIdentityLayout(wordmark);

    const layout = await page.evaluate(() => {
      const root = document.documentElement;
      const header = document.querySelector(".site-header");
      const identity = document.querySelector(
        '.brand [data-helix-identity="wordmark"]',
      );
      const headerRect = header?.getBoundingClientRect();
      const identityRect = identity?.getBoundingClientRect();
      return {
        hasHorizontalOverflow: root.scrollWidth > window.innerWidth,
        identityInsideHeader:
          Boolean(headerRect) &&
          Boolean(identityRect) &&
          identityRect!.top >= headerRect!.top &&
          identityRect!.bottom <= headerRect!.bottom,
      };
    });
    expect(layout).toEqual({
      hasHorizontalOverflow: false,
      identityInsideHeader: true,
    });

    await expect(
      page.locator('link[rel~="icon"][href="/brand/helix-symbol-black.svg"]'),
    ).toHaveCount(1);
  }
});

test("mobile menu keeps the navbar visible and restores trigger focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/system");

  const header = page.locator(".site-header");
  const trigger = page.getByRole("button", { name: "Menu" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Menu" });
  await expect(dialog).toBeVisible();
  await expect(header).toHaveAttribute("data-overlay-open", "true");
  await expect(header).toHaveAttribute("data-nav-state", "revealed");
  for (const [name, href] of [
    ["SHOP", "/collections/shop"],
    ["Core", "/collections/core"],
    ["Beyond The Core", "/collections/beyond-the-core"],
    ["SYSTEM", "/system"],
    ["ABOUT", "/about"],
    ["ACCOUNT", "/account"],
    ["Support", "/faq"],
  ]) {
    await expect(dialog.getByRole("link", { name, exact: true })).toHaveAttribute("href", href);
  }

  const symbol = dialog.getByRole("img", { name: "helix" });
  await expect(symbol).toHaveAttribute("data-helix-identity", "symbol");
  await page.waitForTimeout(350);
  await expectStableIdentityLayout(symbol);

  const symbolLayout = await page.evaluate(() => {
    const root = document.documentElement;
    const panel = document.querySelector(".mobile-nav-sheet");
    const identity = panel?.querySelector(
      '[data-helix-identity="symbol"]',
    );
    const panelRect = panel?.getBoundingClientRect();
    const identityRect = identity?.getBoundingClientRect();
    return {
      hasHorizontalOverflow: root.scrollWidth > window.innerWidth,
      identityInsidePanel:
        Boolean(panelRect) &&
        Boolean(identityRect) &&
        identityRect!.left >= panelRect!.left &&
        identityRect!.right <= panelRect!.right &&
        identityRect!.top >= panelRect!.top &&
        identityRect!.bottom <= panelRect!.bottom,
    };
  });
  expect(symbolLayout).toEqual({
    hasHorizontalOverflow: false,
    identityInsidePanel: true,
  });

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Menu" })).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

for (const { width, count } of [
  { width: 320, count: 0 },
  { width: 320, count: 198 },
  { width: 390, count: 0 },
  { width: 430, count: 0 },
  { width: 920, count: 0 },
]) {
  test(`compact header preserves centered identity and usable controls at ${width}px with ${count} items`, async ({ page, storefront }) => {
    await page.setViewportSize({ width, height: 844 });
    const cartState = createCartLayoutFixture(storefront.snapshot.products, {
      lineCount: count === 0 ? 0 : 2,
      quantity: 99,
    });
    await page.route("**/api/cart", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(cartState),
    }));
    await page.route("**/api/rewards/summary", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ authenticated: false }),
    }));
    await page.goto("/");

    const header = page.locator(".site-header");
    const menu = header.getByRole("button", { name: "Menu", exact: true });
    const search = header.getByRole("button", { name: "SEARCH", exact: true });
    const cart = header.getByRole("button", {
      name: count === 0 ? "CART (0), empty" : `CART (${count}), ${count} items`,
      exact: true,
    });
    await expect(cart).toBeVisible();
    await expect(cart.locator(".cart-link__mobile > span")).toHaveText(String(count));
    await expect(cart.locator(".cart-link__mobile")).toBeVisible();
    await expect(header.getByRole("navigation", { name: "Primary" })).toBeHidden();

    const identity = header.getByRole("link", { name: "helix home" });
    const identityBox = await identity.boundingBox();
    const headerBox = await header.boundingBox();
    expect(identityBox).not.toBeNull();
    expect(headerBox).not.toBeNull();
    expect(headerBox!.height).toBeCloseTo(64, 1);
    expect(identityBox!.x + identityBox!.width / 2).toBeCloseTo(width / 2, 1);

    for (const control of [menu, search, cart]) {
      await expect(control).toBeInViewport({ ratio: 1 });
      const box = await control.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    }
    const menuBox = (await menu.boundingBox())!;
    const searchBox = (await search.boundingBox())!;
    const cartBox = (await cart.boundingBox())!;
    expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(identityBox!.x);
    expect(identityBox!.x + identityBox!.width).toBeLessThanOrEqual(searchBox.x);
    expect(searchBox.x + searchBox.width).toBeLessThanOrEqual(cartBox.x);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  });
}

test("desktop navigation remains visible above the compact header breakpoint", async ({ page }) => {
  for (const width of [921, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");
    const header = page.locator(".site-header");
    await expect(header.getByRole("button", { name: "Menu", exact: true })).toBeHidden();
    await expect(header.getByRole("navigation", { name: "Primary" })).toBeVisible();
    const utilities = header.getByRole("navigation", { name: "Utilities" });
    await expect(utilities.getByRole("link", { name: "ACCOUNT", exact: true })).toBeVisible();
    await expect(utilities.locator(".site-nav__search .site-nav__label")).toBeVisible();
    await expect(utilities.locator(".cart-link .site-nav__label")).toBeVisible();
    await expect(utilities.locator(".cart-link__mobile")).toBeHidden();
    const identityBox = await header.getByRole("link", { name: "helix home" }).boundingBox();
    expect(identityBox).not.toBeNull();
    expect(identityBox!.x + identityBox!.width / 2).toBeCloseTo(width / 2, 1);
  }
});

test("short mobile menu scrolls wrapped keyboard focus into view without moving the page", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 320 });
  await page.goto("/system");
  // The persistent portal is client-mounted; let initial effects settle before
  // testing scroll direction on an otherwise fast, server-rendered route.
  await expect(page.locator(".search-sheet")).toHaveAttribute("data-state", "closed");
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
  const header = page.locator(".site-header");
  await page.evaluate(() => window.scrollTo(0, 600));
  await expect(header).toHaveAttribute("data-nav-state", "hidden");
  await page.evaluate(() => window.scrollBy(0, -180));
  await expect(header).toHaveAttribute("data-nav-state", "revealed");
  const origin = await page.evaluate(() => window.scrollY);
  expect(origin).toBeGreaterThan(100);

  const trigger = header.getByRole("button", { name: "Menu", exact: true });
  await trigger.click();
  const menu = page.getByRole("dialog", { name: "Menu", exact: true });
  const close = menu.getByRole("button", { name: "Close", exact: true });
  const support = menu.getByRole("link", { name: "Support", exact: true });
  await expect(close).toBeFocused();
  await expect(close).toBeInViewport({ ratio: 1 });

  await page.keyboard.press("Shift+Tab");
  await expect(support).toBeFocused();
  await expect(support).toBeInViewport({ ratio: 1 });
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  await expect(close).toBeInViewport({ ratio: 1 });

  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
  await expect(trigger).toBeFocused();
  await expect(trigger).toBeInViewport({ ratio: 1 });
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(origin);
});
