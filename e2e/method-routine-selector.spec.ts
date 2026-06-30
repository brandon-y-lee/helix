import { expect, test, type Page } from "@playwright/test";

const sequences = {
  3: ["01 CLEANSE", "02 TREAT", "03 SEAL"],
  4: ["01 CLEANSE", "02 TREAT", "03 SEAL", "04 PROTECT"],
  5: ["01 CLEANSE", "02 REFINE", "03 TREAT", "04 SEAL", "05 PROTECT"],
  6: ["01 CLEANSE", "02 REFINE", "03 TREAT", "04 FRAME", "05 SEAL", "06 PROTECT"],
  7: [
    "01 CLEANSE",
    "02 REFINE",
    "03 TREAT",
    "04 FRAME",
    "05 SEAL",
    "06 PROTECT",
    "07 LIFT",
  ],
} as const;

async function stepLabels(page: Page) {
  return page.locator(".method-step").evaluateAll((steps) =>
    steps.map((step) => step.querySelector("h2")?.textContent?.replace(/\s+/g, " ").trim()),
  );
}

async function navStepLabels(page: Page) {
  return page.locator(".method-index__link span").evaluateAll((items) =>
    items
      .map((item) => item.textContent?.replace(/\s+/g, " ").trim() ?? "")
      .filter((label) => /^\d{2}\s/.test(label)),
  );
}

async function hueNumbers(page: Page) {
  return page.locator(".method-step__routine").evaluateAll((items) =>
    items.map((item) => item.textContent?.replace(/\s+/g, " ").trim()),
  );
}

async function routineCardLabels(page: Page, selector: string) {
  return page.locator(`${selector} li`).evaluateAll((items) =>
    items.map((item) => {
      const number = item.getAttribute("data-display-number");
      const link = item.querySelector("a");
      const label = link?.childNodes[0]?.textContent?.replace(/\s+/g, " ").trim();
      return `${number} ${label}`;
    }),
  );
}

async function expectSequence(page: Page, count: keyof typeof sequences) {
  const expected = sequences[count];
  await expect(page.locator(".method-step")).toHaveCount(expected.length);
  expect(await stepLabels(page)).toEqual(expected);
  expect(await navStepLabels(page)).toEqual(expected);
  expect(await hueNumbers(page)).toEqual(expected.map((label) => label.slice(0, 2)));
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    )
    .toBeLessThanOrEqual(1);
}

async function sliderGeometry(page: Page) {
  return page.evaluate(() => {
    const range = document.querySelector<HTMLElement>(".method-edit__range");
    const input = document.querySelector<HTMLInputElement>('.method-edit input[type="range"]');
    if (!range || !input) throw new Error("Missing System range control");

    const rangeStyle = window.getComputedStyle(range);
    const thumbSize = Number.parseFloat(
      rangeStyle.getPropertyValue("--method-edit-thumb-size"),
    );
    const inputRect = input.getBoundingClientRect();
    const min = Number(input.min);
    const max = Number(input.max);
    const value = Number(input.value);
    const axisStart = inputRect.left + thumbSize / 2;
    const axisEnd = inputRect.right - thumbSize / 2;
    const axisWidth = axisEnd - axisStart;
    const expectedCenterForValue = (count: number) =>
      axisStart + ((count - min) / (max - min)) * axisWidth;

    const positions = Array.from(
      document.querySelectorAll<HTMLElement>(".method-edit__ticks li"),
    ).map((item) => {
      const count = Number(item.dataset.routineCount);
      const tick = item.querySelector<HTMLElement>(".method-edit__tick");
      const label = item.querySelector<HTMLElement>(".method-edit__tick-label");
      if (!tick || !label) throw new Error("Missing System tick or label");
      const itemRect = item.getBoundingClientRect();
      const tickRect = tick.getBoundingClientRect();
      const labelRect = label.getBoundingClientRect();
      const expectedCenter = expectedCenterForValue(count);
      return {
        count,
        expectedCenter,
        itemCenter: itemRect.left + itemRect.width / 2,
        labelCenter: labelRect.left + labelRect.width / 2,
        tickCenter: tickRect.left + tickRect.width / 2,
      };
    });

    return {
      value,
      thumbCenter: expectedCenterForValue(value),
      selected: positions.find((position) => position.count === value),
      positions,
    };
  });
}

