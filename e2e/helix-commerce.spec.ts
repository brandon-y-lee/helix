import { expect, test } from "./storefront-fixture";

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

test("Account, Cart, Checkout, and consent use the helix identity", async ({
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

  await page.getByRole("button", { name: "Cookie Preferences" }).click();
  const consent = page.getByRole("dialog", { name: "Cookie Preferences" });
  await expect(consent).toContainText("helix uses essential cookies");
  await expect(consent).not.toContainText("Mei Pelle");
});

test("Checkout cancellation returns to an intact guest Cart", async ({ page }) => {
  await page.goto("/cart?checkout=cancelled");

  await expect(
    page.getByRole("status").filter({ hasText: "Sandbox checkout was cancelled" }),
  ).toBeVisible();
  await expect(
    page.locator("#content").getByText("Your cart is empty."),
  ).toBeVisible();
  await expect(page).toHaveTitle("Cart | helix");
});
