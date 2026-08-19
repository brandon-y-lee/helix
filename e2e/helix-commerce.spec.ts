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
  await expect(acknowledgement).not.toContainText("Mei Pelle");
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
