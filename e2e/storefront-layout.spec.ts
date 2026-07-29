import { expect, test, type Locator, type Page } from "@playwright/test";

const TREAT_PATH = "/products/treat-03-pdrn-5-ampoule";
const CORE_PDP_PATHS = [
  "/products/cleanse-01-calming-gel-cleanser",
  TREAT_PATH,
  "/products/seal-05-green-collagen-cream",
] as const;

async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      ),
    )
    .toBeLessThanOrEqual(1);
}

async function expectGridColumns(grid: Locator, count: number) {
  await expect
    .poll(() =>
      grid.evaluate(
        (element) =>
          getComputedStyle(element).gridTemplateColumns
            .split(" ")
            .filter(Boolean).length,
      ),
    )
    .toBe(count);
}

test("homepage product layout switches between desktop and mobile modes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const coreGrid = page.locator("#core-three .product-grid");
  await expect(coreGrid.locator(".product-card")).toHaveCount(3);
  await expectGridColumns(coreGrid, 3);
  await expectNoHorizontalOverflow(page);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expectGridColumns(coreGrid, 1);
  await expect(
    page.getByRole("region", { name: "Beyond The Core", exact: true }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("shop grid keeps a usable representative desktop and mobile layout", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/products");
  const grid = page.locator(".shop-grid-shell .product-grid");
  await expect(grid.locator(".product-card")).toHaveCount(6);
  await expectGridColumns(grid, 3);
  await expectNoHorizontalOverflow(page);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expectGridColumns(grid, 2);
  await expectNoHorizontalOverflow(page);
});

test("PDP panels split on desktop, stack on mobile, and preserve review dividers", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(TREAT_PATH);
  await expectGridColumns(page.locator(".pdp"), 2);
  await expectGridColumns(
    page.locator('[data-pdp-panel-row="profile"]'),
    2,
  );
  await expect(page.locator("[data-review-row]")).toHaveCount(2);
  await expect(page.locator("[data-review-row]").first()).toHaveAttribute(
    "data-review-divider",
    "true",
  );
  await expect(page.locator("[data-review-row]").last()).toHaveAttribute(
    "data-review-divider",
    "false",
  );
  await expectNoHorizontalOverflow(page);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expectGridColumns(page.locator(".pdp"), 1);
  await expectGridColumns(
    page.locator('[data-pdp-panel-row="profile"]'),
    1,
  );
  const mobileFrame = page.locator("[data-pdp-main-media]");
  const mobileRail = page.locator("[data-pdp-media-rail]");
  await expect
    .poll(() =>
      mobileRail.evaluate((element) => getComputedStyle(element).flexDirection),
    )
    .toBe("row");
  const [mobileFrameBox, mobileRailBox] = await Promise.all([
    mobileFrame.boundingBox(),
    mobileRail.boundingBox(),
  ]);
  if (!mobileFrameBox || !mobileRailBox) {
    throw new Error("Mobile PDP media geometry is unavailable.");
  }
  expect(mobileRailBox.x).toBeGreaterThanOrEqual(mobileFrameBox.x);
  expect(mobileRailBox.y).toBeGreaterThanOrEqual(mobileFrameBox.y);
  expect(mobileRailBox.x + mobileRailBox.width).toBeLessThanOrEqual(
    mobileFrameBox.x + mobileFrameBox.width,
  );
  expect(mobileRailBox.y + mobileRailBox.height).toBeLessThanOrEqual(
    mobileFrameBox.y + mobileFrameBox.height,
  );
  await expectNoHorizontalOverflow(page);
});

test("PDP panel breakpoint changes once at the 820px boundary", async ({
  page,
}) => {
  await page.setViewportSize({ width: 820, height: 900 });
  await page.goto(TREAT_PATH);
  const profile = page.locator('[data-pdp-panel-row="profile"]');
  await expectGridColumns(profile, 1);

  await page.setViewportSize({ width: 821, height: 900 });
  await expectGridColumns(profile, 2);
  await expectNoHorizontalOverflow(page);
});

test("PDP description grows with the purchase column on wide screens", async ({
  page,
}) => {
  async function measureDescription() {
    return page.evaluate(() => {
      const purchase = document.querySelector(".pdp__purchase");
      const description = document.querySelector(".pdp__description");
      if (!purchase || !description) {
        throw new Error("PDP purchase content is unavailable.");
      }

      return {
        descriptionWidth: description.getBoundingClientRect().width,
        maxWidth: getComputedStyle(description).maxWidth,
        overflows: description.scrollWidth > description.clientWidth,
        purchaseWidth: purchase.getBoundingClientRect().width,
      };
    });
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(TREAT_PATH);
  const desktop = await measureDescription();
  expect(desktop.maxWidth).toBe("none");
  expect(desktop.descriptionWidth).toBeLessThanOrEqual(desktop.purchaseWidth);
  expect(desktop.overflows).toBe(false);

  await page.setViewportSize({ width: 1920, height: 1080 });
  const wide = await measureDescription();
  expect(wide.descriptionWidth).toBeGreaterThan(desktop.descriptionWidth);
  expect(wide.descriptionWidth).toBeLessThanOrEqual(wide.purchaseWidth);
  expect(wide.overflows).toBe(false);

  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalOverflow(page);
});

test("Core PDP hero media is finite, borderless, and aligned to storefront spacing", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1512, height: 982 });

  for (const path of CORE_PDP_PATHS) {
    await page.goto(path);
    await expect(page.locator(".pdp__thumb")).toHaveCount(3);
    await expectNoHorizontalOverflow(page);
  }

  await page.goto(TREAT_PATH);
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1512, height: 982 },
  ]) {
    await page.setViewportSize(viewport);
    const geometry = await page.evaluate(() => {
      const header = document
        .querySelector(".site-header")
        ?.getBoundingClientRect();
      const pdpElement = document.querySelector(
        "[data-pdp-primary-section]",
      );
      const pdp = pdpElement?.getBoundingClientRect();
      const media = document
        .querySelector("[data-pdp-main-media]")
        ?.getBoundingClientRect();
      const purchase = document
        .querySelector(".pdp__purchase")
        ?.getBoundingClientRect();
      const video = document
        .querySelector(".pdp-routine-video")
        ?.getBoundingClientRect();
      const sections = document
        .querySelector(".pdp-sections")
        ?.getBoundingClientRect();
      const reviews = document
        .querySelector("[data-review-section]")
        ?.getBoundingClientRect();
      const discovery = document
        .querySelector('[data-product-collection="discovery"]')
        ?.getBoundingClientRect();
      const footer = document
        .querySelector("[data-site-footer]")
        ?.getBoundingClientRect();

      if (
        !header ||
        !pdp ||
        !media ||
        !purchase ||
        !video ||
        !sections ||
        !reviews ||
        !discovery ||
        !footer
      ) {
        throw new Error("PDP geometry targets are unavailable.");
      }

      const gutter = pdp.left;
      return {
        gutter,
        headerToMedia: media.top - header.bottom,
        mediaBottom: media.bottom,
        expectedSectionBottom: window.innerHeight - gutter,
        mediaHeight: media.height,
        purchaseHeight: purchase.height,
        videoTop: video.top,
        reviewTopGap: reviews.top - sections.bottom,
        reviewBottomGap: discovery.top - reviews.bottom,
        discoveryFooterGap: footer.top - discovery.bottom,
        viewportHeight: window.innerHeight,
        hasInternalOverflow:
          (pdpElement?.scrollHeight ?? 0) >
            (pdpElement?.clientHeight ?? 0) + 1 ||
          media.height > pdp.height + 1,
      };
    });

    expect(
      Math.abs(geometry.headerToMedia - geometry.gutter),
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(geometry.mediaBottom - geometry.expectedSectionBottom),
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(geometry.mediaHeight - geometry.purchaseHeight),
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(geometry.videoTop - geometry.viewportHeight),
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(geometry.reviewTopGap - geometry.gutter),
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(geometry.reviewBottomGap - geometry.gutter),
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(geometry.discoveryFooterGap - geometry.gutter),
    ).toBeLessThanOrEqual(1);
    expect(geometry.hasInternalOverflow).toBe(false);
    await expectNoHorizontalOverflow(page);
  }

  const media = page.locator(".pdp__media");
  const mediaFrame = page.locator("[data-pdp-main-media]");
  const mediaRail = page.locator("[data-pdp-media-rail]");
  const activeThumb = page.locator('.pdp__thumb[aria-pressed="true"]');
  const inactiveThumb = page.locator('.pdp__thumb[aria-pressed="false"]').first();
  const thumbImage = activeThumb.locator(".pdp__thumb-image");

  for (const target of [media, activeThumb, thumbImage]) {
    await expect
      .poll(() =>
        target.evaluate((element) => {
          const style = getComputedStyle(element);
          return [
            style.borderTopWidth,
            style.borderRightWidth,
            style.borderBottomWidth,
            style.borderLeftWidth,
          ];
        }),
      )
      .toEqual(["0px", "0px", "0px", "0px"]);
  }

  await expect
    .poll(() =>
      mediaRail.evaluate((element) => getComputedStyle(element).flexDirection),
    )
    .toBe("column");
  const [frameBox, railBox] = await Promise.all([
    mediaFrame.boundingBox(),
    mediaRail.boundingBox(),
  ]);
  if (!frameBox || !railBox) {
    throw new Error("Desktop PDP media geometry is unavailable.");
  }
  expect(railBox.x).toBeGreaterThanOrEqual(frameBox.x);
  expect(railBox.y).toBeGreaterThanOrEqual(frameBox.y);
  expect(railBox.x + railBox.width).toBeLessThanOrEqual(
    frameBox.x + frameBox.width,
  );
  expect(railBox.y + railBox.height).toBeLessThanOrEqual(
    frameBox.y + frameBox.height,
  );

  const inactiveOpacity = Number(
    await inactiveThumb.evaluate((element) => getComputedStyle(element).opacity),
  );
  expect(inactiveOpacity).toBe(0.5);
  await inactiveThumb.hover();
  await expect
    .poll(() =>
      inactiveThumb.evaluate((element) =>
        Number(getComputedStyle(element).opacity),
      ),
    )
    .toBe(1);
  await expect(inactiveThumb).toHaveAttribute("aria-pressed", "true");
  await page.mouse.move(1000, 80);
  await expect(inactiveThumb).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".pdp__media")).toHaveAttribute(
    "data-media-kind",
    "placeholder",
  );

  const firstThumb = page.locator("[data-pdp-media-thumbnail]").first();
  await firstThumb.focus();
  await firstThumb.press("Enter");
  await expect(firstThumb).toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(() =>
      firstThumb.evaluate((element) =>
        Number.parseFloat(getComputedStyle(element).outlineWidth),
      ),
    )
    .toBeGreaterThanOrEqual(2);
});
