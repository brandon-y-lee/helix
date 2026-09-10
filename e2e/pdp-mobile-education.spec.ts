import type { Locator, Page } from "@playwright/test";
import { getPdpPresentation } from "@/components/product-detail/pdp-presentation";
import type { StorefrontJourneys } from "@/test-support/storefront-journeys";
import { expectNoMainOverflow } from "./layout-assertions";
import { expect, test } from "./storefront-fixture";

function pilotProduct(storefront: StorefrontJourneys) {
  const product = storefront.snapshot.products.find(
    (candidate) => getPdpPresentation(candidate.slug) === "mobile-pilot",
  );
  if (!product) throw new Error("Super Serum is missing from the governed snapshot.");
  return product;
}

async function box(locator: Locator) {
  const value = await locator.boundingBox();
  if (!value) throw new Error("Expected a measurable education element.");
  return value;
}

async function expectFocusedVisible(page: Page) {
  await expect.poll(() => page.evaluate(() => {
    const element = document.activeElement;
    if (!(element instanceof HTMLElement) || element === document.body) return false;
    const rect = element.getBoundingClientRect();
    const sticky = document.querySelector('.pdp-sticky-purchase[data-visible="true"]');
    const bottom = sticky?.getBoundingClientRect().top ?? window.innerHeight;
    return rect.width > 0 && rect.height > 0 && rect.top >= 64 && rect.bottom <= bottom;
  })).toBe(true);
}

for (const width of [320, 390, 430, 820]) {
  test(`Super Serum education composes joined mobile modules at ${width}px`, async ({ page, storefront }) => {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 1024 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(pilotProduct(storefront).path);
    const video = page.locator(".pdp-routine-video");
    await expect(video.locator("video")).toHaveCount(1);
    const videoBox = await box(video);
    expect(videoBox.width / videoBox.height).toBeCloseTo(9 / 16, 2);

    const profile = page.locator(".pdp-profile-split");
    const profileMedia = await box(profile.locator(".pdp-profile-split__media"));
    const profileCopy = await box(profile.locator(".pdp-profile-split__content"));
    expect(profileMedia.width / profileMedia.height).toBeCloseTo(1, 2);
    expect(Math.abs(profileCopy.y - profileMedia.y - profileMedia.height)).toBeLessThanOrEqual(1);
    const fact = profile.locator(".pdp-profile-split__facts > div").first();
    expect((await box(fact.locator("dd"))).x).toBeGreaterThan((await box(fact.locator("dt"))).x);

    const outcome = page.locator(".pdp-outcome-split");
    const outcomeMedia = await box(outcome.locator(".pdp-outcome-split__viewport"));
    expect(outcomeMedia.width / outcomeMedia.height).toBeCloseTo(1, 2);
    for (const control of await outcome.getByRole("button").all()) {
      expect((await box(control)).height).toBeGreaterThanOrEqual(44);
    }
    if (width === 390) expect((await box(outcome)).height).toBeLessThanOrEqual(844 - 128);

    const application = page.locator(".pdp-application");
    const swatches = application.locator(".pdp-application__swatch");
    const [first, second, third] = await Promise.all([0, 1, 2].map((index) => box(swatches.nth(index))));
    expect(first.width / first.height).toBeCloseTo(1, 2);
    expect(second.width / second.height).toBeCloseTo(1, 2);
    expect(Math.abs(first.y - second.y)).toBeLessThanOrEqual(1);
    expect(second.x - first.x - first.width).toBeCloseTo(12, 0);
    expect(third.y - first.y - first.height).toBeCloseTo(12, 0);
    expect(third.width / third.height).toBeCloseTo(2, 2);
    const copy = await box(application.locator(".pdp-application__copy"));
    expect(copy.width).toBeCloseTo(third.width, 0);
    expect(copy.y).toBeGreaterThan(third.y + third.height);
    await expect(application.locator(".pdp-application__visual")).toBeHidden();
    expect((await box(application.locator(".pdp-application__navigation"))).y).toBeGreaterThanOrEqual(copy.y + copy.height);

    const ingredients = page.locator(".pdp-ingredients");
    const texture = await box(ingredients.locator(".pdp-ingredients__media"));
    const story = await box(ingredients.locator(".pdp-ingredients__content"));
    expect(texture.width / texture.height).toBeCloseTo(4 / 3, 2);
    expect(Math.abs(story.y - texture.y - texture.height)).toBeLessThanOrEqual(1);
    const trigger = ingredients.getByRole("button", { name: "FULL INGREDIENTS LIST", exact: true });
    expect((await box(trigger)).y).toBeGreaterThanOrEqual(story.y + story.height);

    const routine = page.locator(".pdp-core-routine");
    await expect(routine.locator(".pdp-core-routine__visual")).toBeHidden();
    const textureHeight = (await box(routine.locator('.pdp-core-routine__callout-state[data-state="active"] .pdp-core-routine__texture'))).height;
    expect(textureHeight).toBeGreaterThanOrEqual(140);
    expect(textureHeight).toBeLessThanOrEqual(180);
    for (const control of await routine.getByRole("radio").all()) {
      expect((await box(control)).height).toBeGreaterThanOrEqual(44);
      await expect(control.locator(".pdp-core-routine__step-name")).toHaveCSS("font-size", "14px");
    }

    const modules = await page.locator(".pdp-sections > section").all();
    let prior = videoBox;
    for (const module of modules) {
      const current = await box(module);
      expect(current.y - prior.y - prior.height).toBeCloseTo(20, 0);
      prior = current;
    }
    const reviews = page.locator(".pdp-reviews");
    await expect(reviews).toHaveAttribute("data-review-empty", "true");
    await expect(reviews.getByText("Reviews are not available for this product yet.")).toBeVisible();
    await expect(reviews.locator(".pdp-reviews__rating-summary")).toHaveCount(0);
    expect((await box(reviews)).height).toBeLessThanOrEqual(140);
    await expectNoMainOverflow(page, width);
  });
}

