import { writeFile } from "node:fs/promises";
import { expect, test } from "./storefront-fixture";
import { expectNoMainOverflow } from "./layout-assertions";

test("Treat's hero stretches on desktop and grows naturally for purchase details", async ({ page, storefront }, testInfo) => {
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
    const hero = page.locator('.pdp[data-product-slug="super-serum"]');
    const purchase = hero.locator(".pdp__purchase");
    const gallery = hero.locator(".pdp__gallery");
    await expect(purchase.locator("h1")).toHaveText(product.displayName);
    await expect(purchase.locator(".pdp__tagline")).toHaveText("the daily skin concentrate");
    const galleryBox = await gallery.boundingBox();
    const purchaseBox = await purchase.boundingBox();
    if (!galleryBox || !purchaseBox) throw new Error("Treat hero geometry is unavailable.");
    const styles = await purchase.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        overflowY: style.overflowY,
        position: style.position,
        minHeight: style.minHeight,
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
      };
    });
    expect(styles.overflowY).toBe("visible");
    expect(styles.position).toBe("static");
    expect(styles.scrollHeight).toBeLessThanOrEqual(styles.clientHeight + 1);
    if (viewport.width > 820) {
      expect(Math.abs(purchaseBox.y - galleryBox.y)).toBeLessThanOrEqual(1);
      expect(Math.abs(purchaseBox.height - galleryBox.height)).toBeLessThanOrEqual(1);
    } else {
      expect(Math.abs(purchaseBox.y - galleryBox.y - galleryBox.height)).toBeLessThanOrEqual(1);
      expect(styles.minHeight).toBe("auto");
      const detailsGap = await purchase.locator(".pdp-accordions").evaluate((element) => Number.parseFloat(getComputedStyle(element).marginTop));
      expect(detailsGap).toBeLessThanOrEqual(24);
    }
    await expectNoMainOverflow(page, viewport.width);
    await page.screenshot({ path: testInfo.outputPath(`treat-${viewport.width}x${viewport.height}.png`) });

    const trigger = purchase.getByRole("button", { name: "HOW TO USE", exact: true });
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(trigger).toBeFocused();
    const panel = purchase.getByRole("region", { name: "HOW TO USE", exact: true });
    await expect(panel).toBeVisible();
    await panel.scrollIntoViewIfNeeded();
    await expect(panel).toBeInViewport();
    expect(await purchase.evaluate((element) => element.scrollTop)).toBe(0);
    await expectNoMainOverflow(page, viewport.width);
    const expandedBox = await purchase.boundingBox();
    const expandedGallery = await gallery.boundingBox();
    const expandedScroll = await purchase.evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    }));
    expect(expandedScroll.scrollHeight).toBeLessThanOrEqual(expandedScroll.clientHeight + 1);
    if (viewport.width > 820) {
      if (!expandedBox || !expandedGallery) throw new Error("Expanded Treat hero geometry is unavailable.");
      expect(Math.abs(expandedBox.height - expandedGallery.height)).toBeLessThanOrEqual(1);
    }
    measurements.push({ viewport, gallery: galleryBox, purchase: purchaseBox, styles, expanded: expandedBox, expandedGallery, expandedScroll });
    await page.screenshot({ path: testInfo.outputPath(`treat-${viewport.width}x${viewport.height}-expanded.png`) });
  }
  await writeFile(testInfo.outputPath("geometry.json"), JSON.stringify(measurements, null, 2));
});
