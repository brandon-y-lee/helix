import { writeFile } from "node:fs/promises";
import type { Locator } from "@playwright/test";
import { expect, test } from "./storefront-fixture";
import { expectNoMainOverflow } from "./layout-assertions";

function scrollState(purchase: Locator) {
  return purchase.evaluate((element) => ({
    top: element.scrollTop,
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
}

async function expectBottomReveal(purchase: Locator) {
  await expect.poll(async () => {
    const state = await scrollState(purchase);
    return Math.abs(state.scrollHeight - state.clientHeight - state.top);
  }).toBeLessThanOrEqual(1);
}

test("Treat fills the desktop hero and reveals details inside its original scroll container", async ({ page, storefront }, testInfo) => {
  test.setTimeout(90_000);
  const product = storefront.snapshot.products.find(({ slug }) => slug === "super-serum");
  if (!product) throw new Error("The canonical snapshot must include Treat (super-serum).");
  await page.emulateMedia({ reducedMotion: "reduce" });
  const measurements = [];

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1280, height: 720 },
    { width: 821, height: 480 },
    { width: 820, height: 480 },
    { width: 390, height: 844 },
    { width: 320, height: 568 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(product.path);
    const desktop = viewport.width > 820;
    const hero = page.locator('.pdp[data-product-slug="super-serum"]');
    const purchase = hero.locator(".pdp__purchase");
    const gallery = hero.locator(".pdp__gallery");
    await expect(purchase.locator("h1")).toHaveText(product.displayName);
    await expect(purchase.locator(".pdp__tagline")).toHaveText("the daily skin concentrate");
    await expect(purchase.locator(".pdp__price")).toHaveCount(0);
    const routine = purchase.getByRole("region", { name: "Complete the routine", exact: true });
    const partners = storefront.snapshot.products.filter((candidate) => candidate.routineGroup === "core" && candidate.slug !== product.slug);
    await expect(routine.getByRole("link")).toHaveCount(partners.length);
    for (const partner of partners) {
      await expect(routine.getByRole("link", { name: new RegExp(partner.displayName) })).toHaveAttribute("href", partner.path);
    }
    const galleryBox = await gallery.boundingBox();
    const purchaseBox = await purchase.boundingBox();
    if (!galleryBox || !purchaseBox) throw new Error("Treat hero geometry is unavailable.");
    const styles = await purchase.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        overflowY: style.overflowY,
        position: style.position,
        overscrollBehavior: style.overscrollBehaviorY,
        scrollbarGutter: style.scrollbarGutter,
      };
    });
    if (desktop) {
      expect(styles).toEqual({ overflowY: "auto", position: "sticky", overscrollBehavior: "contain", scrollbarGutter: "stable" });
      expect(Math.abs(purchaseBox.y - galleryBox.y)).toBeLessThanOrEqual(1);
      expect(Math.abs(purchaseBox.height - galleryBox.height)).toBeLessThanOrEqual(1);
      expect(purchaseBox.y + purchaseBox.height).toBeLessThanOrEqual(viewport.height);
    } else {
      expect(styles.overflowY).toBe("visible");
      expect(styles.position).toBe("static");
      expect(Math.abs(purchaseBox.y - galleryBox.y - galleryBox.height)).toBeLessThanOrEqual(1);
      const initial = await scrollState(purchase);
      expect(initial.scrollHeight).toBeLessThanOrEqual(initial.clientHeight + 1);
    }
    await expectNoMainOverflow(page, viewport.width);
    await page.screenshot({ path: testInfo.outputPath(`treat-${viewport.width}x${viewport.height}.png`) });

    const use = purchase.getByRole("button", { name: "HOW TO USE", exact: true });
    const ingredients = purchase.getByRole("button", { name: "KEY INGREDIENTS", exact: true });
    await use.focus();
    const origin = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
    await page.keyboard.press("Enter");
    await expect(use).toHaveAttribute("aria-expanded", "true");
    await expect(use).toBeFocused();
    await expect(purchase.getByRole("region", { name: "HOW TO USE", exact: true })).toBeVisible();
    if (desktop) await expectBottomReveal(purchase);
    else expect((await scrollState(purchase)).top).toBe(0);
    expect(await page.evaluate(() => ({ x: scrollX, y: scrollY }))).toEqual(origin);
    const opened = await scrollState(purchase);
    if (desktop && viewport.height <= 720) {
      expect(opened.scrollHeight).toBeGreaterThan(opened.clientHeight);
      expect(opened.top).toBeGreaterThan(0);
    }
    await page.screenshot({ path: testInfo.outputPath(`treat-${viewport.width}x${viewport.height}-expanded.png`) });

    await ingredients.focus();
    await page.keyboard.press("Enter");
    await expect(use).toHaveAttribute("aria-expanded", "false");
    await expect(ingredients).toHaveAttribute("aria-expanded", "true");
    await expect(ingredients).toBeFocused();
    if (desktop) await expectBottomReveal(purchase);
    else expect((await scrollState(purchase)).top).toBe(0);
    const switched = await scrollState(purchase);

    await page.keyboard.press("Enter");
    await expect(ingredients).toHaveAttribute("aria-expanded", "false");
    await expect(ingredients).toBeFocused();
    await use.click();
    await use.click();
    await expect(use).toHaveAttribute("aria-expanded", "false");
    await expect(use).toBeFocused();
    const closed = await scrollState(purchase);
    expect(closed.top).toBeGreaterThanOrEqual(0);
    expect(closed.top).toBeLessThanOrEqual(closed.scrollHeight - closed.clientHeight + 1);
    const finalBox = await purchase.boundingBox();
    if (!finalBox) throw new Error("Treat's purchase island is unavailable after repeated toggles.");
    if (desktop) expect(Math.abs(finalBox.height - purchaseBox.height)).toBeLessThanOrEqual(1);
    await expectNoMainOverflow(page, viewport.width);
    measurements.push({ viewport, gallery: galleryBox, purchase: purchaseBox, styles, opened, switched, closed, finalBox });
  }
  await writeFile(testInfo.outputPath("geometry.json"), JSON.stringify(measurements, null, 2));
});

