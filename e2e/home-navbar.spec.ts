import { expect, test } from "@playwright/test";

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
  await expect(page).toHaveURL(/\/products$/);
  await expect(overlaySurface).toHaveCount(0);
  await expect(page.locator(".site-header")).toHaveAttribute(
    "data-nav-state",
    "top",
  );

  await page.getByLabel("Mei Pelle home").click();
  await expect(page).toHaveURL(/\/$/);
  await expect(overlaySurface).toHaveCount(1);
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
