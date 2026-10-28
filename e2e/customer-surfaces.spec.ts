import { expect, test } from "./storefront-fixture";
import { expectNoMainOverflow } from "./layout-assertions";
import { CANVAS_WHITE, CONTROL_BORDER, PANEL_GRAY, expectGrayPanels, expectWhiteCanvas } from "./surface-assertions";
import { createCartLayoutFixture } from "./cart-fixture";
import { REWARD_TIERS } from "@/lib/rewards/rules";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/cart", route => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ count: 0, lines: [], subtotal: 0, currency: "USD" }),
  }));
});

test("customer access and utility pages keep gray panels and visible inset controls", async ({ page }) => {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    for (const route of ["/account/sign-in?error=expired-link", "/account/sign-up", "/account/forgot-password"]) {
      await page.goto(route);
      await expectWhiteCanvas(page);
      await expectGrayPanels(page.locator(".account-access-layout__form-panel"));
      for (const control of await page.locator('.account-form input:not([type="hidden"])').all()) {
        await expect(control).toHaveCSS("background-color", CANVAS_WHITE);
        await expect(control).toHaveCSS("border-top-color", CONTROL_BORDER);
      }
      await expectNoMainOverflow(page, viewport.width);
    }
    for (const route of ["/account/reset-password", "/account/service-unavailable"]) {
      await page.goto(route);
      await expectGrayPanels(page.locator(".account-panel"));
      await expectNoMainOverflow(page, viewport.width);
    }
    for (const route of ["/cart", "/checkout", "/checkout/success", "/surface-verification-missing"]) {
      await page.goto(route);
      await expectWhiteCanvas(page);
      await expect(page.locator("#content .empty-state")).toHaveCSS("background-color", PANEL_GRAY);
      await expectNoMainOverflow(page, viewport.width);
    }
  }
});

test("private customer content is rendered on the shared surfaces without live commerce", async ({ page }) => {
  test.slow();
  const escaped: string[] = [];
  await page.route("**/api/**", route => {
    escaped.push(new URL(route.request().url()).pathname);
    return route.abort();
  });
  page.on("request", request => {
    if (request.method() === "POST") escaped.push(`POST ${new URL(request.url()).pathname}`);
  });
  const routes = [
    ["account", "populated"], ["account", "empty"], ["account", "unverified"], ["account", "unavailable"],
    ["rewards", "populated"], ["rewards", "empty"], ["rewards", "signed-out"], ["rewards", "unavailable"],
    ["order", "populated"], ["order", "pending"], ["order", "unverified"],
  ];
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    for (const [view, state] of routes) {
      await page.goto(`/helix-verification/customer/${view}?state=${state}`);
      await expect(page.locator("h1")).toBeVisible();
      await expectWhiteCanvas(page);
      await expectGrayPanels(page.locator("#content .account-section, #content .account-panel, #content .checkout-result__panel, #content .public-utility-page > .empty-state"));
      for (const control of await page.locator('#content .account-form input:not([type="hidden"]), #content .account-form select, #content .account-form textarea').all()) {
        await expect(control).toHaveCSS("background-color", CANVAS_WHITE);
        await expect(control).toHaveCSS("border-top-color", CONTROL_BORDER);
      }
      await expect(page.locator(".cart-link")).toBeDisabled();
      await expect(page.locator(".cart-sheet")).toHaveCount(0);
      await expectNoMainOverflow(page, viewport.width);
    }
  }
  expect(escaped).toEqual([]);
});

test("synthetic customer forms expose pending, error and success surfaces locally", async ({ page }) => {
  test.slow();
  const writes: string[] = [];
  await page.route("**/*", route => {
    const request = route.request();
    if (request.method() === "POST" || new URL(request.url()).pathname.startsWith("/api/")) {
      writes.push(`${request.method()} ${new URL(request.url()).pathname}`);
      return route.abort();
    }
    return route.fallback();
  });
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    for (const state of ["pending", "error", "success"]) {
      await page.goto(`/helix-verification/customer/account?state=${state}`);
      await page.getByRole("button", { name: "Save profile", exact: true }).click();
      await page.getByRole("button", { name: "Submit private feedback", exact: true }).click();
      if (state === "pending") {
        await expect(page.getByRole("button", { name: "Working", exact: true })).toBeDisabled();
        await expect(page.getByRole("button", { name: "Submitting", exact: true })).toBeDisabled();
      } else {
        const statuses = page.locator("#content .form-status");
        await expect(statuses).toHaveCount(2);
        await expectGrayPanels(statuses);
      }
      await expectNoMainOverflow(page, viewport.width);
    }
    for (const form of ["sign-in", "sign-up", "forgot-password", "reset-password"]) {
      await page.goto(`/helix-verification/customer/auth?form=${form}&state=validation`);
      for (const input of await page.locator('.account-form input:not([type="hidden"])').all()) {
        await input.fill(await input.getAttribute("type") === "email" ? "sample@example.test" : "sample-value");
      }
      await page.locator('.account-form button[type="submit"]').click();
      await expect(page.locator(".account-form").getByRole("alert")).toHaveText("Check the highlighted fields.");
      await expectGrayPanels(page.locator(".form-status"));
      await expectNoMainOverflow(page, viewport.width);
    }
  }
  expect(writes).toEqual([]);
});

