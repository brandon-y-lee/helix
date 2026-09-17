import { expect, test } from "./storefront-fixture";
import { CANVAS_WHITE, CONTROL_BORDER, PANEL_GRAY, expectGrayPanels, expectWhiteCanvas } from "./surface-assertions";
import { expectNoMainOverflow } from "./layout-assertions";
import { SERUM_EFFECTS_PRODUCT_ID, effects } from "@/lib/content/serum-effects";

test("PDP editorial panels remain distinct from the white page canvas", async ({ page, storefront }) => {
  const product = storefront.snapshot.products.find((candidate) => candidate.routineGroup === "beyond_core");
  if (!product) throw new Error("The canonical snapshot must include a Beyond Core PDP.");

  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto(product.path);
    await expectWhiteCanvas(page);
    await expectGrayPanels(page.locator(".pdp-editorial-pair__panel--headline"));
  }
});

test("Effects keep distinct desktop panels, inset controls and preserved illustration", async ({ page, storefront }) => {
  test.setTimeout(60_000);
  const product = storefront.snapshot.products.find((candidate) => candidate.id === SERUM_EFFECTS_PRODUCT_ID);
  if (!product) throw new Error("The canonical snapshot must include the Effects PDP.");
  await page.goto(product.path);
  const artwork: Record<string, string> = {
    hydration: "rgb(220, 230, 223)",
    barrier: "rgb(215, 222, 209)",
    clarity: "rgb(233, 223, 203)",
    firmness: "rgb(220, 216, 227)",
  };

  for (const viewport of [
    { width: 390, height: 844 }, { width: 800, height: 1000 },
    { width: 801, height: 1000 }, { width: 820, height: 1000 },
    { width: 821, height: 1000 }, { width: 810, height: 640 },
    { width: 1440, height: 1000 },
  ]) {
    await page.setViewportSize(viewport);
    const section = page.locator("#effects-prototype");
    await expect(section.locator(":scope > div").first()).toHaveCSS("background-color", CANVAS_WHITE);
    if (viewport.width > 800) {
      const selector = section.locator('[aria-label="Explore product effects"]').locator("..");
      await expect(selector).toHaveCSS("background-color", CANVAS_WHITE);
      await expect(selector).toHaveCSS("border-radius", "12px");
      const illustration = section.locator("[data-effect]");
      await expect(illustration).toHaveCSS("border-radius", "12px");
      const panel = await selector.boundingBox();
      const image = await illustration.boundingBox();
      expect(panel && image && image.x - (panel.x + panel.width)).toBeGreaterThan(0);
      await expect(section.getByRole("button", { name: "Hydration", exact: true })).toHaveCSS("box-shadow", "none");
    }
    if (viewport.width === 1440) {
      const option = section.getByRole("button", { name: "Hydration", exact: true });
      await option.hover();
      await expect(option).toHaveCSS("background-color", "rgb(232, 232, 237)");
      await expect(option).toHaveCSS("transition", "background-color 0.25s linear");
      await page.emulateMedia({ reducedMotion: "reduce" });
      await expect(option).toHaveCSS("transition-duration", "0s");
      await page.emulateMedia({ reducedMotion: "no-preference" });
    }
    for (const effect of effects) {
      const option = section.getByRole("button", { name: effect.title, exact: true });
      await option.click();
      await expect(option).toHaveAttribute("aria-expanded", "true");
      await page.mouse.move(0, 0);
      await expect(option).toHaveCSS("background-color", PANEL_GRAY);
      const properties = section.getByRole("region", { name: `${effect.title} properties` });
      await expect(properties.getByRole("article").first().locator("..")).toHaveCSS("background-color", PANEL_GRAY);
      await expect(section.locator(`[data-effect="${effect.id}"]`)).toHaveCSS("background-color", artwork[effect.id]);
    }
    await section.getByRole("button", { name: "Collapse effect description" }).click();
    await expectNoMainOverflow(page, viewport.width);
  }
});

