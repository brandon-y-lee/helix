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
const PDP_PANEL_VIEWPORTS = [390, 768, 820, 821, 1024, 1440, 1920, 2560];

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

async function panelRowGeometry(row: Locator) {
  return row.evaluate((element) => {
    const style = getComputedStyle(element);
    const panels = Array.from(
      element.querySelectorAll<HTMLElement>(":scope > [data-pdp-panel]"),
    ).map((panel) => {
      const rect = panel.getBoundingClientRect();
      const panelStyle = getComputedStyle(panel);

      return {
        height: rect.height,
        left: rect.left,
        overflow: panelStyle.overflow,
        radius: Number.parseFloat(panelStyle.borderTopLeftRadius),
        top: rect.top,
        width: rect.width,
      };
    });
    const rect = element.getBoundingClientRect();

    return {
      columnGap: Number.parseFloat(style.columnGap),
      height: rect.height,
      overflow: style.overflow,
      radius: Number.parseFloat(style.borderTopLeftRadius),
      rowGap: Number.parseFloat(style.rowGap),
      panels,
    };
  });
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

test("Core PDP panel rows keep their responsive geometry and connected exception", async ({
  page,
}) => {
  for (const width of PDP_PANEL_VIEWPORTS) {
    await page.setViewportSize({ width, height: width <= 820 ? 900 : 1080 });
    await page.goto(CORE_PDP_PATH);

    const sequence = page.locator("[data-pdp-panel-sequence]");
    const sequenceGap = await sequence.evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).rowGap),
    );
    const expectedGap = width <= 820 ? 8 : Math.max(16, width * 0.0225);
    const heroGeometry = await page.locator(".pdp").evaluate((element) => {
      const style = getComputedStyle(element);

      return {
        gap: Number.parseFloat(style.columnGap),
        radius: Number.parseFloat(style.borderTopLeftRadius),
      };
    });
    const expectedHeroGap = Math.min(56, Math.max(28, width * 0.04));

    expect(Math.abs(sequenceGap - expectedGap)).toBeLessThanOrEqual(
      GEOMETRY_TOLERANCE,
    );
    expect(Math.abs(heroGeometry.gap - expectedHeroGap)).toBeLessThanOrEqual(
      GEOMETRY_TOLERANCE,
    );
    expect(heroGeometry.radius).toBe(0);
    await expect(page.locator(".pdp")).not.toHaveAttribute(
      "data-pdp-panel-row",
    );

    for (const rowName of [
      "profile",
      "application",
      "ingredients",
      "core-routine",
    ]) {
      const row = page.locator(`[data-pdp-panel-row="${rowName}"]`);
      const geometry = await panelRowGeometry(row);

      expect(geometry.panels).toHaveLength(2);
      expect(
        Math.abs(
          (width <= 820 ? geometry.rowGap : geometry.columnGap) - expectedGap,
        ),
      ).toBeLessThanOrEqual(GEOMETRY_TOLERANCE);

      for (const panel of geometry.panels) {
        expect(Math.abs(panel.radius - 12)).toBeLessThanOrEqual(
          GEOMETRY_TOLERANCE,
        );
      }

      const [first, second] = geometry.panels;
      if (width <= 820) {
        expect(Math.abs(first.left - second.left)).toBeLessThanOrEqual(
          GEOMETRY_TOLERANCE,
        );
        expect(Math.abs(first.width - second.width)).toBeLessThanOrEqual(
          GEOMETRY_TOLERANCE,
        );
        expect(Math.abs(second.top - (first.top + first.height) - 8)).toBeLessThanOrEqual(
          GEOMETRY_TOLERANCE,
        );
        expect(first.height).toBeGreaterThan(100);
        if (rowName === "profile") {
          expect(Math.abs(first.height - second.height)).toBeGreaterThan(10);
        }
      } else {
        expect(Math.abs(first.width - second.width)).toBeLessThanOrEqual(
          GEOMETRY_TOLERANCE,
        );
        expect(Math.abs(first.height - second.height)).toBeLessThanOrEqual(
          GEOMETRY_TOLERANCE,
        );
        expect(
          Math.abs(second.left - (first.left + first.width) - expectedGap),
        ).toBeLessThanOrEqual(GEOMETRY_TOLERANCE);
      }

      const mediaPanel = row.locator(
        ':scope > [data-pdp-panel-kind="media"]',
      );
      await expect(mediaPanel).toHaveCSS("overflow", "hidden");
    }

    const outcome = await panelRowGeometry(
      page.locator('[data-pdp-panel-row="outcome"]'),
    );
    const [outcomeFirst, outcomeSecond] = outcome.panels;

    expect(outcome.panels).toHaveLength(2);
    expect(Math.abs(outcome.radius - 12)).toBeLessThanOrEqual(
      GEOMETRY_TOLERANCE,
    );
    expect(outcome.overflow).toBe("hidden");
    expect(
      Math.abs(
        width <= 820
          ? outcomeSecond.top - (outcomeFirst.top + outcomeFirst.height)
          : outcomeSecond.left - (outcomeFirst.left + outcomeFirst.width),
      ),
    ).toBeLessThanOrEqual(GEOMETRY_TOLERANCE);
    if (width > 820) {
      expect(
        Math.abs(outcomeFirst.height - outcomeSecond.height),
      ).toBeLessThanOrEqual(GEOMETRY_TOLERANCE);
    }

    await expectNoHorizontalPageOverflow(page);
  }
});

test("interactive PDP panels preserve their geometry after state changes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 820, height: 900 });
  await page.goto(CORE_PDP_PATH);

  const application = page.locator('[data-pdp-panel-row="application"]');
  const activeStep = application.locator(
    '.pdp-application__step[data-state="active"]',
  );
  const initialCopy = await activeStep.textContent();
  await application.getByRole("button", {
    name: "Show next application step",
  }).click();
  await expect(activeStep).not.toHaveText(initialCopy ?? "");

  const ingredients = page.locator('[data-pdp-panel-row="ingredients"]');
  await ingredients.getByRole("button", {
    name: "FULL INGREDIENTS LIST",
  }).click();
  await expect(
    ingredients.locator('.pdp-ingredients__full[data-state="active"]'),
  ).toBeVisible();

  const ingredientsGeometry = await panelRowGeometry(ingredients);
  expect(ingredientsGeometry.panels[0].height).toBeGreaterThan(200);
  expect(
    Math.abs(
      ingredientsGeometry.panels[1].top -
        (ingredientsGeometry.panels[0].top +
          ingredientsGeometry.panels[0].height) -
        8,
    ),
  ).toBeLessThanOrEqual(GEOMETRY_TOLERANCE);
  await expectNoHorizontalPageOverflow(page);
});
