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

async function productCardGeometry(collection: Locator) {
  const cards =
    (await collection.getAttribute("data-product-card")) !== null
      ? collection
      : collection.locator("[data-product-card]");

  return cards.evaluateAll((cards) =>
    cards.map((card) => {
      const surface = card.querySelector<HTMLElement>(
        "[data-product-card-media]",
      );
      const surfaceRect = surface?.getBoundingClientRect();
      const surfaceStyle = surface ? getComputedStyle(surface) : null;
      const layers = Array.from(
        card.querySelectorAll<HTMLElement>(".product-card__image"),
      ).map((layer) => {
        const rect = layer.getBoundingClientRect();
        const style = getComputedStyle(layer);

        return {
          borderWidths: [
            style.borderTopWidth,
            style.borderRightWidth,
            style.borderBottomWidth,
            style.borderLeftWidth,
          ],
          edgeDelta: surfaceRect
            ? Math.max(
                Math.abs(rect.left - surfaceRect.left),
                Math.abs(rect.top - surfaceRect.top),
                Math.abs(rect.right - surfaceRect.right),
                Math.abs(rect.bottom - surfaceRect.bottom),
              )
            : Number.POSITIVE_INFINITY,
        };
      });

      return {
        borderWidths: surfaceStyle
          ? [
              surfaceStyle.borderTopWidth,
              surfaceStyle.borderRightWidth,
              surfaceStyle.borderBottomWidth,
              surfaceStyle.borderLeftWidth,
            ]
          : [],
        outlineStyle: surfaceStyle?.outlineStyle ?? "",
        overflow: surfaceStyle?.overflow ?? "",
        pseudoContent: surface
          ? [
              getComputedStyle(surface, "::before").content,
              getComputedStyle(surface, "::after").content,
            ]
          : [],
        slug: card.getAttribute("data-product-card-slug"),
        layers,
      };
    }),
  );
}

function expectBorderlessCardGeometry(
  cards: Awaited<ReturnType<typeof productCardGeometry>>,
) {
  expect(cards.length).toBeGreaterThan(0);
  for (const card of cards) {
    expect(card.borderWidths).toEqual(["0px", "0px", "0px", "0px"]);
    expect(card.outlineStyle).toBe("none");
    expect(card.overflow).toBe("hidden");
    expect(card.pseudoContent).toEqual(["none", "none"]);
    expect(card.layers.length).toBeGreaterThan(0);
    for (const layer of card.layers) {
      expect(layer.borderWidths).toEqual(["0px", "0px", "0px", "0px"]);
      expect(layer.edgeDelta).toBeLessThanOrEqual(0.5);
    }
  }
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

test("product collections share desktop spacing and borderless card media", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  const core = page.locator('[data-product-collection="core"]');
  const beyond = page.locator('[data-product-collection="beyond"]');
  const coreGap = await core.locator(".product-grid").evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).columnGap),
  );
  const beyondGap = await beyond
    .locator(".home-beyond-carousel__track")
    .evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).columnGap),
    );

  expect(Math.abs(coreGap - beyondGap)).toBeLessThanOrEqual(
    GEOMETRY_TOLERANCE,
  );
  expectBorderlessCardGeometry(await productCardGeometry(core));
  expectBorderlessCardGeometry(await productCardGeometry(beyond));

  const treatCard = core.locator(
    '[data-product-card-slug="treat-03-pdrn-5-ampoule"]',
  );
  await treatCard.locator(".product-card__link").hover();
  expectBorderlessCardGeometry(await productCardGeometry(treatCard));
  await treatCard.locator(".product-card__link").focus();
  await expect(treatCard.locator(".product-card__link")).toHaveCSS(
    "outline-style",
    "solid",
  );
  await expect(treatCard.locator(".product-card__link")).toHaveCSS(
    "outline-width",
    "2px",
  );

  await page.goto("/products");
  const shop = page.locator('[data-product-collection="shop"]');
  expectBorderlessCardGeometry(await productCardGeometry(shop));

  await page.goto("/products/cleanse-01-calming-gel-cleanser");
  const discovery = page.locator('[data-product-collection="discovery"]');
  const discoveryGap = await discovery
    .locator(".home-beyond-carousel__track")
    .evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).columnGap),
    );
  expect(Math.abs(coreGap - discoveryGap)).toBeLessThanOrEqual(
    GEOMETRY_TOLERANCE,
  );
  expectBorderlessCardGeometry(await productCardGeometry(discovery));

  await page.setViewportSize({ width: 1024, height: 768 });
  const discoveryCarousel = discovery.locator(".home-beyond-carousel");
  await discovery.getByRole("button", { name: "Next product" }).click();
  await expect(discoveryCarousel).toHaveAttribute("data-active-index", "1");
  await page.waitForTimeout(280);
  expectBorderlessCardGeometry(await productCardGeometry(discovery));

  const translatedTreat = discovery.locator(
    '[data-product-card-slug="treat-03-pdrn-5-ampoule"]',
  );
  expectBorderlessCardGeometry(await productCardGeometry(translatedTreat));
  await expectNoHorizontalPageOverflow(page);
});

