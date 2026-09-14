import { expect, test } from "./storefront-fixture";
import { CANVAS_WHITE, CONTROL_BORDER, PANEL_GRAY, expectGrayPanels, expectWhiteCanvas } from "./surface-assertions";
import { expectNoMainOverflow } from "./layout-assertions";

test("the editorial shell uses white canvas and gray bounded panels", async ({ page }) => {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/about");
    await expectWhiteCanvas(page);
    await expectGrayPanels(page.locator(".about-sustainability, .editorial-cta, .about-system__promises p"));
    await expect(page.locator(".site-footer")).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await expectNoMainOverflow(page, viewport.width);
  }
});

test("Home and System preserve white groupings around gray panels", async ({ page }) => {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expectWhiteCanvas(page);
    await expectGrayPanels(page.locator(".home-three-principles-panel, .home-plug-panel, .home-ingredient-card"));
    await expect(page.locator(".home-band")).toHaveCSS("background-color", CANVAS_WHITE);
    await page.goto("/system");
    await expectGrayPanels(page.locator(".method-intentional__copy, .method-beyond-card, .ingredient-carousel__panel"));
    for (const section of await page.locator(".method-beyond, .method-ingredients").all()) {
      await expect(section).toHaveCSS("background-color", CANVAS_WHITE);
      await expect(section).toHaveCSS("background-image", "none");
    }
    await expectNoMainOverflow(page, viewport.width);
  }
});

test("discovery controls remain distinct on neutral cards and sheets", async ({ page }) => {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/collections/shop");
    await expectWhiteCanvas(page);
    await expectGrayPanels(page.locator(".product-card__surface"));
    const sort = page.getByRole("button", { name: /^Sort:/ });
    await sort.click();
    const selected = page.locator('.sort-menu__option[aria-pressed="true"]:visible');
    await expect(selected).toHaveCSS("background-color", "rgb(24, 61, 52)");
    await expect(selected).toHaveCSS("color", "rgb(251, 250, 246)");
    await page.keyboard.press("Escape");
    await expect(sort).toBeFocused();
    await page.getByRole("button", { name: "SEARCH", exact: true }).click();
    const search = page.getByRole("searchbox", { name: "Search products" });
    await expect(search).toHaveCSS("background-color", PANEL_GRAY);
    await expect(search).toHaveCSS("border-top-color", CONTROL_BORDER);
    await expect(page.locator(".search-sheet")).toHaveCSS("background-color", CANVAS_WHITE);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "SEARCH", exact: true })).toBeFocused();
  }
});
