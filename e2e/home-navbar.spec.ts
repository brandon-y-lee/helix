import { expect, test } from "./storefront-fixture";

test("global navbar follows scroll direction and returns to its top state", async ({
  page,
}) => {
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
  await expect(page.getByRole("dialog", { name: "Menu" })).toBeVisible();
  await expect(header).toHaveAttribute("data-overlay-open", "true");
  await expect(header).toHaveAttribute("data-nav-state", "revealed");

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Menu" })).toHaveCount(0);
  await expect(trigger).toBeFocused();
});
