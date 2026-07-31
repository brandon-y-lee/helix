import { expect, test, type Locator } from "@playwright/test";

const CLEANSE_PATH = "/products/cleanse-01-calming-gel-cleanser";
const TREAT_PATH = "/products/treat-03-pdrn-5-ampoule";

async function readInkGeometry(option: Locator) {
  return option.evaluate((button) => {
    const outline = button.querySelector<HTMLElement>(
      ".pdp-ink-option__outline",
    );
    const fill = button.querySelector<HTMLElement>(".pdp-ink-option__fill");
    if (!outline || !fill) throw new Error("Missing Outcome text layers");

    const shape = (rect: DOMRect) => ({
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    });
    const outlineBox = shape(outline.getBoundingClientRect());
    const fillBox = shape(fill.getBoundingClientRect());
    const range = document.createRange();
    range.selectNodeContents(fill);
    const fragments = Array.from(range.getClientRects(), shape);
    range.detach();

    const fillStyle = getComputedStyle(fill);
    const outlineStyle = getComputedStyle(outline);
    const topOverflow = Number.parseFloat(
      fillStyle.getPropertyValue("--pdp-ink-overflow-top"),
    );
    const bottomOverflow = Number.parseFloat(
      fillStyle.getPropertyValue("--pdp-ink-overflow-bottom"),
    );
    const inkTop = Math.min(...fragments.map((rect) => rect.top));
    const inkBottom = Math.max(...fragments.map((rect) => rect.bottom));
    const clipInsets = Array.from(
      fillStyle.clipPath.matchAll(/-?\d+(?:\.\d+)?px/g),
      (match) => Number.parseFloat(match[0]),
    );
    const clipTop = clipInsets[0] ?? 0;
    const clipBottom =
      clipInsets.length >= 3
        ? clipInsets[2]
        : clipInsets.length === 2
          ? clipInsets[0]
          : clipInsets[0] ?? 0;
    const close = (left: number, right: number) =>
      Math.abs(left - right) < 0.05;

    return {
      boundsMatch:
        close(outlineBox.top, fillBox.top) &&
        close(outlineBox.right, fillBox.right) &&
        close(outlineBox.bottom, fillBox.bottom) &&
        close(outlineBox.left, fillBox.left),
      completeCoverage:
        fillBox.top + clipTop <= inkTop + 0.05 &&
        fillBox.bottom - clipBottom >= inkBottom - 0.05,
      fragmentCount: fragments.length,
      topOverflow,
      bottomOverflow,
      measured: fill.dataset.pdpInkMeasured === "true",
      clipPath: fillStyle.clipPath,
      transitionDuration: fillStyle.transitionDuration,
      typographyMatches: [
        "fontFamily",
        "fontSize",
        "fontWeight",
        "letterSpacing",
        "lineHeight",
      ].every(
        (property) =>
          fillStyle[property as keyof CSSStyleDeclaration] ===
          outlineStyle[property as keyof CSSStyleDeclaration],
      ),
      fontsLoaded: document.fonts.status === "loaded",
    };
  });
}

async function expectCompleteInk(option: Locator) {
  await expect(option).toHaveAttribute("aria-pressed", "true");
  await expect(
    option.locator(".pdp-ink-option__fill"),
  ).toHaveAttribute("data-pdp-ink-measured", "true");
  await expect.poll(async () => (await readInkGeometry(option)).completeCoverage)
    .toBe(true);
}

test("Outcome ink covers multiline ascenders and descenders after state and viewport changes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto(TREAT_PATH);
  await page.evaluate(() => document.fonts.ready);

  const multiline = page.getByRole("button", {
    name: "wakes up the finish",
    exact: true,
  });
  await multiline.click();
  await expectCompleteInk(multiline);

  const desktopGeometry = await readInkGeometry(multiline);
  expect(desktopGeometry.boundsMatch).toBe(true);
  expect(desktopGeometry.typographyMatches).toBe(true);
  expect(desktopGeometry.fragmentCount).toBeGreaterThan(1);
  expect(desktopGeometry.topOverflow).toBeGreaterThan(0);
  expect(desktopGeometry.bottomOverflow).toBeGreaterThan(0);
  expect(desktopGeometry.fontsLoaded).toBe(true);

  const hydrates = page.getByRole("button", {
    name: "hydrates",
    exact: true,
  });
  await hydrates.click();
  await expectCompleteInk(hydrates);

  await page.setViewportSize({ width: 390, height: 844 });
  await multiline.click();
  await expectCompleteInk(multiline);

  const mobileGeometry = await readInkGeometry(multiline);
  expect(mobileGeometry.boundsMatch).toBe(true);
  expect(mobileGeometry.typographyMatches).toBe(true);
  expect(mobileGeometry.fragmentCount).toBeGreaterThan(1);
});

test("Outcome ink is immediate for reduced motion with one accessible label", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(CLEANSE_PATH);

  const preps = page.getByRole("button", { name: "preps", exact: true });
  await expect(preps.locator(":scope > .sr-only")).toHaveCount(1);
  await expect(preps.locator(".pdp-ink-option__label")).toHaveAttribute(
    "aria-hidden",
    "true",
  );

  await preps.click();
  await expectCompleteInk(preps);
  const geometry = await readInkGeometry(preps);
  expect(geometry.transitionDuration).toBe("0s");
  expect(geometry.boundsMatch).toBe(true);
  expect(geometry.completeCoverage).toBe(true);
  expect(geometry.bottomOverflow).toBeGreaterThan(0);
});
