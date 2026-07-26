import { expect, test } from "@playwright/test";

test("primary navigation reaches System, a live PDP, and About", async ({
  page,
}) => {
  await page.goto("/");
  const primary = page.getByRole("navigation", { name: "Primary" });

  await primary.getByRole("link", { name: "SYSTEM" }).click();
  await expect(page).toHaveURL(/\/system$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "THE SYSTEM." }),
  ).toBeVisible();

  await page
    .locator("#system-treat")
    .getByRole("link", { name: /View TREAT/ })
    .click();
  await expect(page).toHaveURL(
    /\/products\/treat-03-pdrn-5-ampoule$/,
  );
  await expect(
    page.getByRole("heading", { level: 1, name: "TREAT" }),
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

test("skip link transfers keyboard focus to main content", async ({ page }) => {
  await page.goto("/system");

  const skipLink = page.getByRole("link", {
    name: "Skip to main content",
  });
  await page.keyboard.press("Tab");
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toBeVisible();

  await page.keyboard.press("Enter");
  await expect(page.locator("#content")).toBeFocused();
});

test("mobile menu reaches editorial content without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await page.getByRole("button", { name: "Menu" }).click();
  const menu = page.getByRole("dialog", { name: "Menu" });
  await expect(menu).toBeVisible();
  await menu.getByRole("link", { name: "ABOUT" }).click();
  await expect(page).toHaveURL(/\/about$/);
  await expect(menu).toHaveCount(0);

  await page.goto("/system");
  await page.locator('.method-index a[href="#system-treat"]').click();
  await expect(page).toHaveURL(/\/system#system-treat$/);
  await expect(page.locator("#system-treat")).toBeInViewport();
  await expect(
    page.locator("#system-protect").getByText("COMING SOON"),
  ).toBeVisible();

  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0);
});
