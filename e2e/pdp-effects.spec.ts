import type { Locator, Page } from "@playwright/test";
import { SERUM_EFFECTS_PRODUCT_ID } from "@/lib/content/serum-effects";
import type { StorefrontJourneys } from "@/test-support/storefront-journeys";
import { expect, test } from "./storefront-fixture";

const effectNames = [
  "Hydration",
  "Barrier protection",
  "Brightening & clarity",
  "Anti-aging & firmness",
];

function productPath(storefront: StorefrontJourneys) {
  const product = storefront.snapshot.products.find(
    (candidate) => candidate.id === SERUM_EFFECTS_PRODUCT_ID,
  );
  if (!product) throw new Error("The canonical Storefront snapshot is missing the serum effects Product.");
  return product.path;
}

async function settleFocusLayout(page: Page) {
  await page.evaluate(() => new Promise<void>((resolve) => {
    // Include resize delivery and the focus helper's two-frame measurement.
    requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  }));
}

async function expectFocusedVisible(control: Locator) {
  await expect(control).toBeFocused();
  await expect.poll(() => control.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const sticky = document.querySelector('.pdp-sticky-purchase[data-visible="true"]');
    const bottom = sticky?.getBoundingClientRect().top ?? window.innerHeight;
    const rail = element.closest('[aria-label="Explore product effects"]');
    const railBox = rail?.getBoundingClientRect();
    return rect.top >= 64 && rect.bottom <= bottom &&
      rect.left >= Math.max(0, railBox?.left ?? 0) - 1 &&
      rect.right <= Math.min(window.innerWidth, railBox?.right ?? window.innerWidth) + 1;
  })).toBe(true);
}

async function expectExpandedAligned(section: Locator, name: string) {
  const button = section.getByRole("button", { name, exact: true });
  const image = section.getByRole("img", { name: `${name} model image placeholder` });
  await expect(button).toHaveAttribute("aria-expanded", "true");
  await expect(image).toBeVisible();
  // The incoming image finishes after the capsule layout transition. Checking
  // final geometry catches WebKit clamping that occurs during that transition.
  await expect(section.locator('[data-selected="true"]')).toHaveCSS("opacity", "1");
  await expect.poll(async () => {
    const buttonBox = await button.boundingBox();
    const viewport = await button.evaluate(() => document.documentElement.clientWidth);
    return buttonBox && Math.abs(buttonBox.x - 40) <= 1 &&
      Math.abs(buttonBox.x + buttonBox.width - (viewport - 40)) <= 1;
  }).toBe(true);
  await expect.poll(() => button.evaluate((element) => {
    const description = document.getElementById(element.getAttribute("aria-describedby") ?? "");
    if (!description) return false;
    const content = description.getBoundingClientRect();
    const bounds = element.getBoundingClientRect();
    return content.left >= bounds.left && content.right <= bounds.right &&
      content.top >= bounds.top && content.bottom <= bounds.bottom;
  })).toBe(true);
}

async function propertyGeometry(card: Locator) {
  return card.evaluate((element) => {
    const track = element.parentElement;
    if (!track) throw new Error("The property slide has no scroll container.");
    const cardBox = element.getBoundingClientRect();
    const trackBox = track.getBoundingClientRect();
    return {
      aligned: Math.abs(cardBox.left - trackBox.left) <= 1,
      contained:
        cardBox.left >= trackBox.left - 1 &&
        cardBox.right <= trackBox.right + 1 &&
        cardBox.top >= trackBox.top - 1 &&
        cardBox.bottom <= trackBox.bottom + 1,
      inViewport:
        cardBox.left >= -1 && cardBox.right <= window.innerWidth + 1 &&
        cardBox.top >= -1 && cardBox.bottom <= window.innerHeight + 1,
      scrollLeft: track.scrollLeft,
      width: track.clientWidth,
    };
  });
}

async function verticalBounds(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("Expected a rendered effects section element.");
  return { top: box.y, bottom: box.y + box.height };
}