async function expectSliderGeometryAligned(page: Page) {
  const geometry = await sliderGeometry(page);
  const tolerance = 2;

  for (const position of geometry.positions) {
    expect(Math.abs(position.tickCenter - position.expectedCenter)).toBeLessThanOrEqual(
      tolerance,
    );
    expect(Math.abs(position.labelCenter - position.expectedCenter)).toBeLessThanOrEqual(
      tolerance,
    );
    expect(Math.abs(position.tickCenter - position.labelCenter)).toBeLessThanOrEqual(
      tolerance,
    );
  }

  expect(geometry.selected).toBeDefined();
  expect(
    Math.abs((geometry.selected?.tickCenter ?? 0) - geometry.thumbCenter),
  ).toBeLessThanOrEqual(tolerance);
  expect(
    Math.abs((geometry.selected?.labelCenter ?? 0) - geometry.thumbCenter),
  ).toBeLessThanOrEqual(tolerance);
}

test.describe("System routine selector responsive viewports", () => {
  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 1440, height: 900 },
    { width: 1024, height: 768 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
    { width: 360, height: 800 },
  ]) {
    test(`${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto("/system");

      await expect(page.getByLabel("Routine length")).toBeVisible();
      await expectSequence(page, 7);
      await expectNoHorizontalOverflow(page);

      const layout = await page.evaluate(() => {
        const box = (selector: string) => {
          const node = document.querySelector(selector);
          if (!node) return null;
          const rect = node.getBoundingClientRect();
          return { x: rect.x, y: rect.y, right: rect.right };
        };
        return {
          firstStep: box(".method-step"),
          nav: box(".method-index"),
          selector: box(".method-edit"),
          width: window.innerWidth,
        };
      });

      expect(layout.nav).not.toBeNull();
      expect(layout.selector).not.toBeNull();
      expect(layout.firstStep).not.toBeNull();

      if (viewport.width > 1020) {
        expect(layout.selector!.x).toBeGreaterThan(layout.nav!.right);
        expect(Math.abs(layout.selector!.y - layout.nav!.y)).toBeLessThanOrEqual(2);
      } else {
        expect(layout.selector!.y).toBeGreaterThan(layout.nav!.y);
        expect(layout.firstStep!.y).toBeGreaterThan(layout.selector!.y);
      }
    });
  }
});

test.describe("System routine selector geometry", () => {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    test(`aligns ticks, labels, and thumb at ${viewport.width}x${viewport.height}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto("/system");

      const slider = page.getByLabel("Routine length");
      await slider.focus();
      await page.keyboard.press("Home");

      for (const count of [3, 4, 5, 6, 7] as const) {
        await expect(slider).toHaveValue(String(count));
        await expectSliderGeometryAligned(page);
        if (count < 7) await page.keyboard.press("ArrowRight");
      }
    });
  }
});

