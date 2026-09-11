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
    const [buttonBox, imageBox] = await Promise.all([button.boundingBox(), image.boundingBox()]);
    if (!buttonBox || !imageBox) return false;
    return Math.abs(buttonBox.x - imageBox.x) <= 1 &&
      Math.abs(buttonBox.x + buttonBox.width - imageBox.x - imageBox.width) <= 1;
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
    test(`capsules and expanded descriptions respect image bounds at ${width}px`, async ({ page, storefront }) => {
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
          const sectionBox = element.closest("section")!.getBoundingClientRect();
          return Math.abs(bounds.left - sectionBox.left) <= 1 &&
            Math.abs(bounds.right - sectionBox.right) <= 1;
        })).toBe(true);
        await rail.evaluate((element) => element.scrollTo({ left: 24, behavior: "instant" }));
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
          await expect(section.getByRole("button", { name: "Previous effect", includeHidden: true })).toBeHidden();
          await expect(section.getByRole("button", { name: "Next effect", includeHidden: true })).toBeHidden();
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
    // The same capsules remain the navigation seam while another effect is open.
    for (const name of [...effectNames.slice(2), ...effectNames.slice(1, 3).reverse()]) {
      await section.getByRole("button", { name, exact: true }).tap();
      await expectExpandedAligned(section, name);
    }
    await page.keyboard.press("Escape");
    await expect(barrier).toHaveAttribute("aria-expanded", "false");
    await expectFocusedVisible(barrier);
  });
});
