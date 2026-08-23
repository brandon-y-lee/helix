import { expect, type Page } from "@playwright/test";

export async function expectNoMainOverflow(page: Page, viewportWidth: number) {
  const widths = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    mainScrollWidth: document.querySelector("#content")?.scrollWidth ?? 0,
  }));

  expect(widths.clientWidth).toBeLessThanOrEqual(viewportWidth);
  expect(widths.mainScrollWidth).toBe(widths.clientWidth);
}