test("populated cart lines, quantities and Redemption Tiers retain distinct neutral surfaces", async ({ page, storefront }) => {
  const tier = REWARD_TIERS[0];
  const tierLabel = `${tier.label} (${tier.points} Points)`;
  const cart = createCartLayoutFixture(storefront.snapshot.products, { lineCount: 3, quantity: 2 });
  await page.route("**/api/cart", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(cart) }));
  await page.route("**/api/rewards/summary", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
    authenticated: true, pointsBalance: 425, estimatedPurchasePoints: 300,
    affordableTiers: [tier],
  }) }));
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/cart");
    await expectWhiteCanvas(page);
    await expect(page.locator("#content .cart-item")).toHaveCount(cart.lines.length);
    await expect(page.locator("#content .reward-selector")).toBeVisible();
    await expectGrayPanels(page.locator("#content .cart-summary"));
    for (const item of await page.locator("#content .cart-item").all()) {
      await expect(item).toHaveCSS("background-color", CANVAS_WHITE);
    }
    for (const control of await page.locator("#content .qty, #content .reward-selector").all()) {
      await expect(control).toHaveCSS("background-color", CANVAS_WHITE);
      await expect(control).toHaveCSS("border-top-color", CONTROL_BORDER);
    }
    await expect(page.getByRole("radio", { name: tierLabel })).toBeVisible();
    await expectNoMainOverflow(page, viewport.width);
    const cartTrigger = page.locator(".cart-link");
    await cartTrigger.click();
    const drawer = page.getByRole("dialog", { name: "Cart", exact: true });
    await expect(drawer.locator(".cart-sheet")).toHaveCSS("background-color", CANVAS_WHITE);
    await expectGrayPanels(drawer.locator(".cart-summary"));
    for (const item of await drawer.locator(".cart-item").all()) {
      await expect(item).toHaveCSS("background-color", CANVAS_WHITE);
    }
    await page.keyboard.press("Escape");
    await expect(cartTrigger).toBeFocused();
  }
});

test("privacy choices preserves focus and truthful categories through interrupted and repeated flows", async ({ page }) => {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 320, height: 480 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/cookie-policy");
    const trigger = page.locator(".site-footer").getByRole("button", { name: "Your Privacy Choices", exact: true });
    const initialURL = page.url();
    await expect(page.locator(".site-footer").getByRole("button", { name: "Cookie notice" })).toHaveCount(0);
    await expect(page.locator(".site-footer").getByRole("link", { name: "Your Privacy Choices" })).toHaveCount(0);
    for (const method of ["outside", "close", "escape", "confirm"] as const) {
      await trigger.click();
      const dialog = page.getByRole("dialog", { name: "Your Privacy Choices" });
      const close = dialog.getByRole("button", { name: "Close privacy choices" });
      const confirm = dialog.getByRole("button", { name: "Confirm my choices" });
      const essential = dialog.getByRole("button", { name: "Essential Cookies Always Active" });
      const analytics = dialog.getByRole("button", { name: "Analytics" });
      await expect(dialog).toHaveCSS("background-color", CANVAS_WHITE);
      await expect(dialog).toBeFocused();
      await expect(dialog.getByRole("switch")).toHaveCount(2);
      await expect(dialog.getByRole("button", { name: "Accept All" })).toBeVisible();
      await expect(dialog.locator(".privacy-dialog__body")).toHaveJSProperty("scrollTop", 0);
      await expect(essential).toHaveAttribute("aria-expanded", "true");
      await expect(analytics).toHaveAttribute("aria-expanded", "false");
      await page.keyboard.press("Shift+Tab");
      await expect(confirm).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(close).toBeFocused();
      await page.keyboard.press("Shift+Tab");
      await expect(confirm).toBeFocused();
      await expect(page.locator("body")).toHaveCSS("overflow", "hidden");
      await expect(page.locator("main")).toHaveAttribute("inert", "");
      await analytics.click();
      await expect(analytics).toHaveAttribute("aria-expanded", "true");
      await expect(essential).toHaveAttribute("aria-expanded", "false");
      await expect(confirm).toBeInViewport();
      const bounds = await dialog.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.x).toBeGreaterThanOrEqual(16);
      expect(bounds!.y).toBeGreaterThanOrEqual(0);
      expect(bounds!.width).toBeLessThanOrEqual(viewport.width - 32);
      expect(bounds!.height).toBeLessThanOrEqual(viewport.height * 0.9 + 1);
      if (method === "outside") await page.locator(".privacy-dialog-backdrop").click({ position: { x: 2, y: 2 } });
      else if (method === "close") await close.click();
      else if (method === "escape") await page.keyboard.press("Escape");
      else await confirm.click();
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await expect(page.locator("main")).not.toHaveAttribute("inert");
      await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
      expect(page.url()).toBe(initialURL);
    }
    await expectNoMainOverflow(page, viewport.width);
  }
});

test("cookie policy retains the current legal layout with readable scoped tables and working links", async ({ page }) => {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 320, height: 480 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/cookie-policy");
    await expect(page).toHaveTitle("Cookie Policy | helix");
    const policy = page.getByRole("article", { name: "Cookie Policy" });
    await expect(policy.getByRole("heading", { level: 1, name: "Cookie Policy" })).toBeVisible();
    await expect(policy).not.toContainText(/Not in effect|prelaunch|No Legal Operator/);
    await expect(policy.getByRole("table", {name:"Required cookies"}).getByRole("columnheader")).toHaveText(["Name", "Function", "Duration"]);
    await expect(policy.getByRole("table", {name:"Required cookies"}).getByRole("row")).toHaveCount(8);
    await expect(policy.getByRole("link", { name: "support@helixskin.com" })).toHaveAttribute("href", "mailto:support@helixskin.com");
    await expectNoMainOverflow(page, viewport.width);
    await page.locator(".site-footer").getByRole("button", { name: "Your Privacy Choices" }).click();
    await page.getByRole("dialog").getByRole("link", { name: "Privacy Policy", exact: true }).first().click();
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(page.getByRole("heading", { level: 1, name: "Privacy Policy" })).toBeVisible();
    await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
  }
});
