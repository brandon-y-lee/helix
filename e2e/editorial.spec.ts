import { expect, test } from "./storefront-fixture";

test("primary navigation reaches System, a live PDP, and About", async ({
  page,
  storefront,
}) => {
  await page.goto("/");
  const primary = page.getByRole("navigation", { name: "Primary" });

  await primary.getByRole("link", { name: "SYSTEM" }).click();
  await expect(page).toHaveURL(/\/system$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "THE SYSTEM." }),
  ).toBeVisible();

  const productLink = page.locator(".method-step__link").first();
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
