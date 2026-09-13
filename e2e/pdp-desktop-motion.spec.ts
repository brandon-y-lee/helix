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
