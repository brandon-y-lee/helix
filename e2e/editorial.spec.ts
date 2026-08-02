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
