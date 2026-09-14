import { expect, test } from "./storefront-fixture";
import { CANVAS_WHITE, PANEL_GRAY, CONTROL_BORDER, expectWhiteCanvas } from "./surface-assertions";

const editorClass = (name: string) => `[class*="CatalogEditor_${name}__"]`;

async function expectNoDocumentOverflow(page: import("@playwright/test").Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
}

test("Admin dashboard and catalog states use the shared neutral hierarchy", async ({ page }) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/helix-verification/admin");
    await expectWhiteCanvas(page);
    await expect(page.locator(".admin-shell")).toHaveCSS("background-color", CANVAS_WHITE);
    await expect(page.locator(".admin-module").first()).toHaveCSS("background-color", PANEL_GRAY);
    await expect(page.locator(".storefront-page-frame")).toHaveCount(0);
    await page.goto("/helix-verification/admin/catalog");
    await expect(page.getByRole("heading", { name: "Catalog Editor", exact: true })).toBeVisible();
    await expect(page.locator(editorClass("productCard")).first()).toHaveCSS("background-color", PANEL_GRAY);
    await expect(page.locator(editorClass("cardMedia")).first()).toHaveCSS("background-image", "none");
    await expect(page.getByLabel("Search name or slug")).toHaveCSS("background-color", CANVAS_WHITE);
    await expect(page.getByLabel("Search name or slug")).toHaveCSS("border-top-color", CONTROL_BORDER);
    await expectNoDocumentOverflow(page);
    for (const state of ["loading", "empty", "unavailable"]) {
      await page.goto(`/helix-verification/admin/catalog?state=${state}`);
      await expect(page.locator(editorClass("statePanel"))).toHaveCSS("background-color", PANEL_GRAY);
    }
    for (const scenario of ["forbidden", "unavailable", "loading", "error"]) {
      await page.goto(`/helix-verification/admin/states?scenario=${scenario}`);
      await expect(page.locator(scenario === "error" ? ".admin-error" : ".admin-gate__panel")).toHaveCSS("background-color", PANEL_GRAY);
      if (scenario === "forbidden" || scenario === "unavailable") {
        await expect(page.locator(".account-signout")).toHaveCSS("background-color", CANVAS_WHITE);
      }
      await expectNoDocumentOverflow(page);
    }
  }
});

test("the actual editor preserves nested fields, keyboard focus and local validation", async ({ page }) => {
  const writes: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/admin/") || request.method() !== "GET" && request.method() !== "HEAD") writes.push(request.url());
  });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/helix-verification/admin/editor?state=validation");
    await expect(page.getByRole("heading", { name: "Verification Cleanser", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Expand all", exact: true }).click();
    const displayName = page.locator("#products-display_name");
    await expect(displayName).toHaveCSS("background-color", CANVAS_WHITE);
    await expect(displayName).toHaveCSS("border-top-color", CONTROL_BORDER);
    await displayName.focus();
    await expect(displayName).toHaveCSS("outline-color", "rgb(35, 72, 62)");
    await expect(page.locator("#group-variant-records").locator(editorClass("fieldGroupBody"))).toHaveCSS("background-color", CANVAS_WHITE);
    await expect(page.locator("#group-variant-records").locator(editorClass("recordCard")).first()).toHaveCSS("background-color", PANEL_GRAY);
    await page.getByRole("button", { name: "Validate", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Validation issues", exact: true })).toBeVisible();
    await expect(displayName).toBeFocused();
    await expect(page.locator(editorClass("errorSummary"))).toHaveCSS("background-color", PANEL_GRAY);
    await expectNoDocumentOverflow(page);
  }
  expect(writes).toEqual([]);
});

test("catalog conflict and publication review remain local and visibly distinct", async ({ page }) => {
  await page.goto("/helix-verification/admin/editor?state=conflict");
  await page.getByRole("button", { name: "Expand all", exact: true }).click();
  await page.locator("#products-display_name").fill("Local verification edit");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Newer draft detected" })).toBeVisible();
  await expect(page.locator(editorClass("conflict"))).toHaveCSS("background-color", PANEL_GRAY);
  await page.goto("/helix-verification/admin/editor?state=ready");
  await page.getByRole("button", { name: "Review publish", exact: true }).click();
  await expect(page.getByRole("region", { name: "Publish review" })).toHaveCSS("background-color", PANEL_GRAY);
  await page.getByRole("button", { name: "Confirm publish", exact: true }).click();
  await expect(page.getByText("This action is disabled in local verification. No catalog changes were made.", { exact: true })).toBeVisible();
});

test("Catalog Preview renders actual gray metadata and product surfaces with commerce disabled", async ({ page }) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/helix-verification/admin/preview");
    await expectWhiteCanvas(page);
    await expect(page.locator(".catalog-preview-metadata")).toHaveCSS("background-color", PANEL_GRAY);
    await expect(page.locator(".catalog-preview-commerce-notice")).toHaveCSS("background-color", PANEL_GRAY);
    await expect(page.locator(".pdp__purchase")).toHaveCSS("background-color", PANEL_GRAY);
    await expect(page.getByRole("button", { name: "Cart unavailable in Catalog Preview" })).toBeDisabled();
    await expectNoDocumentOverflow(page);
    await page.goto("/helix-verification/admin/preview?state=invalid");
    await expect(page.locator(".catalog-preview-state")).toHaveCSS("background-color", PANEL_GRAY);
  }
});
