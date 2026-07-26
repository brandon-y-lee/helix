import { expect, test, type Locator, type Page } from "@playwright/test";

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 768, height: 900 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
] as const;

const CORE_PDP_PATH = "/products/treat-03-pdrn-5-ampoule";
const GEOMETRY_TOLERANCE = 1.5;

type ShellGeometry = {
  clientWidth: number;
  contentLeft: number;
  contentRight: number;
  paddingLeft: number;
  paddingRight: number;
  shellWidth: number;
};

async function shellGeometry(shell: Locator): Promise<ShellGeometry> {
  return shell.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const paddingLeft = Number.parseFloat(style.paddingLeft);
    const paddingRight = Number.parseFloat(style.paddingRight);

    return {
      clientWidth: document.documentElement.clientWidth,
      contentLeft: rect.left + paddingLeft,
      contentRight: rect.right - paddingRight,
      paddingLeft,
      paddingRight,
      shellWidth: rect.width,
    };
  });
}

async function expectFluidShell(shell: Locator, viewportWidth: number) {
  await expect(shell).toBeAttached();
  const geometry = await shellGeometry(shell);
  const expectedGutter = Math.max(16, viewportWidth * 0.0225);

  expect(Math.abs(geometry.paddingLeft - expectedGutter)).toBeLessThanOrEqual(
    GEOMETRY_TOLERANCE,
  );
  expect(Math.abs(geometry.paddingRight - expectedGutter)).toBeLessThanOrEqual(
    GEOMETRY_TOLERANCE,
  );
  expect(Math.abs(geometry.contentLeft - expectedGutter)).toBeLessThanOrEqual(
    GEOMETRY_TOLERANCE,
  );
  expect(
    Math.abs(geometry.clientWidth - geometry.contentRight - expectedGutter),
  ).toBeLessThanOrEqual(GEOMETRY_TOLERANCE);
  expect(Math.abs(geometry.shellWidth - geometry.clientWidth)).toBeLessThanOrEqual(
    GEOMETRY_TOLERANCE,
  );

  return geometry;
}

async function expectNoHorizontalPageOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
}

async function gridColumnCount(grid: Locator) {
  return grid.evaluate((element) =>
    getComputedStyle(element).gridTemplateColumns.split(" ").filter(Boolean).length,
  );
}

test("home storefront shells stay fluid across supported viewports", async ({
  page,
}) => {
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.goto("/");

    const header = page.locator(".site-header__bar");
    const core = page.locator("#core-three");
    const ingredients = page.locator(".home-split--ingredients");
    const beyond = page.locator(".home-beyond-shell");
    const footer = page.locator(".site-footer__inner");

    await expectFluidShell(header, viewport.width);
    const coreGeometry = await expectFluidShell(core, viewport.width);
    await expectFluidShell(ingredients, viewport.width);
    const beyondGeometry = await expectFluidShell(beyond, viewport.width);
    await expectFluidShell(footer, viewport.width);

    const expectedCoreColumns = viewport.width <= 900 ? 1 : 3;
    expect(await gridColumnCount(core.locator(".home-core-products"))).toBe(
      expectedCoreColumns,
    );

    if (viewport.width >= 1440) {
      const usableWidth =
        coreGeometry.shellWidth -
        coreGeometry.paddingLeft -
        coreGeometry.paddingRight;
      expect(usableWidth).toBeGreaterThan(1312);
    }

    if (viewport.width >= 1920) {
      const usableWidth =
        beyondGeometry.shellWidth -
        beyondGeometry.paddingLeft -
        beyondGeometry.paddingRight;
      expect(usableWidth).toBeGreaterThan(1800);
    }

    await expect(page.locator(".home-beyond-carousel__viewport")).toHaveCSS(
      "overflow-x",
      "hidden",
    );
    await expectNoHorizontalPageOverflow(page);
  }
});

test("shop hero, toolbar, and product grid share the fluid storefront frame", async ({
  page,
}) => {
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.goto("/products");

    const hero = page.locator(".shop-hero");
    const toolbar = page.locator(".shop-toolbar");
    const gridShell = page.locator(".shop-grid-shell");

    await expectFluidShell(page.locator(".site-header__bar"), viewport.width);
    await expectFluidShell(hero, viewport.width);
    await expectFluidShell(toolbar, viewport.width);
    const gridGeometry = await expectFluidShell(gridShell, viewport.width);
    await expectFluidShell(page.locator(".site-footer__inner"), viewport.width);

    const expectedColumns = viewport.width <= 1020 ? 2 : 3;
    expect(await gridColumnCount(gridShell.locator(".product-grid"))).toBe(
      expectedColumns,
    );

    if (viewport.width >= 1440) {
      const usableWidth =
        gridGeometry.shellWidth -
        gridGeometry.paddingLeft -
        gridGeometry.paddingRight;
      expect(usableWidth).toBeGreaterThan(1312);
    }

    await expectNoHorizontalPageOverflow(page);
  }
});

test("Core PDP modules, discovery, and sticky purchase use the fluid frame", async ({
  page,
}) => {
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.goto(CORE_PDP_PATH);

    const pdpShell = page.locator(
      '[data-layout-shell="storefront"]:has(> .pdp)',
    );
    const discovery = page.locator(".pdp-discovery");
    const sticky = page.locator(".pdp-sticky-purchase");

    await expectFluidShell(page.locator(".site-header__bar"), viewport.width);
    const pdpGeometry = await expectFluidShell(pdpShell, viewport.width);
    const discoveryGeometry = await expectFluidShell(discovery, viewport.width);
    await expectFluidShell(page.locator(".site-footer__inner"), viewport.width);

    const stickyGeometry = await sticky.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        clientWidth: document.documentElement.clientWidth,
        left: rect.left,
        right: rect.right,
      };
    });
    const expectedGutter = Math.max(16, viewport.width * 0.0225);
    expect(Math.abs(stickyGeometry.left - expectedGutter)).toBeLessThanOrEqual(
      GEOMETRY_TOLERANCE,
    );
    expect(
      Math.abs(
        stickyGeometry.clientWidth - stickyGeometry.right - expectedGutter,
      ),
    ).toBeLessThanOrEqual(GEOMETRY_TOLERANCE);

    if (viewport.width >= 1440) {
      const usableWidth =
        pdpGeometry.shellWidth -
        pdpGeometry.paddingLeft -
        pdpGeometry.paddingRight;
      expect(usableWidth).toBeGreaterThan(1312);
    }

    if (viewport.width >= 1920) {
      const usableWidth =
        discoveryGeometry.shellWidth -
        discoveryGeometry.paddingLeft -
        discoveryGeometry.paddingRight;
      expect(usableWidth).toBeGreaterThan(1800);
    }

    const reviewProseWidth = await page
      .locator(".review-row__content > p")
      .first()
      .evaluate((element) => element.getBoundingClientRect().width);
    expect(reviewProseWidth).toBeLessThan(1100);

    const expectedPdpColumns = viewport.width <= 860 ? 1 : 2;
    expect(await gridColumnCount(page.locator(".pdp"))).toBe(expectedPdpColumns);
    await expect(page.locator(".pdp-discovery__carousel")).toBeAttached();
    await expectNoHorizontalPageOverflow(page);
  }
});