test("Treat's main purchase action uses amber and the reference gray without changing its price", async ({ page, storefront }) => {
  const product = storefront.snapshot.products.find(({ slug }) => slug === "super-serum");
  if (!product) throw new Error("The canonical snapshot must include Treat (super-serum).");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(product.path);
  const main = page.locator("[data-pdp-buy-button]");
  await page.mouse.move(0, 0);
  await expect(main).toHaveCSS("background-color", "rgb(228, 193, 117)");
  await expect(main).toHaveCSS("color", "rgb(17, 19, 18)");
  await expect(main).toHaveCSS("border-top-color", "rgb(103, 100, 94)");
  await expect(main).toHaveCSS("border-top-width", "1px");
  const label = await main.textContent();
  await main.hover();
  await expect(main).toHaveCSS("color", "rgb(255, 255, 255)");
  await expect.poll(() => main.evaluate((button) => getComputedStyle(button, "::before").opacity)).toBe("1");
  expect(await main.evaluate((button) => getComputedStyle(button, "::before").backgroundColor)).toBe("rgb(103, 100, 94)");
  await expect(main).toHaveText(label ?? "");
  await main.focus();
  await expect(main).toHaveCSS("outline-style", "solid");
  await expect(page.locator("[data-sticky-pdp-buy-button]")).not.toHaveCSS("background-color", "rgb(228, 193, 117)");
});

test("Treat preserves normal-motion bottom reveal and trigger focus when switching details", async ({ page, storefront }) => {
  const product = storefront.snapshot.products.find(({ slug }) => slug === "super-serum");
  if (!product) throw new Error("The canonical snapshot must include Treat (super-serum).");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(product.path);
  const purchase = page.locator('.pdp[data-product-slug="super-serum"] .pdp__purchase');
  for (const name of ["HOW TO USE", "KEY INGREDIENTS"]) {
    const trigger = purchase.getByRole("button", { name, exact: true });
    await trigger.focus();
    const origin = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
    await page.keyboard.press("Enter");
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(trigger).toBeFocused();
    await expectBottomReveal(purchase);
    expect(await page.evaluate(() => ({ x: scrollX, y: scrollY }))).toEqual(origin);
  }
});
