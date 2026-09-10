import { expect, test } from "./storefront-fixture";
import { createCartLayoutFixture } from "./cart-fixture";
import { formatPrice } from "@/lib/products";

const formerBrandPattern = new RegExp(["mei", "pelle"].join("[\\s_-]*"), "i");

const emptyCart = {
  count: 0,
  currency: "USD",
  lines: [],
  subtotal: 0,
};

test.beforeEach(async ({ page }) => {
  await page.route("**/api/cart", async (route) => {
    await route.fulfill({
      body: JSON.stringify(emptyCart),
      contentType: "application/json",
      status: 200,
    });
  });
  await page.route("**/cart/checkout-cancel", async (route) => {
    await route.fulfill({ status: 204 });
  });
});

test("Account, Cart, Checkout, and acknowledgement use the helix identity", async ({
  page,
}) => {
  await page.goto("/account/sign-in");
  await expect(page).toHaveTitle("Sign in | helix");
  await expect(
    page.getByRole("heading", { level: 1, name: "Sign in" }),
  ).toBeVisible();

  await page.goto("/cart");
  await expect(page).toHaveTitle("Cart | helix");
  await expect(
    page.locator("#content").getByText("Your cart is empty."),
  ).toBeVisible();

  await page.goto("/checkout");
  await expect(page).toHaveTitle("Checkout | helix");
  await expect(
    page.getByText(/no real charge, shipment, fulfillment/i),
  ).toBeVisible();

  await page.getByRole("button", { name: "Cookie notice" }).click();
  const acknowledgement = page.getByRole("dialog", { name: "Cookie notice" });
  await expect(acknowledgement).toContainText(
    "The helix Platform uses essential cookies",
  );
  await expect(page.locator("body")).not.toContainText(formerBrandPattern);
});

test("Checkout cancellation returns to the intact Cart", async ({ page }) => {
  await page.goto("/cart?checkout=cancelled");

  await expect(
    page.getByRole("status").filter({ hasText: "Sandbox checkout was cancelled" }),
  ).toBeVisible();
  await expect(
    page.locator("#content").getByText("Your cart is empty."),
  ).toBeVisible();
  await expect(page).toHaveTitle("Cart | helix");
});

test("an unverifiable Checkout return fails closed", async ({ page }) => {
  await page.goto("/checkout/success?session_id=invalid");

  await expect(
    page.getByRole("heading", { level: 1, name: "Order status" }),
  ).toBeVisible();
  await expect(
    page.getByText("We could not verify this payment status."),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 1, name: "Payment verified" }),
  ).toHaveCount(0);
});

test("phone cart keeps populated items, update recovery and checkout reachable at normal and short heights", async ({ page, storefront }) => {
  const cart = createCartLayoutFixture(storefront.snapshot.products, {
    lineCount: 6,
    quantity: 2,
  });
  await page.route("**/api/rewards/summary", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ authenticated: false }),
  }));
  await page.route("**/api/cart/items", (route) => route.fulfill({
    status: 503,
    contentType: "application/json",
    body: JSON.stringify({
      error: {
        code: "CART_SERVICE_UNAVAILABLE",
        message: "Your cart update is temporarily unavailable.",
        retryable: true,
      },
    }),
  }));

  for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 480 }]) {
    await page.setViewportSize(viewport);
    let releaseCart!: () => void;
    const initialRead = new Promise<void>((resolve) => { releaseCart = resolve; });
    await page.route("**/api/cart", async (route) => {
      await initialRead;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(cart) });
    });
    await page.goto("/system");
    await expect(page.locator(".search-sheet")).toHaveAttribute("data-state", "closed");
    await page.evaluate(() => new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    }));
    const header = page.locator(".site-header");
    await page.evaluate(() => window.scrollTo(0, 600));
    await expect(header).toHaveAttribute("data-nav-state", "hidden");
    await page.evaluate(() => window.scrollBy(0, -180));
    await expect(header).toHaveAttribute("data-nav-state", "revealed");
    const origin = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
    const trigger = header.locator(".cart-link");
    await trigger.click();
    const drawer = page.getByRole("dialog", { name: "Cart", exact: true });
    await expect(drawer.getByText("Loading cart.")).toBeVisible();
    releaseCart();

    const items = drawer.getByRole("region", { name: "Cart items and updates" });
    await expect(items.getByRole("list", { name: "Cart items" }).getByRole("listitem")).toHaveCount(6);
    await expect(trigger).toHaveAccessibleName("CART (12), 12 items");
    const summary = drawer.getByRole("complementary", { name: "Order summary" });
    const checkout = summary.getByRole("button", { name: `Sandbox checkout ${formatPrice(cart.subtotal)}` });
    await expect(checkout).toBeEnabled();
    await expect(summary.getByRole("link", { name: "Sign in", exact: true })).toBeVisible();

    const panel = drawer.locator(".cart-sheet");
    await expect.poll(async () => (await panel.boundingBox())?.x).toBeCloseTo(0, 1);
    const panelBox = await panel.boundingBox();
    expect(panelBox).not.toBeNull();
    expect(panelBox!.width).toBeCloseTo(viewport.width, 1);
    expect(panelBox!.height).toBeCloseTo(viewport.height, 1);
    expect(panelBox!.x).toBeCloseTo(0, 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width);

    const lastRemove = items.getByRole("button", { name: "Remove", exact: true }).last();
    await lastRemove.scrollIntoViewIfNeeded();
    await expect(lastRemove).toBeInViewport({ ratio: 1 });
    if (viewport.height > 560) {
      const summaryBox = (await summary.boundingBox())!;
      const lastBox = (await lastRemove.boundingBox())!;
      expect(lastBox.y + lastBox.height).toBeLessThanOrEqual(summaryBox.y);
      expect(summaryBox.y + summaryBox.height).toBeLessThanOrEqual(viewport.height);
      expect(await items.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
    }
    await lastRemove.focus();
    await page.keyboard.press("Tab");
    await expect(summary.getByRole("link", { name: "Sign in", exact: true })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(checkout).toBeFocused();
    await expect(checkout).toBeInViewport({ ratio: 1 });

    const firstItem = items.getByRole("listitem").first();
    await firstItem.getByRole("button", { name: `Increase ${cart.lines[0].name} quantity`, exact: true }).click();
    const error = items.getByRole("status").filter({ hasText: "Your cart update is temporarily unavailable." });
    await expect(error).toBeVisible();
    await expect(firstItem.getByLabel(`${cart.lines[0].name} quantity`, { exact: true })).toHaveText("2");
    const retry = items.getByRole("button", { name: "Try again", exact: true });
    await retry.scrollIntoViewIfNeeded();
    await expect(retry).toBeInViewport({ ratio: 1 });
    await retry.click();
    await expect(error).toHaveCount(0);
    await expect(checkout).toBeEnabled();

    await page.keyboard.press("Escape");
    await expect(drawer).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
    await expect(trigger).toBeFocused();
    await expect(trigger).toBeInViewport({ ratio: 1 });
    await expect.poll(() => page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }))).toEqual(origin);
  }
});