test("mobile product carousels keep their partial-card cue without page overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const beyond = page.locator('[data-product-collection="beyond"]');
  const geometry = await beyond.evaluate((section) => {
    const viewport = section.querySelector<HTMLElement>(
      ".home-beyond-carousel__viewport",
    );
    const cards = Array.from(
      section.querySelectorAll<HTMLElement>(
        ".home-beyond-carousel__card",
      ),
    );
    const viewportRect = viewport?.getBoundingClientRect();
    const cardRects = cards.map((card) => card.getBoundingClientRect());

    return {
      firstFullyVisible:
        Boolean(viewportRect) &&
        cardRects[0].right <= (viewportRect?.right ?? 0) + 1,
      secondIsPartial:
        Boolean(viewportRect) &&
        cardRects[1].left < (viewportRect?.right ?? 0) &&
        cardRects[1].right > (viewportRect?.right ?? 0),
    };
  });

  expect(geometry.firstFullyVisible).toBe(true);
  expect(geometry.secondIsPartial).toBe(true);
  expectBorderlessCardGeometry(await productCardGeometry(beyond));
  await expectNoHorizontalPageOverflow(page);

  await page.goto("/products/cleanse-01-calming-gel-cleanser");
  const discovery = page.locator('[data-product-collection="discovery"]');
  expectBorderlessCardGeometry(await productCardGeometry(discovery));
  await expectNoHorizontalPageOverflow(page);
});

test("PDP reviews use one intentional divider hierarchy and panel-aligned inset", async ({
  page,
}) => {
  await page.goto(CORE_PDP_PATH);

  for (const width of [390, 1440, 1920]) {
    await page.setViewportSize({
      width,
      height: width === 390 ? 844 : 1080,
    });

    const geometry = await page.evaluate(() => {
      const reviews = document.querySelector<HTMLElement>(
        "[data-review-section]",
      );
      const header = reviews?.querySelector<HTMLElement>(
        "[data-review-header]",
      );
      const list = reviews?.querySelector<HTMLElement>("[data-review-list]");
      const rows = Array.from(
        reviews?.querySelectorAll<HTMLElement>("[data-review-row]") ?? [],
      );
      const core = document.querySelector<HTMLElement>(
        '[data-pdp-panel-row="core-routine"]',
      );
      const coreHeading = core?.querySelector<HTMLElement>(
        ".pdp-core-routine__heading",
      );
      const discovery = document.querySelector<HTMLElement>(
        '[data-product-collection="discovery"]',
      );
      const reviewRect = reviews?.getBoundingClientRect();
      const headerRect = header?.getBoundingClientRect();
      const coreRect = core?.getBoundingClientRect();
      const coreHeadingRect = coreHeading?.getBoundingClientRect();
      const reviewStyle = reviews ? getComputedStyle(reviews) : null;
      const discoveryStyle = discovery ? getComputedStyle(discovery) : null;

      return {
        coreInset:
          coreRect && coreHeadingRect
            ? coreHeadingRect.left - coreRect.left
            : -1,
        discoveryBorders: discoveryStyle
          ? [
              discoveryStyle.borderTopWidth,
              discoveryStyle.borderRightWidth,
              discoveryStyle.borderBottomWidth,
              discoveryStyle.borderLeftWidth,
            ]
          : [],
        headerBottom: header ? getComputedStyle(header).borderBottomWidth : "",
        listTop: list ? getComputedStyle(list).borderTopWidth : "",
        reviewBorders: reviewStyle
          ? [
              reviewStyle.borderTopWidth,
              reviewStyle.borderRightWidth,
              reviewStyle.borderBottomWidth,
              reviewStyle.borderLeftWidth,
            ]
          : [],
        reviewInset:
          reviewRect && headerRect ? headerRect.left - reviewRect.left : -1,
        rowBottoms: rows.map(
          (row) => getComputedStyle(row).borderBottomWidth,
        ),
        rowDividerStates: rows.map((row) =>
          row.getAttribute("data-review-divider"),
        ),
      };
    });

    expect(
      Math.abs(geometry.reviewInset - geometry.coreInset),
    ).toBeLessThanOrEqual(GEOMETRY_TOLERANCE);
    expect(geometry.reviewBorders).toEqual(["0px", "0px", "0px", "0px"]);
    expect(geometry.discoveryBorders).toEqual([
      "0px",
      "0px",
      "0px",
      "0px",
    ]);
    expect(geometry.headerBottom).toBe("1px");
    expect(geometry.listTop).toBe("0px");
    expect(geometry.rowBottoms).toEqual(["1px", "0px"]);
    expect(geometry.rowDividerStates).toEqual(["true", "false"]);
    await expectNoHorizontalPageOverflow(page);
  }
});
