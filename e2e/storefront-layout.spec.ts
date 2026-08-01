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

async function measureAuthLayout(page: Page) {
  return page.evaluate(() => {
    const header = document.querySelector(".site-header");
    const shell = document.querySelector(".account-shell");
    const panel = document.querySelector(".account-panel");
    const footer = document.querySelector("[data-site-footer]");

    if (!header || !shell || !panel || !footer) {
      throw new Error("Sign-in layout geometry is unavailable.");
    }

    const headerBox = header.getBoundingClientRect();
    const shellBox = shell.getBoundingClientRect();
    const panelBox = panel.getBoundingClientRect();
    const footerBox = footer.getBoundingClientRect();

    return {
      availableHeight: window.innerHeight - headerBox.height,
      footerTop: footerBox.top,
      headerBottom: headerBox.bottom,
      horizontalOverflow:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
      panelBottom: panelBox.bottom,
      panelTop: panelBox.top,
      shellBottom: shellBox.bottom,
      shellHeight: shellBox.height,
      shellTop: shellBox.top,
      viewportHeight: window.innerHeight,
    };
  });
}

test("sign-in shell fills the viewport before the footer and grows with feedback", async ({
  page,
}) => {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/account/sign-in?next=%2Frewards");

    const layout = await measureAuthLayout(page);
    expect(layout.shellTop).toBeCloseTo(layout.headerBottom, 0);
    expect(layout.shellHeight).toBeGreaterThanOrEqual(
      layout.availableHeight - 1,
    );
    expect(layout.footerTop).toBeGreaterThanOrEqual(
      layout.viewportHeight - 1,
    );
    expect(layout.panelTop).toBeGreaterThanOrEqual(layout.shellTop);
    expect(layout.panelBottom).toBeLessThanOrEqual(layout.shellBottom);
    expect(layout.horizontalOverflow).toBeLessThanOrEqual(1);
    await expect(page.locator('input[name="next"]')).toHaveValue("/rewards");
    await expect(
      page.getByRole("link", { name: "Forgot password" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Create account" }),
    ).toBeVisible();
  }

  await page.setViewportSize({ width: 720, height: 600 });
  await page.goto("/account/sign-in?error=invalid-link");
  await expect(
    page.getByText(
      "This sign-in link is invalid. Request a new one and try again.",
      { exact: true },
    ),
  ).toBeVisible();

  const expandedLayout = await measureAuthLayout(page);
  expect(expandedLayout.shellHeight).toBeGreaterThan(
    expandedLayout.availableHeight,
  );
  expect(expandedLayout.footerTop).toBeGreaterThanOrEqual(
    expandedLayout.viewportHeight,
  );
  expect(expandedLayout.panelBottom).toBeLessThanOrEqual(
    expandedLayout.shellBottom,
  );
  expect(expandedLayout.horizontalOverflow).toBeLessThanOrEqual(1);
});

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

test("Core PDP preserves routine controls and uses the storefront gutter after video", async ({
  page,
}) => {
  async function measureCoreBoundary() {
    return page.evaluate(() => {
      const pdp = document.querySelector("[data-pdp-primary-section]");
      const video = document.querySelector('[data-pdp-panel-row="routine-video"]');
      const profile = document.querySelector('[data-pdp-panel-row="profile"]');
      const steps = document.querySelector(".pdp-core-routine__steps");
      const connector = document.querySelector(
        ".pdp-core-routine__connector",
      );
      const selector = document.querySelector(
        '.pdp-core-routine__steps [role="radio"] > span',
      );
      if (!pdp || !video || !profile || !steps || !connector || !selector) {
        throw new Error("Core PDP spacing targets are unavailable.");
      }

      return {
        annotationBorder: getComputedStyle(connector).borderTopWidth,
        gap:
          profile.getBoundingClientRect().top -
          video.getBoundingClientRect().bottom,
        gutter: pdp.getBoundingClientRect().left,
        selectorBorder: getComputedStyle(selector).borderTopWidth,
        selectorDivider: getComputedStyle(steps).borderTopWidth,
      };
    });
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(TREAT_PATH);
  const desktop = await measureCoreBoundary();
  expect(Math.abs(desktop.gap - desktop.gutter)).toBeLessThanOrEqual(1);
  expect(desktop.selectorDivider).toBe("0px");
  expect(desktop.annotationBorder).toBe("1px");
  expect(desktop.selectorBorder).toBe("1px");

  const activeSelector = page.locator(
    '.pdp-core-routine__steps [role="radio"][aria-checked="true"]',
  );
  await activeSelector.focus();
  await expect
    .poll(() =>
      activeSelector.locator(":scope > span").evaluate((element) =>
        Number.parseFloat(getComputedStyle(element).outlineWidth),
      ),
    )
    .toBeGreaterThanOrEqual(2);
  await expectNoHorizontalOverflow(page);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  const mobile = await measureCoreBoundary();
  expect(Math.abs(mobile.gap - mobile.gutter)).toBeLessThanOrEqual(1);
  expect(mobile.selectorDivider).toBe("0px");
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
  const inactiveThumb = page.locator("[data-pdp-media-thumbnail]").nth(1);
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
