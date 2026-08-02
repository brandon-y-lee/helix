import { expect, test, type Locator, type Page } from "@playwright/test";

const CLEANSE_PATH = "/products/cleanse-01-calming-gel-cleanser";
const TREAT_PATH = "/products/treat-03-pdrn-5-ampoule";

type HorizontalGeometry = { x: number; width: number };

async function storefrontGeometry(page: Page): Promise<HorizontalGeometry> {
  return page.locator(".site-header__bar").evaluate((element) => {
    const { x, width } = element.getBoundingClientRect();
    return { x, width };
  });
}

async function finishDrawerExit(page: Page) {
  const overlay = page.locator(".cart-sheet-overlay");
  const panel = page.locator(".cart-sheet");
  await panel.evaluate((element) => {
    element.dispatchEvent(
      new TransitionEvent("transitionend", {
        bubbles: true,
        propertyName: "transform",
      }),
    );
  });
  await expect(overlay).toHaveCount(0);
}

async function addCleanse(
  page: Page,
): Promise<{ drawer: Locator; geometryBeforeOpen: HorizontalGeometry }> {
  await page.goto(CLEANSE_PATH);
  await expect(
    page.getByRole("button", { name: /CART \(0\)/ }),
  ).toBeVisible();
  const geometryBeforeOpen = await storefrontGeometry(page);
  const buyButton = page.locator("[data-pdp-buy-button]");
  await expect(buyButton).toHaveText("BUY CLEANSE - $22.00");
  await buyButton.click();
  const drawer = page.getByRole("dialog", { name: "Cart" });
  await expect(drawer).toBeVisible();
  await expect(drawer).toHaveAttribute("data-motion-state", "open");
  await expect(
    drawer
      .getByRole("list", { name: "Cart items" })
      .getByText("CLEANSE", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /CART \(1\)/ }),
  ).toBeVisible();
  return { drawer, geometryBeforeOpen };
}

test("shop renders seeded products and combines filtering with sorting", async ({
  page,
}) => {
  await page.goto("/products");
  await expect(page.locator(".product-count")).toHaveText("6 products");
  await expect(page.locator(".product-card")).toHaveCount(6);
  await expect(
    page
      .locator('[data-product-card-slug="cleanse-01-calming-gel-cleanser"]')
      .locator(".product-card__quick-trigger"),
  ).toHaveText("BUY CLEANSE - $22.00");

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
  const serverResponse = await page.request.get(TREAT_PATH);
  expect(serverResponse.ok()).toBe(true);
  expect(await serverResponse.text()).toContain("<h1>TREAT</h1>");

  await page.goto(TREAT_PATH);
  await expect(
    page.getByRole("heading", { level: 1, name: "TREAT" }),
  ).toBeVisible();
  await expect(page.locator(".pdp__availability")).toHaveCount(0);
  await expect(page.locator("[data-pdp-buy-button]")).toHaveText(
    "BUY TREAT - $25.00",
  );

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

  const portraitView = page.getByRole("button", {
    name: "View Portrait for TREAT with blond-streaked hair on pale blue., media 2 of 2",
  });
  await portraitView.click();
  await expect(portraitView).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('[data-pdp-gallery-state="2"]')).toHaveAttribute(
    "data-state",
    "active",
  );

  const productView = page.getByRole("button", {
    name: "View TREAT PDRN ampoule, media 1 of 2",
  });
  await productView.click();
  await expect(productView).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('[data-pdp-gallery-state="1"]')).toHaveAttribute(
    "data-state",
    "active",
  );
});

test("PDP add-to-cart persists across reload and reaches the cart page", async ({
  page,
}) => {
  const { drawer, geometryBeforeOpen } = await addCleanse(page);
  const drawerOverlay = page.locator(".cart-sheet-overlay");
  expect(await storefrontGeometry(page)).toEqual(geometryBeforeOpen);
  await drawer.getByRole("button", { name: "Close" }).click();
  await expect(drawerOverlay).toHaveAttribute("data-motion-state", "closed");
  expect(await storefrontGeometry(page)).toEqual(geometryBeforeOpen);
  await finishDrawerExit(page);
  await expect
    .poll(() => page.evaluate(() => document.body.style.overflow))
    .not.toBe("hidden");
  expect(await storefrontGeometry(page)).toEqual(geometryBeforeOpen);
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
    name: "BUY CLEANSE - $22.00",
  });
  await expect(finalBuy).toHaveText("BUY CLEANSE - $22.00");
  const standardCardUrl = page.url();
  await finalBuy.click();
  const drawer = page.getByRole("dialog", { name: "Cart" });
  await expect(drawer).toBeVisible();
  const drawerOverlay = page.locator(".cart-sheet-overlay");
  const drawerPanel = page.locator(".cart-sheet");
  await expect(drawerOverlay).toHaveAttribute("data-state", "open");
  await expect(drawerPanel).toHaveAttribute("data-state", "open");
  await expect(drawerPanel).toHaveAttribute("data-motion-state", "open");
  await expect(drawerPanel).toHaveCount(1);
  await expect(card).toHaveAttribute("data-quick-buy-open", "false");
  await expect(card.locator(".product-card__quick-buy")).toBeHidden();
  await expect(page).toHaveURL(standardCardUrl);
  await expect(
    page.getByRole("button", { name: /CART \(1\)/ }),
  ).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(drawerOverlay).toHaveAttribute("data-state", "closed");
  await expect(drawerPanel).toHaveAttribute("data-state", "closed");
  await expect(drawerPanel).toHaveAttribute("data-motion-state", "closed");
  await finishDrawerExit(page);
  await expect(quickBuy).toBeFocused();

  await page.emulateMedia({ reducedMotion: "reduce" });
  const cartTrigger = page.getByRole("button", { name: /CART \(1\)/ });
  await cartTrigger.click();
  await expect(drawer).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await expect(page.locator(".cart-sheet-overlay")).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => document.body.style.overflow))
    .not.toBe("hidden");
  await expect(cartTrigger).toBeFocused();
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
  const stickyBuy = sticky.locator("[data-sticky-pdp-buy-button]");
  await expect(stickyBuy).toHaveText("BUY TREAT - $25.00");
  await stickyBuy.click();

  const drawer = page.getByRole("dialog", { name: "Cart" });
  await expect(drawer).toBeVisible();
  await expect(
    drawer
      .getByRole("list", { name: "Cart items" })
      .getByText("TREAT", { exact: true }),
  ).toBeVisible();
  await drawer.getByRole("button", { name: "Close" }).click();
  await expect(stickyBuy).toBeFocused();

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
