import type { Locator, Page } from "@playwright/test";
import { getPdpPresentation } from "@/components/product-detail/pdp-presentation";
import type { StorefrontJourneys } from "@/test-support/storefront-journeys";
import { installCartFixture } from "./cart-fixture";
import { expectNoMainOverflow } from "./layout-assertions";
import { expect, test } from "./storefront-fixture";

function pilotProduct(storefront: StorefrontJourneys) {
  const product = storefront.snapshot.products.find(
    (candidate) => getPdpPresentation(candidate.slug) === "mobile-pilot",
  );
  if (!product) {
    throw new Error("The mobile PDP pilot is missing from the governed Storefront snapshot.");
  }
  return product;
}

async function box(locator: Locator) {
  const value = await locator.boundingBox();
  if (!value) throw new Error("Expected a rendered PDP element with measurable geometry.");
  return value;
}

async function scrollEdgeTo(
  page: Page,
  locator: Locator,
  edge: "top" | "bottom",
  target: number,
) {
  const current = await locator.evaluate(
    (element, selectedEdge) => element.getBoundingClientRect()[selectedEdge],
    edge,
  );
  // Wheel over the page gutter, outside the independently scrolling desktop purchase panel.
  await page.mouse.move(1, (page.viewportSize()?.height ?? 844) / 2);
  await page.mouse.wheel(0, current - target);
  await expect.poll(async () => {
    const actual = await locator.evaluate(
      (element, selectedEdge) => element.getBoundingClientRect()[selectedEdge],
      edge,
    );
    return Math.abs(actual - target);
  }).toBeLessThanOrEqual(2);
}

async function expectStickyVisible(page: Page, visible: boolean) {
  const sticky = page.locator(".pdp-sticky-purchase");
  await expect(sticky).toHaveAttribute("data-visible", String(visible));
  await expect(sticky).toHaveAttribute("aria-hidden", String(!visible));
  if (visible) {
    await expect(sticky).not.toHaveAttribute("inert", "");
  } else {
    await expect(sticky).toHaveAttribute("inert", "");
  }
}

