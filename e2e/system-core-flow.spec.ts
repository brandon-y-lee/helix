import { expectNoMainOverflow } from "./layout-assertions";
import { expect, test } from "./storefront-fixture";

test("Core flow supports pointer, keyboard, wrapping controls, and deep links", async ({
  browserName,
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/system");

  const core = page.locator("#system-core");
  const tabs = core.getByRole("tab");
  await expect(tabs).toHaveCount(3);
  await expect(tabs.nth(0)).toHaveAttribute("aria-selected", "true");

  await tabs.nth(1).click();
  await expect(core).toHaveAttribute("data-active-step", "treat");
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(core.getByRole("tabpanel")).toContainText(
    await tabs.nth(1).locator("span").innerText(),
  );

  await tabs.nth(1).focus();
  await page.keyboard.press("End");
  await expect(tabs.nth(2)).toBeFocused();
  if (browserName === "chromium") {
    await expect(tabs.nth(2)).toHaveCSS("outline-style", "solid");
  }
  await expect(tabs.nth(2)).toHaveAttribute("aria-selected", "true");

  await core.getByRole("button", { name: "Next Core step" }).click();
  await expect(tabs.nth(0)).toHaveAttribute("aria-selected", "true");

  await page.goto("/system#system-treat");
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");

  await page.goto("/system#step-recode");
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
  await tabs.nth(2).click();
  await expect(page).toHaveURL(/\/system#step-recode$/);
  await expect(tabs.nth(2)).toHaveAttribute("aria-selected", "true");
});

for (const viewport of [
  { width: 1440, height: 1000, splitMode: "paired" },
  { width: 1024, height: 900, splitMode: "paired" },
  { width: 390, height: 844, splitMode: "stacked" },
] as const) {
  test(`Core and split remain responsive at ${viewport.width}×${viewport.height}`, async ({
    browserName,
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/system#system-core");

    const core = page.locator("#system-core");
    const tabs = core.getByRole("tab");
    const initialBackground = core.locator(
      '.method-flow__background[data-state="active"]',
    );
    const initialHue = await initialBackground.evaluate(
      (element) => getComputedStyle(element).backgroundImage,
    );

    await tabs.nth(1).click();
    await expect(core).toHaveAttribute("data-active-step", "treat");
    await expect(core.getByRole("tabpanel")).toContainText(
      await tabs.nth(1).locator("span").innerText(),
    );
    await expect(
      core.locator('.method-flow__background[data-state="active"]'),
    ).not.toHaveCSS("background-image", initialHue);

    await tabs.nth(1).focus();
    await page.keyboard.press("Home");
    await expect(tabs.nth(0)).toBeFocused();
    if (browserName === "chromium") {
      await expect(tabs.nth(0)).toHaveCSS("outline-style", "solid");
    }

    const coreGeometry = await core.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const sectionLabel = element.querySelector("h2");
      const phrase = element.querySelector(".method-flow__hero-phrase");
      const panel = element.querySelector('[role="tabpanel"]');
      const tablist = element.querySelector('[role="tablist"]');
      const productLink = panel?.querySelector(".method-flow__product-link");
      const nextControl = element.querySelector<HTMLElement>(
        '[aria-label="Next Core step"]',
      );
      const activeStep = tablist?.querySelector<HTMLElement>(
        '[role="tab"][aria-selected="true"] strong',
      );
      const inactiveStep = tablist?.querySelector<HTMLElement>(
        '[role="tab"][aria-selected="false"] strong',
      );
      if (
        !sectionLabel ||
        !phrase ||
        !panel ||
        !tablist ||
        !productLink ||
        !nextControl ||
        !activeStep ||
        !inactiveStep
      ) {
        throw new Error("Core editorial content is missing.");
      }
      const phraseRect = phrase.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      const tablistRect = tablist.getBoundingClientRect();
      const productLinkRect = productLink.getBoundingClientRect();
      return {
        width: rect.width,
        height: rect.height,
        left: rect.left,
        right: window.innerWidth - rect.right,
        sectionLabel: sectionLabel.textContent?.trim(),
        phraseLineCount: phrase.querySelectorAll(":scope > span").length,
        phraseFontSize: Number.parseFloat(getComputedStyle(phrase).fontSize),
        panelTextAlign: getComputedStyle(panel).textAlign,
        panelPhraseOffset: Math.abs(panelRect.left - phraseRect.left),
        productLinkAfterPhrase: productLinkRect.top > phraseRect.bottom,
        productLinkBorderStyle: getComputedStyle(productLink).borderStyle,
        tablistAfterPanel: tablistRect.top >= panelRect.bottom,
        nextControlBorderStyle: getComputedStyle(nextControl).borderStyle,
        activeStepWeight: Number.parseInt(getComputedStyle(activeStep).fontWeight, 10),
        inactiveStepWeight: Number.parseInt(getComputedStyle(inactiveStep).fontWeight, 10),
      };
    });
    expect(Math.abs(coreGeometry.left - coreGeometry.right)).toBeLessThanOrEqual(2);
    expect(coreGeometry.sectionLabel).toBe("The Core");
    expect(coreGeometry.phraseLineCount).toBe(2);
    expect(coreGeometry.phraseFontSize).toBeGreaterThan(36);
    expect(coreGeometry.panelTextAlign).toBe("left");
    expect(coreGeometry.panelPhraseOffset).toBeLessThanOrEqual(2);
    expect(coreGeometry.productLinkAfterPhrase).toBe(true);
    expect(coreGeometry.productLinkBorderStyle).toBe("solid");
    expect(coreGeometry.tablistAfterPanel).toBe(true);
    expect(coreGeometry.nextControlBorderStyle).toBe("none");
    expect(coreGeometry.activeStepWeight).toBeGreaterThan(coreGeometry.inactiveStepWeight);

    if (viewport.splitMode === "paired") {
      expect(Math.abs(coreGeometry.width / coreGeometry.height - 16 / 9)).toBeLessThan(
        0.02,
      );
    }

    const splitGeometry = await page.locator(".method-intentional").evaluate(
      (element) => {
        const copy = element.querySelector(".method-intentional__copy");
        const visual = element.querySelector(".method-intentional__visual");
        if (!copy || !visual) throw new Error("The split panels are missing.");
        const copyRect = copy.getBoundingClientRect();
        const visualRect = visual.getBoundingClientRect();
        return {
          copy: { x: copyRect.x, y: copyRect.y, width: copyRect.width },
          visual: { x: visualRect.x, y: visualRect.y, width: visualRect.width },
        };
      },
    );

    if (viewport.splitMode === "paired") {
      expect(Math.abs(splitGeometry.copy.y - splitGeometry.visual.y)).toBeLessThanOrEqual(
        1,
      );
      expect(
        Math.abs(splitGeometry.copy.width - splitGeometry.visual.width),
      ).toBeLessThanOrEqual(1);
      expect(splitGeometry.visual.x).toBeGreaterThan(splitGeometry.copy.x);
    } else {
      expect(splitGeometry.visual.y).toBeGreaterThan(splitGeometry.copy.y);
      expect(
        Math.abs(splitGeometry.copy.width - splitGeometry.visual.width),
      ).toBeLessThanOrEqual(1);
    }

    await expectNoMainOverflow(page, viewport.width);
  });
}

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 1024, height: 900 },
  { width: 390, height: 844 },
] as const) {
  test(`Ingredient literacy carousel remains responsive at ${viewport.width}×${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/system#system-ingredients");

    const section = page.locator("#system-ingredients");
    const carouselViewport = section.locator(".ingredient-carousel__viewport");
    const tabs = section.getByRole("tab");
    await expect(tabs).toHaveCount(9);
    await expect(tabs.first().locator("img")).toBeVisible();
    await expect(section.getByText("FORMULATION NOTE", { exact: true })).toHaveCount(0);
    await expect(tabs.first()).toHaveAttribute("aria-selected", "true");
    await expect(
      section.getByRole("heading", { level: 2, name: "Research-backed ingredients" }),
    ).toBeVisible();
    await expect(carouselViewport).toHaveCSS(
      "overflow-x",
      "clip",
    );

    const geometry = await section.evaluate((element) => {
      const sectionRect = element.getBoundingClientRect();
      const viewportRect = element
        .querySelector(".ingredient-carousel__viewport")
        ?.getBoundingClientRect();
      const cardRect = element.querySelector('[role="tab"]')?.getBoundingClientRect();
      const next = element.querySelector<HTMLButtonElement>(
        '.ingredient-carousel__controls [aria-label="Next ingredient"]',
      );
      const panel = element.querySelector<HTMLElement>('[role="tabpanel"]');
      if (!viewportRect || !cardRect || !next || !panel) {
        throw new Error("The ingredient carousel composition is missing.");
      }
      const nextRect = next.getBoundingClientRect();
      const controls = next.parentElement as HTMLElement;
      return {
        cardRatio: cardRect.width / cardRect.height,
        controlsPosition: getComputedStyle(controls).position,
        controlsZIndex: Number.parseInt(getComputedStyle(controls).zIndex, 10),
        previousPresent: Boolean(
          element.querySelector(
            '.ingredient-carousel__controls [aria-label="Previous ingredient"]',
          ),
        ),
        nextBorderStyle: getComputedStyle(next).borderStyle,
        nextEdgeGap: viewportRect.right - nextRect.right,
        nextCenterInsideCard:
          nextRect.top + nextRect.height / 2 >= cardRect.top &&
          nextRect.top + nextRect.height / 2 <= cardRect.bottom,
        panelRadius: Number.parseFloat(getComputedStyle(panel).borderTopLeftRadius),
        left: sectionRect.left,
        right: window.innerWidth - sectionRect.right,
      };
    });
    expect(Math.abs(geometry.cardRatio - 4 / 5)).toBeLessThan(0.02);
    expect(geometry.controlsPosition).toBe("absolute");
    expect(geometry.controlsZIndex).toBeGreaterThan(1);
    expect(geometry.previousPresent).toBe(false);
    expect(geometry.nextBorderStyle).toBe("none");
    expect(geometry.nextEdgeGap).toBeGreaterThanOrEqual(0);
    expect(geometry.nextEdgeGap).toBeLessThanOrEqual(12);
    expect(geometry.nextCenterInsideCard).toBe(true);
    expect(geometry.panelRadius).toBeGreaterThan(0);
    expect(Math.abs(geometry.left - geometry.right)).toBeLessThanOrEqual(2);

    const secondCardClickPoint = await tabs.nth(1).evaluate((element) => {
      const cardRect = element.getBoundingClientRect();
      const viewportRect = element
        .closest(".ingredient-carousel__viewport")
        ?.getBoundingClientRect();
      if (!viewportRect) throw new Error("The ingredient viewport is missing.");

      const left = Math.max(cardRect.left, viewportRect.left, 0);
      const right = Math.min(cardRect.right, viewportRect.right, window.innerWidth);
      const top = Math.max(cardRect.top, viewportRect.top, 0);
      const bottom = Math.min(cardRect.bottom, viewportRect.bottom, window.innerHeight);
      if (right <= left || bottom <= top) {
        throw new Error("The second ingredient card has no visible click target.");
      }
      return { x: left + (right - left) / 2, y: top + (bottom - top) / 2 };
    });
    await page.mouse.click(secondCardClickPoint.x, secondCardClickPoint.y);
    await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
    await expect(section.getByRole("tabpanel")).toContainText("Peptides");
    await expect(
      section.getByRole("button", { name: "Previous ingredient" }),
    ).toBeVisible();
    await expect(
      section.getByRole("button", { name: "Next ingredient" }),
    ).toBeVisible();

    const nextIngredient = section.getByRole("button", { name: "Next ingredient" });
    await nextIngredient.click();
    await nextIngredient.click();
    await nextIngredient.click();
    await expect(tabs.nth(4)).toHaveAttribute("aria-selected", "true");
    await expect
      .poll(() =>
        section.evaluate((element) => {
          const viewportRect = element
            .querySelector(".ingredient-carousel__viewport")
            ?.getBoundingClientRect();
          const activeRect = element
            .querySelector('[role="tab"][aria-selected="true"]')
            ?.getBoundingClientRect();
          if (!viewportRect || !activeRect) return Number.POSITIVE_INFINITY;
          return Math.abs(
            activeRect.left + activeRect.width / 2 -
              (viewportRect.left + viewportRect.width / 2),
          );
        }),
      )
      .toBeLessThanOrEqual(2);

    await tabs.nth(4).press("End");
    await expect(tabs.last()).toBeFocused();
    await expect(tabs.last()).toHaveAttribute("aria-selected", "true");
    await expect(carouselViewport).toHaveJSProperty("scrollLeft", 0);
    await expect(
      section.getByRole("button", { name: "Previous ingredient" }),
    ).toBeVisible();
    await expect(
      section.getByRole("button", { name: "Next ingredient" }),
    ).toHaveCount(0);
    await section.getByRole("button", { name: "Previous ingredient" }).click();
    await expect(tabs.nth(7)).toHaveAttribute("aria-selected", "true");
    const finalNext = section.getByRole("button", { name: "Next ingredient" });
    await finalNext.focus();
    await page.keyboard.press("Enter");
    await expect(tabs.last()).toHaveAttribute("aria-selected", "true");
    await expect(
      section.getByRole("button", { name: "Previous ingredient" }),
    ).toBeFocused();
    await expectNoMainOverflow(page, viewport.width);
  });
}

test("Ingredient literacy shares the PDP swipe-following pointer behavior", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/system#system-ingredients");

  const section = page.locator("#system-ingredients");
  const viewport = section.locator(".ingredient-carousel__viewport");
  const indicator = viewport.locator(".carousel-swipe-indicator");
  const tabs = section.getByRole("tab");
  await expect(tabs).toHaveCount(9);
  await expect(tabs.first()).toBeVisible();
  const firstCard = await tabs.first().boundingBox();
  if (!firstCard) throw new Error("The first ingredient card is not visible.");

  const startX = firstCard.x + firstCard.width * 0.62;
  const startY = firstCard.y + firstCard.height * 0.5;
  await page.mouse.move(startX, startY);
  await expect(indicator).toHaveAttribute("data-visible", "true");
  await expect(indicator).toHaveCSS("opacity", "1");

  const indicatorBox = await indicator.boundingBox();
  if (!indicatorBox) throw new Error("The ingredient swipe indicator is missing.");
  expect(
    Math.abs(indicatorBox.x + indicatorBox.width / 2 - startX),
  ).toBeLessThanOrEqual(2);
  expect(
    Math.abs(indicatorBox.y + indicatorBox.height / 2 - startY),
  ).toBeLessThanOrEqual(2);

  await page.mouse.down();
  await page.mouse.move(startX - 90, startY, { steps: 4 });
  await expect(section.locator(".ingredient-carousel")).toHaveAttribute(
    "data-dragging",
    "true",
  );
  await page.mouse.up();
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(indicator).toHaveAttribute("data-visible", "false");
});

test("Core and ingredient arrow controls use an eased fill treatment", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/system");

  for (const control of [
    page.getByRole("button", { name: "Next Core step" }),
    page.getByRole("button", { name: "Next ingredient" }),
  ]) {
    await expect(control).toHaveCSS("border-style", "none");
    const initialFill = await control.evaluate(
      (element) => getComputedStyle(element, "::before").transform,
    );
    const motion = await control.evaluate((element) => {
      const style = getComputedStyle(element, "::before");
      return {
        duration: style.transitionDuration,
        easing: style.transitionTimingFunction,
      };
    });
    expect(motion.duration).not.toBe("0s");
    expect(motion.easing).toContain("cubic-bezier");

    await control.hover();
    await expect
      .poll(() =>
        control.evaluate(
          (element) => getComputedStyle(element, "::before").transform,
        ),
      )
      .not.toBe(initialFill);
  }
});

test("Core flow removes crossfade motion for reduced-motion users", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/system");

  await expect(page.locator(".method-flow__background").first()).toHaveCSS(
    "transition-duration",
    "0s",
  );
  await expect(page.locator(".ingredient-carousel__image").first()).toHaveCSS(
    "transition-duration",
    "0s",
  );
  await expect(page.locator(".method-selection-panel").first()).toHaveCSS(
    "animation-name",
    "none",
  );
  await expect(page.locator(".ingredient-carousel__rail")).toHaveCSS(
    "transition-duration",
    "0s",
  );
  for (const control of [
    page.getByRole("button", { name: "Next Core step" }),
    page.getByRole("button", { name: "Next ingredient" }),
  ]) {
    await expect(control).toHaveCSS("transition-duration", "0s");
    await expect
      .poll(() =>
        control.evaluate(
          (element) => getComputedStyle(element, "::before").transitionDuration,
        ),
      )
      .toBe("0s");
  }
});
