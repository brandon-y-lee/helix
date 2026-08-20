import { expect, test } from "@playwright/test";

const formerBrandPattern = new RegExp(["mei", "pelle"].join("[\\s_-]*"), "i");

test("production-rendered Admin shell preserves identity and accessibility", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/helix-verification/admin");

  await expect(page).toHaveTitle("Admin verification | helix");
  await expect(
    page.getByRole("heading", { level: 1, name: "Admin verification" }),
  ).toBeVisible();
  await expect(page.getByText("helix Admin", { exact: true })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(formerBrandPattern);
  await expect(page.locator("html")).toHaveJSProperty(
    "scrollWidth",
    await page.locator("html").evaluate((element) => element.clientWidth),
  );

  const collapse = page.getByRole("button", { name: "Collapse admin sidebar" });
  await collapse.focus();
  await expect(collapse).toBeFocused();
  await collapse.click();
  await expect(
    page.getByRole("button", { name: "Expand admin sidebar" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("helix-admin-sidebar-collapsed")))
    .toBe("true");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  const menu = page.locator('button[aria-controls="admin-mobile-navigation"]');
  await menu.click();
  const drawer = page.getByRole("dialog", { name: "Admin menu" });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Close" })).toBeFocused();
  await drawer.getByRole("button", { name: "Close" }).click();
  await expect(menu).toBeFocused();
  await expect(page.locator("body")).not.toContainText(formerBrandPattern);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    ),
  ).toBe(false);
});