for (const viewport of [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 812, height: 375 },
  { width: 820, height: 1024 },
]) {
  test(`mobile pilot gallery and purchase geometry at ${viewport.width}×${viewport.height}`, async ({
    page,
    storefront,
  }) => {
    const product = pilotProduct(storefront);
    const media = storefront.gallery(product);
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(product.path);

    await expect(page.locator(".storefront-shell[data-pdp-presentation]")).toHaveAttribute(
      "data-pdp-presentation",
      "mobile-pilot",
    );
    const gallery = page.locator(".pdp__gallery");
    const frame = gallery.locator(".pdp__media-viewport");
    const purchase = page.locator(".pdp__purchase");
    const mainAction = page.locator("[data-pdp-buy-button]");
    const frameBox = await box(frame);
    const galleryBox = await box(gallery);
    const purchaseBox = await box(purchase);
    expect(frameBox.width / frameBox.height).toBeCloseTo(4 / 5, 2);
    expect(Math.abs(galleryBox.x - purchaseBox.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(galleryBox.width - purchaseBox.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(purchaseBox.y - galleryBox.y - galleryBox.height)).toBeLessThanOrEqual(1);
    expect((await box(mainAction)).height).toBeGreaterThanOrEqual(48);

    const thumbnails = gallery.locator("[data-pdp-media-thumbnail]");
    await expect(thumbnails).toHaveCount(media.length);
    if (media.length > 1) {
      for (const thumbnail of await thumbnails.all()) {
        const target = await box(thumbnail);
        expect(target.width).toBeGreaterThanOrEqual(44);
        expect(target.height).toBeGreaterThanOrEqual(44);
      }
      const nextSlide = await box(gallery.locator("[data-pdp-gallery-slide]").nth(1));
      const peek = frameBox.x + frameBox.width - nextSlide.x;
      expect(peek).toBeGreaterThanOrEqual(12);
      expect(peek).toBeLessThanOrEqual(20);
    } else {
      await expect(gallery.locator("[data-pdp-media-rail]")).toBeHidden();
    }
    await expectNoMainOverflow(page, viewport.width);

    await expectStickyVisible(page, false);
    await scrollEdgeTo(page, mainAction, "bottom", 8);
    await expectStickyVisible(page, false);
    await scrollEdgeTo(page, mainAction, "bottom", -8);
    await expectStickyVisible(page, true);
    expect((await box(page.locator("[data-pdp-video-start]"))).y).toBeGreaterThan(0);

    const stickyBox = await box(page.locator(".pdp-sticky-purchase"));
    // Playwright desktop-browser viewport emulation has a zero hardware safe-area inset.
    expect(stickyBox.height).toBeGreaterThanOrEqual(64);
    expect(stickyBox.height).toBeLessThanOrEqual(76);
    expect(stickyBox.x).toBeCloseTo(0, 0);
    expect(stickyBox.width).toBeCloseTo(await page.evaluate(() => document.documentElement.clientWidth), 0);
    expect(stickyBox.y + stickyBox.height).toBeCloseTo(viewport.height, 0);
    expect((await box(page.locator("[data-sticky-pdp-buy-button]"))).height).toBeGreaterThanOrEqual(48);

    const disclosure = page.getByRole("button", { name: "HOW TO USE", exact: true });
    await disclosure.click();
    await expect(disclosure).toHaveAttribute("aria-expanded", "true");
    await scrollEdgeTo(page, mainAction, "bottom", -8);
    await expectStickyVisible(page, true);
    expect((await box(page.locator("[data-pdp-video-start]"))).y).toBeGreaterThan(0);
    await scrollEdgeTo(page, mainAction, "bottom", 8);
    await expectStickyVisible(page, false);

    await page.locator("#site-footer").scrollIntoViewIfNeeded();
    await expectStickyVisible(page, false);
    await expectNoMainOverflow(page, viewport.width);
  });
}

test("pilot gallery has bounded pointer and keyboard navigation and retains selection across its breakpoint", async ({
  page,
  storefront,
}) => {
  const product = pilotProduct(storefront);
  const media = storefront.gallery(product);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(product.path);
  const gallery = page.locator(".pdp__gallery");
  const thumbnails = gallery.locator("[data-pdp-media-thumbnail]");
  const activeSlide = gallery.locator('[data-pdp-gallery-slide][data-state="active"]');
  await expect(thumbnails).toHaveCount(media.length);

  if (media.length < 2) {
    await expect(gallery.locator("[data-pdp-media-rail]")).toBeHidden();
    await expect(activeSlide).toHaveCount(media.length);
    return;
  }

  await expect(thumbnails.first()).toHaveAttribute("aria-pressed", "true");
  const frame = await box(gallery.locator(".pdp__media-viewport"));
  const startX = frame.x + frame.width * 0.8;
  const startY = frame.y + Math.min(frame.height * 0.45, 280);
  const scrollBeforeDrag = await page.evaluate(() => window.scrollY);
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(frame.x + 24, startY, { steps: 10 });
  await page.mouse.up();
  await expect(thumbnails.nth(1)).toHaveAttribute("aria-pressed", "true");
  await expect(activeSlide).toHaveAttribute("data-pdp-gallery-state", "2");
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollBeforeDrag);

  await thumbnails.nth(1).focus();
  await page.keyboard.press("Home");
  await expect(thumbnails.first()).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(thumbnails.first()).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("End");
  await expect(thumbnails.last()).toBeFocused();
  await expect(thumbnails.last()).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("ArrowRight");
  await expect(thumbnails.last()).toHaveAttribute("aria-pressed", "true");
  await expect(activeSlide).toHaveAttribute("data-pdp-gallery-state", String(media.length));

  for (const viewport of [
    { width: 820, height: 1024 },
    { width: 821, height: 1024 },
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(thumbnails.last()).toHaveAttribute("aria-pressed", "true");
    await expect(activeSlide).toHaveAttribute("data-pdp-gallery-state", String(media.length));
    await expect(thumbnails.last()).toBeFocused();
    await expectNoMainOverflow(page, viewport.width);
  }
});

test("pilot sticky action yields to shared Search and Cart and returns when those dialogs close", async ({
  page,
  storefront,
}) => {
  await installCartFixture(page, storefront.snapshot.products);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(pilotProduct(storefront).path);
  const mainAction = page.locator("[data-pdp-buy-button]");
  await scrollEdgeTo(page, mainAction, "bottom", -80);
  await expectStickyVisible(page, true);

  for (const name of ["Search", "Cart"] as const) {
    const trigger = name === "Search"
      ? page.getByRole("button", { name: "SEARCH", exact: true })
      : page.getByRole("button", { name: /^CART \(/ });
    // Focusing a header control also exercises the shared shell's keyboard reveal.
    await trigger.focus();
    await trigger.press("Enter");
    const dialog = page.getByRole("dialog", { name, exact: true });
    await expect(dialog).toBeVisible();
    await expectStickyVisible(page, false);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expectStickyVisible(page, true);
  }
});

for (const viewport of [
  { width: 821, height: 1024 },
  { width: 1440, height: 1000 },
]) {
  test(`pilot preserves the desktop primary layout and video sticky boundary at ${viewport.width}px`, async ({
    page,
    storefront,
  }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(pilotProduct(storefront).path);
    const gallery = await box(page.locator(".pdp__gallery"));
    const purchase = await box(page.locator(".pdp__purchase"));
    const frame = await box(page.locator(".pdp__media-viewport"));
    expect(purchase.x).toBeGreaterThanOrEqual(gallery.x + gallery.width);
    expect(Math.abs(purchase.y - gallery.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(frame.height - gallery.height)).toBeLessThanOrEqual(1);
    expect(Math.abs(purchase.height - gallery.height)).toBeLessThanOrEqual(1);
    expect(gallery.y + gallery.height).toBeLessThanOrEqual(viewport.height);
    await expectNoMainOverflow(page, viewport.width);

    const video = page.locator("[data-pdp-video-start]");
    await scrollEdgeTo(page, video, "top", 8);
    await expectStickyVisible(page, false);
    await scrollEdgeTo(page, video, "top", -8);
    await expectStickyVisible(page, true);
    await expect(page.locator(".pdp-sticky-purchase__identity")).toBeVisible();
    await page.locator("#site-footer").scrollIntoViewIfNeeded();
    await expectStickyVisible(page, false);
  });
}

for (const group of ["core", "beyondCore"] as const) {
  test(`a non-pilot ${group} PDP retains its stacked gallery and video sticky boundary on a phone`, async ({
    page,
    storefront,
  }) => {
    const product = storefront.products(group).find(
      (candidate) => getPdpPresentation(candidate.slug) === "default",
    );
    if (!product) throw new Error(`No non-pilot ${group} Product is available in the governed Storefront snapshot.`);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(product.path);
    await expect(page.locator(".storefront-shell[data-pdp-presentation]")).toHaveAttribute(
      "data-pdp-presentation",
      "default",
    );
    const gallery = await box(page.locator(".pdp__gallery"));
    const purchase = await box(page.locator(".pdp__purchase"));
    const frame = await box(page.locator(".pdp__media-viewport"));
    expect(frame.width / frame.height).toBeCloseTo(4 / 5, 2);
    expect(Math.abs(purchase.y - gallery.y - gallery.height)).toBeLessThanOrEqual(1);
    await expectNoMainOverflow(page, 390);
    const video = page.locator("[data-pdp-video-start]");
    await scrollEdgeTo(page, video, "top", 8);
    await expectStickyVisible(page, false);
    await scrollEdgeTo(page, video, "top", -8);
    await expectStickyVisible(page, true);
    await expect(page.locator(".pdp-sticky-purchase__identity")).toBeVisible();
  });
}
