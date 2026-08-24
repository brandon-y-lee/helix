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
      const heading = element.querySelector("h2");
      const panel = element.querySelector('[role="tabpanel"]');
      if (!heading || !panel) throw new Error("Core editorial content is missing.");
      return {
        width: rect.width,
        height: rect.height,
        left: rect.left,
        right: window.innerWidth - rect.right,
        headingFontSize: Number.parseFloat(getComputedStyle(heading).fontSize),
        headingWhiteSpace: getComputedStyle(heading).whiteSpace,
        panelTextAlign: getComputedStyle(panel).textAlign,
      };
    });
    expect(Math.abs(coreGeometry.left - coreGeometry.right)).toBeLessThanOrEqual(2);
    expect(coreGeometry.headingFontSize).toBeLessThanOrEqual(48);
    expect(coreGeometry.panelTextAlign).toBe("right");

    if (viewport.splitMode === "paired") {
      expect(Math.abs(coreGeometry.width / coreGeometry.height - 16 / 9)).toBeLessThan(
        0.02,
      );
      expect(coreGeometry.headingWhiteSpace).toBe("nowrap");
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

test("Ingredient literacy uses an image-led disclosure carousel", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto("/system#system-ingredients");

  const section = page.locator("#system-ingredients");
  const tabs = section.getByRole("tab");
  await expect(tabs).toHaveCount(9);
  await expect(tabs.first().locator("img")).toBeVisible();
  await expect(section.getByText("FORMULATION NOTE", { exact: true })).toHaveCount(0);
  await expect(tabs.first()).toHaveAttribute("aria-selected", "true");

  await tabs.nth(1).click();
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(section.getByRole("tabpanel")).toContainText("Peptides");

  await tabs.nth(1).focus();
  await page.keyboard.press("End");
  await expect(tabs.last()).toBeFocused();
  await expect(tabs.last()).toHaveAttribute("aria-selected", "true");
  await section.getByRole("button", { name: "Next ingredient" }).click();
  await expect(tabs.first()).toHaveAttribute("aria-selected", "true");
  await expectNoMainOverflow(page, 1024);
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
});
