import { expect, test, type Page } from "@playwright/test";

const CLEANSE_PATH = "/products/cleanse-01-calming-gel-cleanser";
const TREAT_PATH = "/products/treat-03-pdrn-5-ampoule";

async function addCleanse(page: Page) {
  await page.goto(CLEANSE_PATH);
  await expect(
    page.getByRole("button", { name: /CART \(0\)/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Add to cart/ }).click();
  await expect(page.getByText("Added to cart")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /CART \(1\)/ }),
  ).toBeVisible();
}

test("shop renders seeded products and combines filtering with sorting", async ({
  page,
}) => {
  await page.goto("/products");
  await expect(page.locator(".product-count")).toHaveText("6 products");
  await expect(page.locator(".product-card")).toHaveCount(6);

  const filters = page.getByRole("group", {
    name: "Filter by collection",
  });
  const core = filters.getByRole("button", {
    name: "The Core",
    exact: true,
  });
  await core.click();
  await expect(core).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".product-count")).toHaveText("3 products");
  await expect(
    page.getByRole("link", { name: "REFINE", exact: true }),
  ).toHaveCount(0);

  await page.getByLabel("Sort products").selectOption("name-desc");
  await expect(page.locator(".product-card__name").first()).toHaveText(
    "TREAT",
  );
});

test("PDP resolves canonical data and exposes an available variant", async ({
  page,
}) => {
  await page.goto(TREAT_PATH);
  await expect(
    page.getByRole("heading", { level: 1, name: "TREAT" }),
  ).toBeVisible();

  const variant = page.getByRole("button", {
    name: "30 mL",
    exact: true,
  });
  await variant.click();
  await expect(variant).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".pdp__price")).toHaveText("$25.00");
  await expect(
    page.getByRole("region", {
      name: "TREAT routine video",
      exact: true,
    }),
  ).toBeAttached();
  await expect(
    page.getByRole("region", { name: "TREAT customer reviews" }),
  ).toBeVisible();
});

test("PDP add-to-cart persists across reload and reaches the cart page", async ({
  page,
}) => {
  await addCleanse(page);
  await page.reload();
  await expect(
    page.getByRole("button", { name: /CART \(1\)/ }),
  ).toBeVisible();

  await page.goto("/cart");
  await expect(page.getByText("CLEANSE").first()).toBeVisible();
  await expect(page.getByRole("list", { name: "Cart items" })).toBeVisible();
  await page.getByRole("button", { name: "Clear cart" }).click();
  await expect(page.getByText(/your cart is empty/i)).toBeVisible();
});

test("mobile quick buy opens the cart drawer and restores focus on Escape", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/products");
  await expect(
    page.getByRole("button", { name: /CART \(0\)/ }),
  ).toBeVisible();

  const card = page
    .locator(".product-card")
    .filter({ hasText: "CLEANSE" })
    .first();
  const quickBuy = card.getByRole("button", {
    name: "Open quick buy for CLEANSE",
  });
  await expect(quickBuy).toBeVisible();
  await quickBuy.click();

  const finalBuy = card.getByRole("button", {
    name: /Buy CLEANSE .+ for \$\d+\.\d{2}/,
  });
  await finalBuy.click();
  const drawer = page.getByRole("dialog", { name: "Cart" });
  await expect(drawer).toBeVisible();
  await expect(
    page.getByRole("button", { name: /CART \(1\)/ }),
  ).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await expect(finalBuy).toBeFocused();
});

test("cart drawer navigation closes the overlay and preserves browser history", async ({
  page,
}) => {
  await addCleanse(page);

  await page.getByRole("button", { name: /CART \(1\)/ }).click();
  const drawer = page.getByRole("dialog", { name: "Cart" });
  await expect(drawer).toBeVisible();
  await drawer.getByRole("link", { name: "View cart" }).click();

  await expect(page).toHaveURL(/\/cart$/);
  await expect(drawer).toHaveCount(0);
  await expect(page.getByText("CLEANSE").first()).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(
    /\/products\/cleanse-01-calming-gel-cleanser$/,
  );
});

test("PDP sticky purchase appears after routine video and hides at the footer", async ({
  page,
}) => {
  await page.goto(TREAT_PATH);
  const sticky = page.locator(".pdp-sticky-purchase");
  await expect(sticky).toHaveAttribute("data-visible", "false");

  await page.locator("[data-pdp-video-start]").evaluate((element) => {
    const markerTop = window.scrollY + element.getBoundingClientRect().top;
    window.scrollTo(0, markerTop + 1);
  });
  await expect(sticky).toHaveAttribute("data-visible", "true");
  await expect(sticky).toHaveAttribute("aria-hidden", "false");

  await page.locator("#site-footer").scrollIntoViewIfNeeded();
  await expect(sticky).toHaveAttribute("data-visible", "false");
  await expect(sticky).toHaveAttribute("aria-hidden", "true");
});

test("cart outage remains retryable without reporting an unknown cart as empty", async ({
  page,
}) => {
  let available = false;
  await page.route("**/api/cart", async (route) => {
    await route.fulfill({
      status: available ? 200 : 503,
      contentType: "application/json",
      body: available
        ? JSON.stringify({
            lines: [],
            count: 0,
            subtotal: 0,
            currency: "USD",
          })
        : JSON.stringify({
            error: {
              code: "CART_SERVICE_UNAVAILABLE",
              message: "Your cart is temporarily unavailable.",
              retryable: true,
            },
          }),
    });
  });

  await page.goto("/cart");
  await expect(
    page.getByText("Your cart is temporarily unavailable."),
  ).toBeVisible();
  await expect(page.getByText("Your cart is empty.")).toHaveCount(0);

  available = true;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("Your cart is empty.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /CART \(0\)/ }),
  ).toBeVisible();
});

test("unknown product slug returns the storefront not-found response", async ({
  page,
}) => {
  const response = await page.goto("/products/does-not-exist");
  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { level: 1, name: "Not found" }),
  ).toBeVisible();
});
