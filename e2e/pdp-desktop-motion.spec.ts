import type { Locator, Page } from "@playwright/test";
import type { StorefrontJourneys } from "@/test-support/storefront-journeys";
import { expect, test } from "./storefront-fixture";

const photographs = [
  [".pdp-profile-split__media", ".pdp-profile-split__media-content img"],
  [".pdp-application__visual", '.pdp-application__visual-state[data-state="active"] img'],
  [".pdp-core-routine__visual", '.pdp-core-routine__visual-state[data-state="active"] img'],
] as const;

function treatPath(storefront: StorefrontJourneys) {
  const product = storefront.snapshot.products.find(({ slug }) => slug === "super-serum");
  if (!product) throw new Error("The governed snapshot is missing Super Serum.");
  return product.path;
}

async function geometry(frame: Locator) {
  return frame.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { top: rect.top + scrollY, height: rect.height, width: rect.width };
  });
}

async function scale(frame: Locator, photo: Locator) {
  const imageBox = await photo.boundingBox();
  const frameBox = await frame.boundingBox();
  if (!imageBox || !frameBox) throw new Error("The editorial photograph must be measurable.");
  return imageBox.width / frameBox.width;
}

async function centerFrame(page: Page, frame: Locator) {
  const box = await geometry(frame);
  const height = page.viewportSize()!.height;
  await page.evaluate((y) => window.scrollTo(0, y), box.top + (box.height - height) / 2);
  await expect.poll(() => frame.evaluate((element) => {
    const row = element.closest("[data-pdp-panel-row]");
    return row ? getComputedStyle(row).transform : "none";
  })).toBe("none");
  return box;
}

test("Treat photographs follow the reference curve and reverse within fixed frames", async ({ page, storefront }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(treatPath(storefront));

  for (const [frameSelector, photoSelector] of photographs) {
    const frame = page.locator(frameSelector);
    const photo = page.locator(photoSelector);
    const original = await geometry(frame);
    // Midway through the symmetric viewport travel, Rhode's measured
    // quadratic curve has settled to 1.05, rather than a linear 1.10.
    await centerFrame(page, frame);
    await expect.poll(() => scale(frame, photo)).toBeCloseTo(1.05, 3);

    await page.evaluate((y) => window.scrollTo(0, y), original.top + original.height * 1.1);
    await expect.poll(() => scale(frame, photo)).toBeCloseTo(1, 3);
    await centerFrame(page, frame);
    await expect.poll(() => scale(frame, photo)).toBeCloseTo(1.05, 3);

    const after = await geometry(frame);
    expect(after.width).toBeCloseTo(original.width, 2);
    expect(after.height).toBeCloseTo(original.height, 2);
    expect(after.top).toBeCloseTo(original.top, 1);
  }
});

test("Treat slide selection inherits the photographic crop while navigation and diagrams stay still", async ({ page, storefront }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(treatPath(storefront));
  const application = page.locator(".pdp-application");
  const frame = page.locator(".pdp-application__visual");
  await centerFrame(page, frame);
  const activeImage = page.locator('.pdp-application__visual-state[data-state="active"] img');
  await expect.poll(() => scale(frame, activeImage)).toBeCloseTo(1.05, 3);
  const thumbnailTransforms = await application.locator(".pdp-application__swatch img").evaluateAll(
    (images) => images.map((image) => getComputedStyle(image).transform),
  );
  const next = application.locator(".pdp-application__next");
  await next.click();
  await expect(application).toHaveAttribute("data-pdp-slide-transitioning", "false");
  await expect.poll(() => scale(frame, activeImage)).toBeCloseTo(1.05, 3);
  expect(await application.locator(".pdp-application__swatch img").evaluateAll(
    (images) => images.map((image) => getComputedStyle(image).transform),
  )).toEqual(thumbnailTransforms);

  const routine = page.locator(".pdp-core-routine");
  const routineFrame = routine.locator(".pdp-core-routine__visual");
  await centerFrame(page, routineFrame);
  const radios = routine.getByRole("radio");
  await radios.first().focus();
  await page.keyboard.press("ArrowRight");
  await expect(routine).toHaveAttribute("data-pdp-slide-transitioning", "false");
  await expect.poll(() => scale(routineFrame, routine.locator('.pdp-core-routine__visual-state[data-state="active"] img'))).toBeCloseTo(1.05, 3);
  for (const texture of await routine.locator(".pdp-core-routine__texture-media").all()) {
    await expect(texture).toHaveCSS("transform", "none");
  }
  for (const image of await page.locator(".pdp-outcome-split__media, .pdp-ingredients__media img").all()) {
    await expect(image).toHaveCSS("transform", "none");
  }
});

