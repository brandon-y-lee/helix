import type { Page } from "@playwright/test";
import { expect, test } from "./storefront-fixture";
import { expectNoMainOverflow } from "./layout-assertions";

const DISMISSAL_KEY = "helix.welcome-dismissed-until";
const viewports = [{ width: 390, height: 844 }, { width: 1440, height: 900 }];

async function syntheticCampaign(page: Page, ready = true) {
  const unexpected: string[] = [];
  const submissions: { body: unknown; referrer: string | null }[] = [];
  let readinessReads = 0;
  // Guard every API request and every write, including unexpected non-API POSTs.
  // Only these exact synthetic reads/writes may be fulfilled. Nothing is sent to a provider.
  await page.route("**/*", async route => {
    const request = route.request();
    const url = new URL(request.url());
    const sameOrigin = url.origin === new URL(page.url()).origin;
    if (sameOrigin && url.pathname === "/api/cart" && !url.search && request.method() === "GET") {
      return route.fulfill({ json: { count: 0, lines: [], subtotal: 0, currency: "USD" } });
    }
    if (sameOrigin && url.pathname === "/api/marketing/readiness" && !url.search && request.method() === "GET") {
      readinessReads++;
      return route.fulfill({ json: { ready }, headers: { "Cache-Control": "private, no-store" } });
    }
    if (sameOrigin && url.pathname === "/api/marketing/subscription" && !url.search && request.method() === "POST") {
      submissions.push({ body: request.postDataJSON(), referrer: await request.headerValue("referer") });
      return route.fulfill({ status: 202, json: { ok: true } });
    }
    if (url.pathname.startsWith("/api/") || !["GET", "HEAD"].includes(request.method())) {
      unexpected.push(`${request.method()} ${url.pathname}`);
      return route.abort();
    }
    return route.fallback();
  });
  await page.clock.install();
  return { submissions, unexpected, readinessReads: () => readinessReads };
}

async function finishDelay(page: Page) {
  await page.clock.fastForward(13000);
}

for (const viewport of viewports) {
  test(`welcome popup delays, requires consent and submits only synthetic signup at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const campaign = await syntheticCampaign(page);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const dialog = page.getByRole("dialog", { name: "Your first step. 15% off." });
    await expect(dialog).toHaveCount(0);
    expect(campaign.readinessReads()).toBe(0);
    await finishDelay(page);
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("verified account with the same email");
    await expect(dialog).toContainText("14 days");
    await expect(dialog).toContainText("excluding shipping and tax");
    const close = dialog.getByRole("button", { name: "Close welcome offer" });
    const join = dialog.getByRole("button", { name: "Join the list" });
    await close.focus();
    await page.keyboard.press("Shift+Tab");
    await expect(join).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(close).toBeFocused();
    await dialog.getByRole("textbox", { name: "Email address" }).fill("delivered@resend.dev");
    const consent = dialog.getByRole("checkbox");
    await expect(consent).not.toBeChecked();
    await join.click();
    await expect(consent).toBeFocused();
    expect(campaign.submissions).toEqual([]);
    await consent.check();
    await join.click();
    await expect(dialog.getByRole("status")).toContainText("If this address is eligible, check your inbox to confirm.");
    await expect(dialog.getByRole("status")).toBeFocused();
    expect(campaign.submissions).toEqual([{ body: {
      email: "delivered@resend.dev", consent: true, scope: "lifecycle", source: "welcome_popup",
    }, referrer: null }]);
    await expectNoMainOverflow(page, viewport.width);
    const bounds = await dialog.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
    const stored = await page.evaluate(key => localStorage.getItem(key), DISMISSAL_KEY);
    expect(stored).toMatch(/^\d+$/);
    expect(campaign.unexpected).toEqual([]);
  });

  test(`product popup restores focus on Escape and stays dismissed across navigation at ${viewport.width}px`, async ({ page, storefront }) => {
    await page.setViewportSize(viewport);
    const campaign = await syntheticCampaign(page);
    await page.goto(`/products/${storefront.product("richPdp").slug}`);
    await page.waitForLoadState("networkidle");
    const focusTarget = page.locator("#content");
    await focusTarget.focus();
    await finishDelay(page);
    const dialog = page.getByRole("dialog", { name: "Your first step. 15% off." });
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(focusTarget).toBeFocused();
    const remaining = await page.evaluate(key => Number(localStorage.getItem(key)) - Date.now(), DISMISSAL_KEY);
    expect(remaining).toBeGreaterThan(29 * 86400000);
    expect(remaining).toBeLessThanOrEqual(30 * 86400000);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await finishDelay(page);
    await expect(dialog).toHaveCount(0);
    expect(campaign.readinessReads()).toBe(1);
    expect(campaign.submissions).toEqual([]);
    expect(campaign.unexpected).toEqual([]);
  });
}

test("popup stays hidden when readiness fails and never appears on excluded routes", async ({ page }) => {
  const campaign = await syntheticCampaign(page, false);
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await finishDelay(page);
  await expect(page.getByRole("dialog", { name: "Your first step. 15% off." })).toHaveCount(0);
  expect(campaign.readinessReads()).toBe(1);
  for (const path of ["/checkout", "/account/sign-in", "/privacy", "/email-preferences"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await finishDelay(page);
    await expect(page.getByRole("dialog", { name: "Your first step. 15% off." })).toHaveCount(0);
  }
  expect(campaign.readinessReads()).toBe(1);
  expect(campaign.submissions).toEqual([]);
  expect(campaign.unexpected).toEqual([]);
});
