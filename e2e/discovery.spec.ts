import { expect, test } from "@playwright/test";
import {
  homeBeyondCoreDescriptions,
  homeCoreDescriptions,
} from "../lib/content/home";

test("Core and Beyond descriptions respond to pointer and keyboard discovery", async ({
  page,
}) => {
  await page.goto("/");

  const core = page.getByRole("region", { name: "The Core", exact: true });
  const coreDescription = core.locator(".home-phased-description");
  await expect(coreDescription).toHaveText(homeCoreDescriptions.default);

  await core.getByRole("link", { name: "CLEANSE", exact: true }).hover();
  await expect(coreDescription).toHaveText(homeCoreDescriptions.items.cleanse);

  await core.getByRole("link", { name: "TREAT", exact: true }).focus();
  await expect(coreDescription).toHaveText(homeCoreDescriptions.items.treat);

  const beyond = page.getByRole("region", {
    name: "Beyond The Core",
    exact: true,
  });
  const beyondDescription = beyond.locator(".home-phased-description");
  await expect(beyondDescription).toHaveText(homeBeyondCoreDescriptions.default);

  await beyond.getByRole("link", { name: "FRAME", exact: true }).hover();
  await expect(beyondDescription).toHaveText(
    homeBeyondCoreDescriptions.items.frame,
  );
  await expect(
    beyond.getByRole("link", {
      name: "View PROTECT System step, coming soon",
    }),
  ).toHaveCount(0);
});

test("Beyond carousel is finite and keyboard operable on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const beyond = page.getByRole("region", {
    name: "Beyond The Core",
    exact: true,
  });
  const carousel = beyond.locator(".home-beyond-carousel");
  await expect(carousel).toHaveAttribute("data-active-index", "0");
  await expect(
    beyond.getByRole("button", { name: "Previous product" }),
  ).toHaveCount(0);

  const next = beyond.getByRole("button", { name: "Next product" });
  await next.focus();
  await page.keyboard.press("Enter");
  await expect(carousel).toHaveAttribute("data-active-index", "1");
  await expect(
    beyond.getByRole("button", { name: "Previous product" }),
  ).toBeVisible();

  await expect
    .poll(async () => {
      await beyond.getByRole("button", { name: "Next product" }).click();
      return carousel.getAttribute("data-active-index");
    })
    .toBe("2");
  await expect(
    beyond.getByRole("button", { name: "Next product" }),
  ).toHaveCount(0);
});

test("homepage ingredient discovery lands below the fixed System header", async ({
  page,
}) => {
  await page.goto("/");

  const link = page.getByRole("link", {
    name: "Read about PDRN in the System",
  });
  await expect(link).toHaveAttribute(
    "href",
    "/system#system-ingredient-pdrn",
  );
  await link.click();

  await expect(page).toHaveURL(/\/system#system-ingredient-pdrn$/);
  const ingredient = page.locator("#system-ingredient-pdrn");
  await expect(
    ingredient.getByRole("heading", { name: "PDRN / Sodium DNA" }),
  ).toBeVisible();
  await expect
    .poll(() =>
      ingredient.evaluate((element) => {
        const headerBottom =
          document
            .querySelector(".site-header")
            ?.getBoundingClientRect().bottom ?? 0;
        return element.getBoundingClientRect().top >= headerBottom;
      }),
    )
    .toBe(true);
});

test("PDP discovery excludes the current product and navigates a recommendation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/products/treat-03-pdrn-5-ampoule");

  const reviews = page.getByRole("region", {
    name: "TREAT customer reviews",
  });
  const discovery = page.getByRole("region", {
    name: "Recommended products",
  });
  await expect(reviews).toBeAttached();
  await expect(discovery).toBeVisible();

  const firstLink = discovery.locator(".product-card__link").first();
  const href = await firstLink.getAttribute("href");
  expect(href).toMatch(/^\/products\/[\w-]+$/);
  await firstLink.click();

  await expect(page).toHaveURL(new RegExp(`${href}$`));
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