test("serum effects keep the selected property in view on desktop", async ({
  page,
  storefront,
}) => {
  await page.setViewportSize({ width: 1056, height: 787 });
  await page.goto(productPath(storefront));
  const section = page.getByRole("region", {
    name: /Four effects\.\s*One formula\./,
    exact: true,
  });
  await section.scrollIntoViewIfNeeded();

  await test.step("neutral hero has no effect-specific property content", async () => {
    await expect(
      section.getByRole("img", { name: "Serum effects hero image placeholder" }),
    ).toBeVisible();
    await expect(section.getByRole("region", { name: / properties$/ })).toHaveCount(0);
    for (const name of effectNames) {
      await expect(section.getByRole("button", { name, exact: true })).toHaveAttribute(
        "aria-expanded",
        "false",
      );
    }
  });

  await test.step("desktop next property scrolls to the complete second card", async () => {
    await section.getByRole("button", { name: "Hydration", exact: true }).click();
    const carousel = section.getByRole("region", { name: "Hydration properties" });
    await expect(carousel.getByRole("heading", { name: "Water binding" })).toBeVisible();
    await expect(carousel.getByRole("button", { name: "Previous property" })).toBeDisabled();
    await carousel.getByRole("button", { name: "Next property" }).click();

    const secondCard = carousel.getByRole("article", { name: "2 of 2" });
    await expect(secondCard.getByRole("heading", { name: "Stress protection" })).toBeVisible();
    await expect(
      secondCard.getByText("An osmolyte selected to complement hydration and help skin cope with environmental stress."),
    ).toBeVisible();
    // A semantic state change alone cannot catch an incorrectly calculated scroll offset.
    await expect.poll(async () => {
      const geometry = await propertyGeometry(secondCard);
      return geometry.aligned && geometry.contained && geometry.inViewport &&
        Math.abs(geometry.scrollLeft - geometry.width) <= 1;
    }).toBe(true);
    await expect(carousel.getByRole("button", { name: "Next property" })).toBeDisabled();

    await test.step("desktop resize keeps the selected property fully aligned", async () => {
      const beforeResize = await propertyGeometry(secondCard);
      await page.setViewportSize({ width: 1280, height: 787 });
      await expect.poll(async () => {
        const geometry = await propertyGeometry(secondCard);
        return geometry.width > beforeResize.width && geometry.aligned &&
          geometry.contained && geometry.inViewport &&
          Math.abs(geometry.scrollLeft - geometry.width) <= 1;
      }).toBe(true);
      await expect(secondCard.getByRole("heading", { name: "Stress protection" })).toBeVisible();
      await expect(carousel.getByRole("button", { name: "Next property" })).toBeDisabled();
    });

    await section.getByRole("button", { name: "Collapse effect description" }).click();
    await expect(section.getByRole("region", { name: / properties$/ })).toHaveCount(0);
    await expect(section.getByRole("button", { name: "Hydration", exact: true })).toBeFocused();
    await expect(
      section.getByRole("img", { name: "Serum effects hero image placeholder" }),
    ).toBeVisible();
  });
});