test("Treat disables new zoom across reduced-motion and mobile changes", async ({ page, storefront }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(treatPath(storefront));
  const frame = page.locator(".pdp-profile-split__media");
  const photo = frame.locator("img");
  await centerFrame(page, frame);
  await expect.poll(() => scale(frame, photo)).toBeCloseTo(1, 3);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect.poll(() => scale(frame, photo)).toBeCloseTo(1.05, 3);
  await page.setViewportSize({ width: 820, height: 1000 });
  await centerFrame(page, frame);
  await expect.poll(() => scale(frame, photo)).toBeCloseTo(1, 3);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await centerFrame(page, frame);
  await expect.poll(() => scale(frame, photo)).toBeCloseTo(1.05, 3);
});

test("another core PDP keeps its existing static editorial photography", async ({ page, storefront }) => {
  const product = storefront.snapshot.products.find((candidate) =>
    candidate.slug !== "super-serum" && candidate.routineGroup === "core",
  );
  if (!product) throw new Error("A second core PDP is required to verify motion scope.");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(product.path);
  for (const [frameSelector, photoSelector] of photographs) {
    const frame = page.locator(frameSelector);
    await centerFrame(page, frame);
    await expect.poll(() => scale(frame, page.locator(photoSelector))).toBeCloseTo(1, 3);
  }
});

async function scrollPage(page: Page, y: number) {
  await page.evaluate(async (top) => {
    window.scrollTo(0, top);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }, y);
}

const enteringRows = ["profile", "outcome", "application", "ingredients", "core-routine"];

async function startEntrance(page: Page, row: Locator) {
  const box = await geometry(row);
  await scrollPage(page, box.top - page.viewportSize()!.height + 80);
  await expect(row).not.toHaveCSS("transform", "none");
  return box;
}

test("Treat rows enter once as complete opaque rows and leave zoom tied to scroll", async ({ page, storefront }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(treatPath(storefront));

  for (const name of enteringRows) {
    const row = page.locator(`[data-pdp-panel-row="${name}"]`);
    const resting = await startEntrance(page, row);
    await expect(row).toHaveCSS("opacity", "1");
    // Sample the browser's rendered entrance at known times. The complete row
    // should move by its own height; its media and copy do not animate separately.
    await row.evaluate((element) => {
      for (const animation of element.getAnimations()) {
        animation.pause();
        animation.currentTime = 250;
      }
    });
    const quarter = await row.boundingBox();
    expect(quarter!.y + await page.evaluate(() => scrollY) - resting.top).toBeCloseTo(resting.height * 0.028125, 1);
    for (const panel of await row.locator(":scope > [data-pdp-panel]").all()) {
      await expect(panel).toHaveCSS("transform", "none");
    }
    const photos = row.locator("[data-pdp-zoom-media]");
    // Zoom following settles while scroll is stopped, independently of the
    // entrance's remaining travel.
    await page.waitForTimeout(150);
    const settledZoom = await photos.evaluateAll((elements) => elements.map((element) => getComputedStyle(element).transform));
    await row.evaluate((element) => {
      for (const animation of element.getAnimations()) animation.currentTime = 750;
    });
    const threeQuarter = await row.boundingBox();
    expect(threeQuarter!.y + await page.evaluate(() => scrollY) - resting.top).toBeCloseTo(resting.height * 0.003125, 1);
    expect(await photos.evaluateAll((elements) => elements.map((element) => getComputedStyle(element).transform))).toEqual(settledZoom);
    await row.evaluate((element) => {
      for (const animation of element.getAnimations()) animation.play();
    });
    await expect(row).toHaveCSS("transform", "none");
    await scrollPage(page, 0);
    await scrollPage(page, resting.top - page.viewportSize()!.height + 80);
    await expect(row).toHaveCSS("transform", "none");
  }
});

test("Treat cancels row entrances on motion suppression and does not replay them", async ({ page, storefront }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(treatPath(storefront));
  const row = page.locator('[data-pdp-panel-row="profile"]');
  const box = await startEntrance(page, row);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(row).toHaveCSS("transform", "none");
  await expect(row).toHaveCSS("opacity", "1");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await scrollPage(page, 0);
  await scrollPage(page, box.top - 900);
  await expect(row).toHaveCSS("transform", "none");

  const application = page.locator('[data-pdp-panel-row="application"]');
  await startEntrance(page, application);
  await page.setViewportSize({ width: 820, height: 1000 });
  await expect(application).toHaveCSS("transform", "none");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await centerFrame(page, application);
  await expect(application).toHaveCSS("transform", "none");
});

test("Treat restored-scroll rows stay at rest and keyboard selectors remain usable", async ({ page, storefront }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(treatPath(storefront));
  const routine = page.locator('[data-pdp-panel-row="core-routine"]');
  await startEntrance(page, routine);
  const radios = routine.getByRole("radio");
  await radios.first().focus();
  await page.keyboard.press("ArrowRight");
  await expect(radios.nth(1)).toBeChecked();
  await expect(radios.nth(1)).toBeFocused();
  await expect(routine).toHaveCSS("transform", "none");
  await centerFrame(page, routine);
  await page.reload();
  await expect(routine).toBeInViewport();
  for (const name of enteringRows) {
    await expect(page.locator(`[data-pdp-panel-row="${name}"]`)).toHaveCSS("transform", "none");
  }
});
