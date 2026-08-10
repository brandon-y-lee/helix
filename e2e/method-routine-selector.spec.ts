import { expect, test } from "./storefront-fixture";

test("System routine selector and anchored navigation are keyboard operable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/system");
  const slider = page.getByLabel("Routine length");

  await slider.focus();
  await page.keyboard.press("Home");
  await expect(slider).toHaveValue("3");
  await page.keyboard.press("End");
  await expect(slider).toHaveValue("7");

  await page.locator('.method-index__link[href="#system-treat"]').click();
  await expect(page).toHaveURL(/\/system#system-treat$/);
  await expect(page.locator("#system-treat")).toBeInViewport();
});
