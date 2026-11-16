import { expect, type Locator, type Page } from "@playwright/test";

export const CANVAS_WHITE = "rgb(255, 255, 255)";
export const PANEL_GRAY = "rgb(245, 245, 247)";
export const CONTROL_BORDER = "rgb(140, 140, 145)";

export async function expectWhiteCanvas(page: Page) {
  await expect(page.locator("html")).toHaveCSS("background-color", CANVAS_WHITE);
  await expect(page.locator("body")).toHaveCSS("background-color", CANVAS_WHITE);
}

export async function expectGrayPanels(panels: Locator) {
  expect(await panels.count(), "The route must render the expected panels").toBeGreaterThan(0);
  for (const panel of await panels.all()) {
    await expect(panel).toHaveCSS("background-color", PANEL_GRAY);
  }
}