test("System routine length selector adapts nav, sections, timing, hue numerals, and chips", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  await page.goto("/system");
  const slider = page.getByLabel("Routine length");
  await expect(slider).toHaveValue("7");
  await expect(slider).toHaveAttribute("min", "3");
  await expect(slider).toHaveAttribute("max", "7");
  await expect(slider).toHaveAttribute("step", "1");
  await expect(slider).toHaveAttribute(
    "aria-valuetext",
    "7 steps, full System with the scheduled weekly intensive",
  );
  await expectSequence(page, 7);
  await expect(routineCardLabels(page, "#routine-weekly")).resolves.toEqual(["07 LIFT"]);

  await page.locator('.method-index__link[href="#system-lift"]').click();
  await expect(page.locator("#system-lift")).toBeInViewport();
  await slider.focus();
  await page.keyboard.press("Home");
  await expect(slider).toHaveValue("3");
  await expect(slider).toHaveAttribute(
    "aria-valuetext",
    "3 steps, foundation: cleanse, treat, moisturize",
  );
  await expectSequence(page, 3);
  await expect(page.locator("#system-refine")).toHaveCount(0);
  await expect(page.locator("#system-frame")).toHaveCount(0);
  await expect(page.locator("#system-protect")).toHaveCount(0);
  await expect(page.locator("#system-lift")).toHaveCount(0);
  await expect(routineCardLabels(page, "#routine-am")).resolves.toEqual([
    "01 CLEANSE",
    "02 TREAT",
    "03 SEAL",
  ]);
  await expect(routineCardLabels(page, "#routine-weekly")).resolves.toEqual([]);
  await expect(page.locator("#routine-weekly")).toContainText(
    "No separate weekly step is included in this edit.",
  );
  await expect(page.locator('.method-index__link[href="#system-lift"][aria-current="location"]')).toHaveCount(0);
  expect(new URL(page.url()).hash).not.toBe("#system-lift");

  await page.keyboard.press("PageUp");
  await expect(slider).toHaveValue("4");
  await page.keyboard.press("PageDown");
  await expect(slider).toHaveValue("3");
  await page.keyboard.press("ArrowRight");
  await expect(slider).toHaveValue("4");
  await expectSequence(page, 4);
  await expect(routineCardLabels(page, "#routine-am")).resolves.toEqual([
    "01 CLEANSE",
    "02 TREAT",
    "03 SEAL",
    "04 PROTECT",
  ]);
  const protect = page.locator("#system-protect");
  await expect(protect).toContainText("COMING SOON");
  await expect(protect.getByRole("button")).toHaveCount(0);
  await expect(protect.getByRole("link")).toHaveCount(0);
  await expect(protect).not.toContainText(/\$\d/);

  await page.keyboard.press("ArrowRight");
  await expect(slider).toHaveValue("5");
  await expectSequence(page, 5);
  await expect(routineCardLabels(page, "#routine-am")).resolves.toEqual([
    "01 CLEANSE",
    "02 REFINE",
    "03 TREAT",
    "04 SEAL",
    "05 PROTECT",
  ]);

  await page.keyboard.press("ArrowRight");
  await expect(slider).toHaveValue("6");
  await expectSequence(page, 6);

  await page.keyboard.press("End");
  await expect(slider).toHaveValue("7");
  await expectSequence(page, 7);

  await page.keyboard.press("Home");
  const ingredientCardCount = await page.locator(".ingredient-card").count();
  expect(ingredientCardCount).toBeGreaterThan(0);
  const refineChips = page.locator(
    '.ingredient-card__found a[href="/products/refine-02-pore-treatment-pads"]',
  );
  expect(await refineChips.count()).toBeGreaterThan(0);
  const refineChip = refineChips.first();
  await expect(refineChip).toHaveAttribute("data-routine-active", "false");
  await expect(refineChip).toHaveAttribute(
    "aria-label",
    "REFINE, not included in the current 3-step system. Opens product details.",
  );
  await refineChip.focus();
  await expect(refineChip).toBeFocused();
  await refineChip.press("Enter");
  await expect(page).toHaveURL(/\/products\/refine-02-pore-treatment-pads$/);

  await page.goto("/products");
  await expect(page.getByLabel("Routine length")).toHaveCount(0);
  await expect(page.locator(".product-card")).not.toHaveCount(0);

  await expectNoHorizontalOverflow(page);
  expect(consoleErrors.filter((message) => !message.includes("Warning:"))).toEqual([]);
});