test.describe("mobile serum effects", () => {
  test.use({ hasTouch: true });

  for (const width of [320, 390, 430, 800]) {
    test(`capsules align with sections and expanded descriptions expose viewport-edge neighbors at ${width}px`, async ({ page, storefront }) => {
      await page.setViewportSize({ width, height: 1024 });
      await page.goto(productPath(storefront));
      await expect(page.locator('.search-sheet[data-state="closed"]')).toBeAttached();
      await page.evaluate(() => document.fonts.ready);
      const section = page.getByRole("region", { name: /Four effects\.\s*One formula\./, exact: true });
      const rail = section.locator('[aria-label="Explore product effects"]');
      const first = section.getByRole("button", { name: effectNames[0], exact: true });
      const last = section.getByRole("button", { name: effectNames[3], exact: true });
      const hero = section.getByRole("img", { name: "Serum effects hero image placeholder" });
      await section.scrollIntoViewIfNeeded();

      await test.step("collapsed endpoints align while the scroll viewport reaches the section edges", async () => {
        await rail.evaluate((element) => element.scrollTo({ left: 0, behavior: "instant" }));
        await expect.poll(async () => {
          const [button, image] = await Promise.all([first.boundingBox(), hero.boundingBox()]);
          return button && image ? Math.abs(button.x - image.x) : Infinity;
        }).toBeLessThanOrEqual(1);
        await expect.poll(() => rail.evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          return Math.abs(bounds.left) <= 1 &&
            Math.abs(bounds.right - document.documentElement.clientWidth) <= 1;
        })).toBe(true);
        await rail.evaluate((element) => element.scrollTo({ left: parseFloat(getComputedStyle(element).paddingLeft), behavior: "instant" }));
        await expect.poll(async () => {
          const [button, viewport] = await Promise.all([first.boundingBox(), rail.boundingBox()]);
          return button && viewport ? Math.abs(button.x - viewport.x) : Infinity;
        }).toBeLessThanOrEqual(1);
        await rail.evaluate((element) => element.scrollTo({ left: element.scrollWidth, behavior: "instant" }));
        await expect.poll(async () => {
          const [button, image] = await Promise.all([last.boundingBox(), hero.boundingBox()]);
          return button && image ? Math.abs(button.x + button.width - image.x - image.width) : Infinity;
        }).toBeLessThanOrEqual(1);
      });

      // Directly expanding the final capsule is the minimized WebKit failure.
      for (const name of [effectNames[3], ...effectNames.slice(0, 3)]) {
        await test.step(`direct ${name} expansion and closing`, async () => {
          const button = section.getByRole("button", { name, exact: true });
          await button.tap();
          await expectExpandedAligned(section, name);
          const close = section.getByRole("button", { name: "Collapse effect description" });
          await expect(close).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
          const imageBox = await section.locator('[data-effect]').boundingBox();
          const closeBox = await close.boundingBox();
          const sectionBox = await section.boundingBox();
          expect(imageBox!.y).toBeCloseTo(sectionBox!.y, 0);
          expect(closeBox!.y - imageBox!.y).toBeCloseTo(8, 0);
          expect(imageBox!.x + imageBox!.width - closeBox!.x - closeBox!.width).toBeCloseTo(8, 0);
          const previous = section.getByRole("button", { name: "Previous effect", includeHidden: true });
          const next = section.getByRole("button", { name: "Next effect", includeHidden: true });
          if (name === effectNames[0]) await expect(previous).toBeHidden();
          else await expect(previous).toBeVisible();
          if (name === effectNames.at(-1)) await expect(next).toBeHidden();
          else await expect(next).toBeVisible();
          const carousel = section.getByRole("region", { name: `${name} properties` });
          await expect(carousel.getByRole("button", { name: "Previous property" })).toBeVisible();
          await expect(carousel.getByRole("button", { name: "Next property" })).toBeVisible();
          await expect.poll(async () => {
            const imageBox = await verticalBounds(section.getByRole("img", { name: `${name} model image placeholder` }));
            const propertyBox = await verticalBounds(carousel);
            const effectBox = await verticalBounds(button);
            return imageBox.bottom <= propertyBox.top + 1 && propertyBox.bottom <= effectBox.top + 1;
          }).toBe(true);
          if (name === "Hydration") {
            await carousel.getByRole("button", { name: "Next property" }).tap();
            const secondCard = carousel.getByRole("article", { name: "2 of 2" });
            await expect(secondCard.getByRole("heading", { name: "Stress protection" })).toBeVisible();
            await expect.poll(async () => {
              const geometry = await propertyGeometry(secondCard);
              return geometry.aligned && geometry.contained;
            }).toBe(true);
            await expect(carousel.getByRole("button", { name: "Next property" })).toBeDisabled();
          }
          await section.getByRole("button", { name: "Collapse effect description" }).tap();
          await expect(section.getByRole("region", { name: / properties$/ })).toHaveCount(0);
          await expect(button).toHaveAttribute("aria-expanded", "false");
          await expect(section.locator('[data-selected="false"]')).toHaveCSS("opacity", "1");
          await expectFocusedVisible(button);
        });
      }
      if (width === 800) {
        await test.step("crossing the effects breakpoint preserves selection and mobile bounds", async () => {
          await last.tap();
          await expectExpandedAligned(section, effectNames[3]);
          await page.setViewportSize({ width: 801, height: 1024 });
          await expect(last).toHaveAttribute("aria-expanded", "true");
          const image = section.getByRole("img", { name: `${effectNames[3]} model image placeholder` });
          await expect.poll(async () => {
            const [controlBox, imageBox] = await Promise.all([last.boundingBox(), image.boundingBox()]);
            return controlBox && imageBox ? imageBox.x >= controlBox.x + controlBox.width : false;
          }).toBe(true);
          await page.setViewportSize({ width: 800, height: 1024 });
          await expectExpandedAligned(section, effectNames[3]);
        });
      }
      const widths = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        page: document.documentElement.scrollWidth,
      }));
      expect(widths.viewport).toBe(width);
      expect(widths.page).toBeLessThanOrEqual(width + 1);
    });
  }

  test("expanded effects progressively grow and fade during a held swipe", async ({ page, storefront }) => {
    await page.setViewportSize({ width: 390, height: 1024 });
    await page.goto(productPath(storefront));
    const section = page.locator('#effects-prototype');
    await section.getByRole("button", { name: "Hydration", exact: true }).tap();
    await expectExpandedAligned(section, "Hydration");
    const rail = section.locator('[aria-label="Explore product effects"]');
    const incoming = section.getByRole("button", { name: "Barrier protection", exact: true });
    const before = await incoming.boundingBox();
    // Hold a native scroll between snap points to inspect the in-flight state.
    await rail.evaluate((element) => {
      element.style.scrollSnapType = 'none';
      const [first, second] = Array.from(element.children) as HTMLElement[];
      element.scrollLeft = (second.offsetLeft - first.offsetLeft) * .25;
    });
    await expect.poll(async () => {
      const now = await incoming.boundingBox();
      const opacity = await section.locator('[data-selected="true"]').evaluate(element => Number(getComputedStyle(element).opacity));
      return !!now && !!before && now.height > before.height + 5 && opacity > .2 && opacity < .8;
    }).toBe(true);
    await rail.evaluate(element => { element.style.scrollSnapType = ''; });
    await section.getByRole("button", { name: "Next effect" }).tap();
    await expectExpandedAligned(section, "Barrier protection");
    await expect(section.getByRole("button", { name: "Previous effect" })).toBeVisible();
    await expect(section.getByRole("button", { name: "Next effect" })).toBeVisible();
    await section.getByRole("button", { name: "Barrier protection", exact: true }).focus();
    await page.keyboard.press('End');
    await expectExpandedAligned(section, "Anti-aging & firmness");
    await expect(section.getByRole("button", { name: "Next effect", includeHidden: true })).toBeHidden();
  });

  for (const [effectIndex, startingEffect] of effectNames.slice(0, -1).entries()) {
    test(`native swipe from ${startingEffect} hides icons and settles without moving the page`, async ({ page, storefront, browserName }) => {
      test.skip(browserName !== "chromium", "Native touch streams use CDP; shared geometry and keyboard checks also run in WebKit.");
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(productPath(storefront));
      const section = page.locator('#effects-prototype');
      const currentCard = section.getByRole("button", { name: startingEffect, exact: true });
      await currentCard.tap();
      await expectExpandedAligned(section, startingEffect);
      await currentCard.focus();
      await settleFocusLayout(page);
      const rail = section.locator('[aria-label="Explore product effects"]');
      await rail.evaluate(element => window.scrollBy({ top: element.getBoundingClientRect().bottom - 650, behavior: 'instant' }));
      const nextButton = section.getByRole("button", { name: "Next effect", exact: true, includeHidden: true });
      const nextIcon = nextButton.locator('svg');
      await expect(nextIcon).toHaveCSS('opacity', '1');
      const glyph = (await nextIcon.boundingBox())!;
      const frame = (await rail.boundingBox())!;
      expect(390 - glyph.x - glyph.width / 2).toBeCloseTo(12, 0);
      expect(glyph.y + glyph.height / 2).toBeCloseTo(frame.y + frame.height - 4 - 22, 0);
      const y = frame.y + frame.height - 60;
      const pageY = await page.evaluate(() => window.scrollY);
      const touch = await page.context().newCDPSession(page);
      try {
        await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 300, y }] });
        for (let distance = 14; distance <= 210; distance += 14) {
          await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 300 - distance, y }] });
          await page.waitForTimeout(20);
        }
        // A paused finger must not allow the scroll-idle fallback to restore icons or move focus.
        await page.waitForTimeout(250);
        await expect(nextIcon).toHaveCSS('opacity', '0');
        await expect(currentCard).toBeFocused();
        expect((await rail.boundingBox())!.height).toBeCloseTo(frame.height, 0);
        expect(await page.evaluate(() => window.scrollY)).toBe(pageY);
        const release = rail.evaluate(async element => {
          const frames = [];
          const end = performance.now() + 600;
          while (performance.now() < end) {
            const arrows = element.nextElementSibling!;
            frames.push({ x: element.scrollLeft, height: element.clientHeight, y: window.scrollY, top: element.getBoundingClientRect().top,
              moving: arrows.getAttribute('data-moving'), arrowOpacity: getComputedStyle(arrows.querySelector('button:last-child svg')!).opacity });
            await new Promise(requestAnimationFrame);
          }
          return frames;
        });
        await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        const samples = await release;
        expect(new Set(samples.map(sample => sample.x)).size).toBeGreaterThan(3);
        for (let index = 1; index < samples.length; index++) {
          expect(samples[index].x).toBeGreaterThanOrEqual(samples[index - 1].x - 1);
          expect(samples[index].height).toBe(samples[0].height);
          expect(samples[index].y).toBe(pageY);
          expect(samples[index].top).toBeCloseTo(frame.y, 0);
        }
        const settled = samples.find(sample => sample.moving === 'false');
        expect(settled?.arrowOpacity).toBe('1');
        await expectExpandedAligned(section, effectNames[effectIndex + 1]);
        await expect(nextIcon).toHaveCSS('opacity', '1');
        if (effectIndex === effectNames.length - 2) await expect(nextButton).toBeHidden();
        else await expect(nextButton).toBeVisible();
        await expect(section.getByRole('button', { name: effectNames[effectIndex + 1], exact: true })).toBeFocused();
      } finally {
        await touch.detach();
      }
    });
  }

  test("mobile Effects ease between overview and expanded views and honor motion preference changes", async ({ page, storefront }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(productPath(storefront));
    const section = page.locator('#effects-prototype');
    const stage = section.locator(':scope > div');
    const hydration = section.getByRole('button', { name: 'Hydration', exact: true });
    async function halfway() {
      const opacity = await stage.evaluate(element => {
        const transition = element.getAnimations().find(animation => animation instanceof CSSTransition && animation.transitionProperty === 'opacity');
        if (!transition) throw new Error('Expected an opacity transition on the Effects view.');
        transition.pause();
        transition.currentTime = Number(transition.effect!.getComputedTiming().duration) / 2;
        return Number(getComputedStyle(element).opacity);
      });
      expect(opacity).toBeGreaterThan(0);
      expect(opacity).toBeLessThan(1);
    }
    async function finishFade() {
      await stage.evaluate(element => element.getAnimations().forEach(animation => animation.finish()));
    }
    await hydration.click();
    await halfway();
    await expect(hydration).toHaveAttribute('aria-expanded', 'false');
    await finishFade();
    await expect(hydration).toHaveAttribute('aria-expanded', 'true');
    await halfway();
    await finishFade();
    await expect(stage).not.toHaveAttribute('data-disclosure');

    await section.getByRole('button', { name: 'Collapse effect description' }).click();
    await halfway();
    await expect(hydration).toHaveAttribute('aria-expanded', 'true');
    await finishFade();
    await expect(hydration).toHaveAttribute('aria-expanded', 'false');
    await expect(hydration).toBeFocused();
    await expect(section.getByRole('region', { name: / properties$/ })).toHaveCount(0);
    await halfway();
    await finishFade();
    await expect(stage).not.toHaveAttribute('data-disclosure');

    // Reverse before the incoming opacity has painted: no outgoing CSS event is guaranteed.
    const reversed = stage.evaluate(element => new Promise<void>(resolve => {
      const observer = new MutationObserver(() => {
        if (element.getAttribute('data-disclosure') !== 'in') return;
        observer.disconnect();
        element.querySelector<HTMLButtonElement>('[aria-label="Collapse effect description"]')!.click();
        resolve();
      });
      observer.observe(element, { attributes: true, attributeFilter: ['data-disclosure'] });
    }));
    await hydration.click();
    await reversed;
    await expect(stage).not.toHaveAttribute('data-disclosure');
    await expect(stage).toHaveCSS('opacity', '1');
    await expect(hydration).toHaveAttribute('aria-expanded', 'false');
    await expect(hydration).toBeFocused();

    await hydration.click();
    await halfway();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(hydration).toHaveAttribute('aria-expanded', 'true');
    await expect(stage).not.toHaveAttribute('data-disclosure');
    await expect(stage).toHaveCSS('opacity', '1');
    await hydration.focus();
    await page.keyboard.press('Escape');
    await expect(hydration).toHaveAttribute('aria-expanded', 'false');
    await expect(hydration).toBeFocused();
  });

  test("effect focus survives height-only changes without recapturing page scroll", async ({ page, storefront, browserName }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(productPath(storefront));
    await expect(page.locator('.search-sheet[data-state="closed"]')).toBeAttached();
    const section = page.getByRole("region", { name: /Four effects\.\s*One formula\./, exact: true });
    const hydration = section.getByRole("button", { name: "Hydration", exact: true });
    await hydration.tap();
    await expectExpandedAligned(section, "Hydration");
    await section.getByRole("button", { name: "Collapse effect description" }).tap();
    await expect(section.getByRole("region", { name: / properties$/ })).toHaveCount(0);
    await expectFocusedVisible(hydration);
    await settleFocusLayout(page);
    await page.evaluate(() => window.scrollBy({ top: 1300, behavior: "instant" }));
    await settleFocusLayout(page);
    expect((await verticalBounds(hydration)).bottom).toBeLessThan(0);
    const scrolled = await page.evaluate(() => window.scrollY);

    for (const height of [760, 844]) {
      await page.setViewportSize({ width: 390, height });
      await settleFocusLayout(page);
      expect(Math.abs(await page.evaluate(() => window.scrollY) - scrolled)).toBeLessThanOrEqual(2);
      await expect(hydration).toBeFocused();
    }

    await page.setViewportSize({ width: 430, height: 844 });
    await expectFocusedVisible(hydration);
    await page.evaluate(() => window.scrollBy({ top: 1300, behavior: "instant" }));
    await settleFocusLayout(page);
    expect((await verticalBounds(hydration)).bottom).toBeLessThan(0);
    await page.keyboard.press(browserName === "webkit" ? "Alt+Tab" : "Tab");
    const barrier = section.getByRole("button", { name: "Barrier protection", exact: true });
    await expectFocusedVisible(barrier);
    await page.keyboard.press("Enter");
    await expectExpandedAligned(section, "Barrier protection");
    await page.keyboard.press("Escape");
    await expect(barrier).toHaveAttribute("aria-expanded", "false");
    await expectFocusedVisible(barrier);
    await page.keyboard.press("Enter");
    await expectExpandedAligned(section, "Barrier protection");
    // The same capsules remain the navigation seam while another effect is open.
    for (const name of [...effectNames.slice(2), ...effectNames.slice(1, 3).reverse()]) {
      await section.getByRole("button", { name, exact: true }).tap();
      await expectExpandedAligned(section, name);
    }
    // Safari touch activation need not retain keyboard focus on the capsule.
    await section.getByRole("button", { name: "Collapse effect description" }).tap();
    await expect(barrier).toHaveAttribute("aria-expanded", "false");
    await expectFocusedVisible(barrier);
  });
});