test("every canonical PDP keeps purchase and review surfaces gray with distinct family choices", async ({ page, storefront }) => {
  test.setTimeout(120_000);
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    for (const product of storefront.snapshot.products) {
      await page.goto(product.path);
      await expectWhiteCanvas(page);
      await expectGrayPanels(page.locator(".pdp__purchase, .pdp-sticky-purchase, .pdp-reviews"));
      for (const option of await page.locator("a.pdp-family-selector__option").all()) {
        await expect(option).toHaveCSS("background-color", CANVAS_WHITE);
        await expect(option).toHaveCSS("border-top-color", CONTROL_BORDER);
      }
      await expectNoMainOverflow(page, viewport.width);
    }
  }
});

test("disabled purchase verification keeps size choices and mobile sticky controls distinct", async ({ page }) => {
  test.setTimeout(60_000);
  for (const presentation of ["default", "mobile-pilot"]) {
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await page.goto(`/helix-verification/pdp-purchase?presentation=${presentation}`);
      await expect(page.locator("[data-pdp-buy-button]")).toBeDisabled();
      const secondSize = page.getByRole("button", { name: "60 mL", exact: true });
      await expect(secondSize).toHaveCSS("background-color", CANVAS_WHITE);
      await expect(secondSize).toHaveCSS("border-top-color", CONTROL_BORDER);
      await expect(page.getByRole("button", { name: "15 mL", exact: true })).toBeDisabled();
      await secondSize.click();
      await expect(secondSize).toHaveAttribute("aria-pressed", "true");
      await expect(secondSize).toHaveCSS("background-color", "rgb(24, 61, 52)");

      await page.locator("[data-pdp-video-start]").evaluate((boundary) => {
        window.scrollTo(0, window.scrollY + boundary.getBoundingClientRect().top + 80);
      });
      const sticky = page.locator('.pdp-sticky-purchase[data-visible="true"]');
      await expect(sticky).toBeVisible();
      await expect(sticky).toHaveCSS("background-color", PANEL_GRAY);
      await expect(sticky.locator("[data-sticky-pdp-buy-button]")).toBeDisabled();
      if (presentation === "mobile-pilot" && viewport.width <= 820) {
        const configuration = page.getByRole("combobox", { name: "Verification Serum configuration" });
        await expect(configuration).toHaveCSS("background-color", CANVAS_WHITE);
        await expect(configuration).toHaveCSS("border-top-color", CONTROL_BORDER);
        await expect(configuration).toHaveValue("verification-60ml");
        await configuration.selectOption("verification-30ml");
        await expect(page.getByRole("button", { name: "30 mL", exact: true })).toHaveAttribute("aria-pressed", "true");
      }
      await expectNoMainOverflow(page, viewport.width);
    }
  }
});

test("the waitlist keeps a white sheet and an identifiable gray email field", async ({ page, storefront }) => {
  const product = storefront.snapshot.products.find((candidate) => candidate.merchandisingStatus === "waitlist");
  test.skip(!product, "The canonical catalog currently has no waitlist PDP to inspect.");
  if (!product) return;
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto(product.path);
    const trigger = page.locator("[data-pdp-buy-button]");
    await trigger.click();
    const sheet = page.locator(".product-waitlist-sheet");
    await expect(sheet).toBeVisible();
    await expect(sheet).toHaveCSS("background-color", CANVAS_WHITE);
    await expect(sheet).toHaveCSS("background-image", "none");
    const email = sheet.getByRole("textbox", { name: "Email address" });
    await expect(email).toHaveCSS("background-color", PANEL_GRAY);
    await expect(email).toHaveCSS("border-top-color", CONTROL_BORDER);
    await page.keyboard.press("Escape");
    await expect(sheet).not.toBeVisible();
    await expect(trigger).toBeFocused();
  }
});
