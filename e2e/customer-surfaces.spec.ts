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
    return route.continue();
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
    await expectGrayPanels(page.locator("#content .cart-item, #content .cart-summary"));
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
    await expectGrayPanels(drawer.locator(".cart-item, .cart-summary"));
    await page.keyboard.press("Escape");
    await expect(cartTrigger).toBeFocused();
  }
});

test("cookie acknowledgement keeps white elevation and gray category panels", async ({ page }) => {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 320, height: 480 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/cookie-policy");
    const trigger = page.getByRole("button", { name: "Cookie notice", exact: true });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Cookie notice" });
    await expect(dialog).toHaveCSS("background-color", CANVAS_WHITE);
    await expectGrayPanels(dialog.locator(".cookie-dialog__category"));
    await expect(dialog.locator(".cookie-dialog__category--inactive span")).toHaveCSS("background-color", CANVAS_WHITE);
    await expect(dialog.getByRole("button", { name: "Close cookie notice" })).toHaveCSS("border-top-color", CONTROL_BORDER);
    await dialog.getByRole("button", { name: "Acknowledge notice" }).click();
    await expect(dialog.getByRole("status")).toHaveText("Cookie notice acknowledged.");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expectNoMainOverflow(page, viewport.width);
  }
});