test("all mobile education selections remain close, announced, and stable through resize", async ({ page, storefront }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(pilotProduct(storefront).path);
  const outcomes = page.locator(".pdp-outcome-split");
  const outcomeButtons = outcomes.getByRole("button");
  for (let index = 0; index < 3; index++) {
    await outcomeButtons.nth(index).click();
    await expect(outcomeButtons.nth(index)).toHaveAttribute("aria-pressed", "true");
    await expect(outcomes.locator('[data-active="true"]')).toHaveAttribute("data-pdp-outcome-state", String(index + 1));
  }
  await outcomeButtons.last().press("Home");
  await expect(outcomeButtons.first()).toBeFocused();
  await expect(outcomeButtons.first()).toHaveAttribute("aria-pressed", "true");
  await outcomeButtons.first().press("End");
  await expect(outcomeButtons.last()).toBeFocused();

  const application = page.locator(".pdp-application");
  for (let index = 0; index < 3; index++) {
    const swatch = application.getByRole("button", { name: `Show application step ${index + 1} of 3` });
    await swatch.click();
    await expect(swatch).toHaveAttribute("aria-pressed", "true");
    await expect(swatch.getByText("Selected", { exact: true })).toBeVisible();
    await expect(application.locator('.pdp-application__step[aria-hidden="false"]')).toHaveCount(1);
    const instruction = await box(application.locator('.pdp-application__step[data-state="active"] p'));
    const copy = await box(application.locator(".pdp-application__copy"));
    expect(instruction.width).toBeCloseTo(copy.width, 0);
  }
  const previous = application.getByRole("button", { name: "Show previous application step" });
  await previous.focus();
  await previous.press("Enter");
  await expect(previous).toBeFocused();
  await page.setViewportSize({ width: 821, height: 1000 });
  await expect(application.getByRole("button", { name: "Show next application step" })).toBeFocused();
  await expectFocusedVisible(page);
  await expect(application.getByRole("button", { name: "Show application step 2 of 3" })).toHaveAttribute("aria-pressed", "true");
  await page.setViewportSize({ width: 390, height: 844 });

  const routine = page.locator(".pdp-core-routine");
  const selectors = routine.getByRole("radio");
  for (let index = 0; index < 3; index++) {
    await selectors.nth(index).click();
    await expect(selectors.nth(index)).toHaveAttribute("aria-checked", "true");
    await expect(routine.locator('.pdp-core-routine__callout-state[aria-hidden="false"]')).toHaveCount(1);
  }
  await selectors.last().press("Home");
  await expect(selectors.first()).toBeFocused();
  await page.setViewportSize({ width: 821, height: 1000 });
  await expect(selectors.first()).toBeFocused();
  await expect(selectors.first()).toHaveAttribute("aria-checked", "true");
  await expectFocusedVisible(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(selectors.first()).toBeFocused();
  await expectFocusedVisible(page);
  await expectNoMainOverflow(page, 390);
});

test("inline INCI preserves the reader's place and visible focus through disclosure and resize", async ({ page, storefront, browserName }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(pilotProduct(storefront).path);
  const ingredients = page.locator(".pdp-ingredients");
  const trigger = ingredients.getByRole("button", { name: "FULL INGREDIENTS LIST", exact: true });
  await trigger.scrollIntoViewIfNeeded();
  await trigger.focus();
  const before = await page.evaluate(() => window.scrollY);
  await trigger.press("Enter");
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(trigger).toBeFocused();
  expect(Math.abs(await page.evaluate(() => window.scrollY) - before)).toBeLessThanOrEqual(2);
  await expect(ingredients.locator(".pdp-ingredients__story")).toHaveAttribute("aria-hidden", "false");
  const full = ingredients.locator(".pdp-ingredients__full");
  expect((await box(full)).y).toBeGreaterThan((await box(trigger)).y);
  await expect(full.locator(".pdp-ingredients__full-scroll")).toHaveCSS("overflow-y", "visible");
  const search = page.getByRole("button", { name: "SEARCH", exact: true });
  await search.focus();
  await search.click();
  await expect(page.getByRole("dialog", { name: "Search", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(search).toBeFocused();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await trigger.focus();
  await trigger.press(browserName === "webkit" ? "Alt+Tab" : "Tab");
  const close = ingredients.getByRole("button", { name: "Close full ingredients list" });
  await expect(close).toBeFocused();
  await expectFocusedVisible(page);
  for (const width of [821, 820, 920, 921, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(close).toBeFocused();
    await expectFocusedVisible(page);
  }
  await full.getByRole("link", { name: "Contact our team." }).focus();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await expectFocusedVisible(page);
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await trigger.click();
  await close.click();
  await expect(trigger).toBeFocused();
  await expectFocusedVisible(page);
});

test("mobile education motion is short and reduced motion is immediate", async ({ page, storefront }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(pilotProduct(storefront).path);
  const track = page.locator(".pdp-outcome-split__track");
  await expect(track).toHaveCSS("transition-duration", "0.25s");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(track).toHaveCSS("transition-duration", "0s");
  const application = page.locator(".pdp-application");
  await application.getByRole("button", { name: "Show application step 2 of 3" }).click();
  await expect(application).toHaveAttribute("data-pdp-slide-transitioning", "false");
});

test("desktop Super Serum and nonpilot detail bodies retain their media and panel geometry", async ({ page, storefront }) => {
  const pilot = pilotProduct(storefront);
  const nonpilot = storefront.products("core").find((product) => product.slug !== pilot.slug);
  if (!nonpilot) throw new Error("The snapshot requires a nonpilot Core product.");
  for (const product of [pilot, nonpilot]) {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(product.path);
    const profile = page.locator(".pdp-profile-split");
    const copy = await box(profile.locator(".pdp-profile-split__content"));
    const media = await box(profile.locator(".pdp-profile-split__media"));
    expect(copy.x).toBeLessThan(media.x);
    expect(Math.abs(copy.y - media.y)).toBeLessThanOrEqual(1);
    await expect(page.locator(".pdp-routine-video video")).toHaveCount(2);
    await expect(page.locator(".pdp-application__visual")).toBeVisible();
    await expect(page.locator(".pdp-core-routine__visual")).toBeVisible();
    await expect(page.locator(".pdp-outcome-split__track")).toHaveCSS("transition-duration", "1.5s");
    if (product.slug === nonpilot.slug) {
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(page.locator(".pdp-routine-video video")).toHaveCount(2);
      const frame = await box(page.locator(".pdp-routine-video"));
      expect(frame.width / frame.height).toBeCloseTo(4 / 5, 2);
      await expect(page.locator(".pdp-application__visual")).toBeVisible();
    }
  }
  await page.goto(storefront.product("beyondCore").path);
  await expect(page.locator(".pdp-ingredients--mobile-pilot")).toHaveCount(0);
  await expect(page.locator(".pdp-editorial-pair--use")).toBeVisible();
  await expectNoMainOverflow(page, 390);
});
