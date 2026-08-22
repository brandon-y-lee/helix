import type { Page } from "@playwright/test";
import { expect, test } from "./storefront-fixture";

async function expectNoMainOverflow(page: Page, viewportWidth: number) {
  const widths = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    mainScrollWidth: document.querySelector("#content")?.scrollWidth ?? 0,
  }));

  expect(widths.clientWidth).toBeLessThanOrEqual(viewportWidth);
  expect(widths.mainScrollWidth).toBe(widths.clientWidth);
}

test("primary navigation reaches System, a live PDP, and About", async ({
  page,
  storefront,
}) => {
  await page.goto("/");
  const primary = page.getByRole("navigation", { name: "Primary" });

  await primary.getByRole("link", { name: "SYSTEM" }).click();
  await expect(page).toHaveURL(/\/system$/);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "a new philosophy on male skincare",
    }),
  ).toBeVisible();

  const productLink = page.locator(".method-system-card__link").first();
  const href = await productLink.getAttribute("href");
  if (!href) throw new Error("The System did not render a Product path.");
  const product = storefront.productAtPath(href);
  await expect(productLink).toHaveAccessibleName(
    `View ${product.displayName} product details`,
  );
  await productLink.click();
  await expect(page).toHaveURL(new RegExp(`${product.path}$`));
  await expect(
    page.getByRole("heading", { level: 1, name: product.displayName }),
  ).toBeVisible();

  await primary.getByRole("link", { name: "ABOUT" }).click();
  await expect(page).toHaveURL(/\/about$/);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "TWO CITIES. ONE STANDARD.",
    }),
  ).toBeVisible();
});

test("System hero uses the campaign image and responsive focal points", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/system");

  const hero = page.locator(".method-hero");
  const image = hero.locator("img");
  const heading = hero.getByRole("heading", {
    level: 1,
    name: "a new philosophy on male skincare",
  });

  await expect(image).toHaveAttribute(
    "src",
    /a-new-philosophy-hero-01\.webp/,
  );
  await expect(image).toHaveAttribute("alt", "");
  await expect(image).toHaveCSS("object-position", "50% 15%");
  await expect(heading).toHaveCSS("color", "rgb(255, 255, 255)");
  await expect(heading).toHaveCSS("font-size", "24px");
  await expect(heading).toHaveCSS("text-align", "center");
  await expect(hero.locator(".eyebrow")).toHaveCount(0);
  await expect(hero.locator("p")).toHaveCount(0);
  await expect(hero.getByRole("link")).toHaveCount(1);
  const coreLink = hero.getByRole("link", { name: "shop the core" });
  await expect(coreLink).toHaveAttribute("href", "/collections/core");
  await expect(coreLink).toHaveCSS("text-transform", "none");

  await page.setViewportSize({ width: 1024, height: 900 });
  await expect(image).toHaveCSS("object-position", "50% 15%");
  await expect(heading).toHaveCSS("font-size", "18px");
  await expectNoMainOverflow(page, 1024);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(image).toHaveCSS("object-position", "60% 50%");
  await expect(heading).toHaveCSS("font-size", "18px");
  await expectNoMainOverflow(page, 390);
});

test("skip link transfers keyboard focus to main content", async ({
  browserName,
  page,
}) => {
  await page.goto("/system");

  const skipLink = page.getByRole("link", {
    name: "Skip to main content",
  });
  await page.keyboard.press(browserName === "webkit" ? "Alt+Tab" : "Tab");
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toBeVisible();

  await page.keyboard.press("Enter");
  await expect(page.locator("#content")).toBeFocused();
});
