import { expect, test } from "./storefront-fixture";

test("System section navigation and legacy anchors are keyboard operable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/system");

  const navigation = page.getByRole("navigation", {
    name: "System step navigation",
  });
  const coreLink = navigation.getByRole("link", { name: /Core/ });
  await coreLink.focus();
  await expect(coreLink).toBeFocused();
  await expect(coreLink).toHaveCSS("outline-style", "solid");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/system#system-core$/);
  await expect(page.locator("#system-core")).toBeInViewport();

  await page.goto("/system#system-treat");
  await expect(page.locator("#system-treat")).toBeInViewport();
});
