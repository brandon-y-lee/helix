import { expect, test } from "./storefront-fixture";

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("primary navigation reaches System, a live PDP, and About", async ({
  page,
  storefront,
}) => {
  const product = storefront.product("core");
  const systemStep = product.systemStepName?.toLowerCase();
  if (!systemStep) {
    throw new Error(`Product "${product.slug}" has no System Step.`);
  }
  await page.goto("/");
  const primary = page.getByRole("navigation", { name: "Primary" });

  await primary.getByRole("link", { name: "SYSTEM" }).click();
  await expect(page).toHaveURL(/\/system$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "THE SYSTEM." }),
  ).toBeVisible();

  await page
    .locator(`#system-${systemStep}`)
    .getByRole("link", {
      name: new RegExp(`View ${escapeRegExp(product.displayName)}`),
    })
    .click();
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
