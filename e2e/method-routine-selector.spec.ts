import { expect, test } from "@playwright/test";

test("System routine length is keyboard operable from foundation to full routine", async ({
  page,
}) => {
  await page.goto("/system");
  const slider = page.getByLabel("Routine length");

  await expect(slider).toHaveValue("7");
  await expect(page.locator(".method-step")).toHaveCount(7);

  await slider.focus();
  await page.keyboard.press("Home");
  await expect(slider).toHaveValue("3");
  await expect(page.locator(".method-step")).toHaveCount(3);
  await expect(page.locator("#system-refine")).toHaveCount(0);
  await expect(page.locator("#system-protect")).toHaveCount(0);

  await page.keyboard.press("ArrowRight");
  await expect(slider).toHaveValue("4");
  const protect = page.locator("#system-protect");
  await expect(protect.getByText("COMING SOON")).toBeVisible();
  await expect(protect.getByRole("button", { name: /add to cart/i })).toHaveCount(
    0,
  );
  await expect(protect).not.toContainText(/\$\d/);

  await page.keyboard.press("End");
  await expect(slider).toHaveValue("7");
  await expect(page.locator(".method-step")).toHaveCount(7);
  await expect(page.locator("#system-lift")).toBeVisible();
});

test("mobile System selector and anchored routine remain usable without overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/system");

  const slider = page.getByLabel("Routine length");
  await expect(slider).toBeVisible();
  await slider.focus();
  await page.keyboard.press("Home");
  await expect(slider).toHaveValue("3");
  await page.keyboard.press("End");
  await expect(slider).toHaveValue("7");

  await page.locator('.method-index__link[href="#system-seal"]').click();
  await expect(page).toHaveURL(/\/system#system-seal$/);
  await expect(page.locator("#system-seal")).toBeInViewport();

  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(1);
});
