import { test, expect } from "@playwright/test";

// Storefront parity v1 coverage. Data comes from the seeded dev Supabase
// catalog (verified reachable + seeded by global-setup, so these fail fast if
// Supabase is misconfigured rather than hanging).

test("shop renders Supabase products with a count", async ({ page }) => {
  const shopifyRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().toLowerCase().includes("shopify")) {
      shopifyRequests.push(request.url());
    }
  });

  await page.goto("/products");
  await expect(
    page.getByRole("heading", { level: 1, name: "RAISE YOUR BASELINE." }),
  ).toBeVisible();
  await expect(page.locator(".product-count")).toHaveText("6 products");
  await expect(page.locator(".product-card")).toHaveCount(6);
  await expect(page.getByRole("link", { name: "CLEANSE", exact: true })).toBeVisible();
  await expect(page.getByText("Clean skin. No tight finish.").first()).toBeVisible();
  await expect(page.locator('[data-media-kind="placeholder"]').first()).toBeVisible();
  expect(shopifyRequests).toEqual([]);
});

test("collection filter narrows the grid", async ({ page }) => {
  await page.goto("/products");
  await page.getByRole("button", { name: "The Core", exact: true }).click();
  await expect(page.locator(".product-count")).toHaveText("3 products");
  await expect(page.getByRole("link", { name: "CLEANSE", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "REFINE", exact: true })).toHaveCount(0);
});

test("sort control reorders products", async ({ page }) => {
  await page.goto("/products");
  await page.getByLabel("Sort products").selectOption("name-asc");
  await expect(page.locator(".product-card__name").first()).toHaveText(
    "CLEANSE",
  );
  await page.getByLabel("Sort products").selectOption("name-desc");
  await expect(page.locator(".product-card__name").first()).toHaveText(
    "TREAT",
  );
});

test("product detail loads by slug and variant selection updates state", async ({
  page,
}) => {
  await page.goto("/products/treat-03-pdrn-5-ampoule");
  await expect(
    page.getByRole("heading", { level: 1, name: "TREAT" }),
  ).toBeVisible();
  // Purchase support accordions and lower factual sections are present.
  await expect(page.getByRole("button", { name: /WHAT IT DOES/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /HOW TO USE/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /KEY INGREDIENTS/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "QUICK SIGNALS" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "INGREDIENTS", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "EARLY READS" })).toBeVisible();

  const thirtyMl = page.getByRole("button", { name: "30 mL", exact: true });
  await thirtyMl.click();
  await expect(thirtyMl).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".pdp__price")).toHaveText("$25.00");
});

test("add to cart updates the count and persists across reload", async ({
  page,
}) => {
  await page.goto("/products/cleanse-01-calming-gel-cleanser");
  await page.getByRole("button", { name: /Add to cart/ }).click();
  await expect(page.getByText("Added to cart")).toBeVisible();

  // Header cart trigger reflects the item.
  await expect(page.getByRole("button", { name: /CART \(1\)/ })).toBeVisible();

  // Reload: server-backed guest cart persists.
  await page.reload();
  await expect(page.getByRole("button", { name: /CART \(1\)/ })).toBeVisible();

  // Cart page shows the line item, then clear empties it.
  await page.goto("/cart");
  await expect(page.getByText("CLEANSE")).toBeVisible();
  await expect(page.locator('[data-media-kind="placeholder"]').first()).toBeVisible();
  await page.getByRole("button", { name: "Clear cart" }).click();
  await expect(page.getByText(/your cart is empty/i)).toBeVisible();
});

test("product card quick buy opens inline, then final buy opens cart drawer", async ({
  page,
}) => {
  await page.goto("/products");
  const resetCard = page.locator(".product-card").filter({ hasText: "CLEANSE" }).first();
  const resetSurface = resetCard.locator(".product-card__surface");
  await resetCard.hover();
  await expect(resetSurface).toHaveAttribute("data-visual-state", "preview");
  const quickBuyTrigger = resetCard.getByRole("button", {
    name: "Open quick buy for CLEANSE",
  });
  await expect(quickBuyTrigger).toBeVisible();

  await quickBuyTrigger.click();
  await expect(page.getByRole("button", { name: /CART \(0\)/ })).toBeVisible();
  await expect(resetSurface).toHaveAttribute("data-visual-state", "quick-buy");
  await expect(resetCard.locator(".product-card__quick-buy")).toHaveAttribute(
    "data-open",
    "true",
  );

  await resetCard.getByRole("button", { name: "Close quick buy for CLEANSE" }).click();
  await expect(resetCard.locator(".product-card__quick-buy")).toHaveAttribute(
    "data-open",
    "false",
  );
  await expect(resetSurface).toHaveAttribute("data-visual-state", "preview");

  await page.mouse.move(10, 10);
  await expect(resetSurface).toHaveAttribute("data-visual-state", "default");
  await expect(resetCard.locator(".product-card__cta")).toHaveCSS("opacity", "0");

  await resetCard.hover();
  await quickBuyTrigger.click();
  const finalBuy = resetCard.getByRole("button", {
    name: /Buy CLEANSE .+ for \$\d+\.\d{2}/,
  });
  await expect(finalBuy).toBeVisible();
  await finalBuy.click();

  await expect(page.getByRole("dialog", { name: "Cart" })).toBeVisible();
  await expect(page.getByRole("button", { name: /CART \(1\)/ })).toBeVisible();
  await expect(resetCard.locator(".product-card__quick-buy")).toHaveAttribute(
    "data-open",
    "true",
  );

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Cart" })).toHaveCount(0);
  await expect(finalBuy).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(resetCard.locator(".product-card__quick-buy")).toHaveAttribute(
    "data-open",
    "false",
  );
});

test("view cart closes the drawer after the cart route commits", async ({
  page,
}) => {
  await page.goto("/products/cleanse-01-calming-gel-cleanser");
  await page.getByRole("button", { name: /Add to cart/ }).click();
  await expect(page.getByRole("button", { name: /CART \(1\)/ })).toBeVisible();

  await page.getByRole("button", { name: /CART \(1\)/ }).click();
  const drawer = page.getByRole("dialog", { name: "Cart" });
  await expect(drawer).toBeVisible();
  await drawer.getByRole("link", { name: "View cart" }).click();

  await expect(page).toHaveURL(/\/cart$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Cart" }),
  ).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Cart" })).toHaveCount(0);
  await expect(page.locator(".sheet")).toHaveCount(0);
  await expect(page.getByText("CLEANSE").first()).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe("");

  await page.goBack();
  await expect(page).toHaveURL(/\/products\/cleanse-01-calming-gel-cleanser$/);
});

test("view cart closes immediately when already on the cart route", async ({
  page,
}) => {
  await page.goto("/products/cleanse-01-calming-gel-cleanser");
  await page.getByRole("button", { name: /Add to cart/ }).click();
  await expect(page.getByText("Added to cart")).toBeVisible();
  await expect(page.getByRole("button", { name: /CART \(1\)/ })).toBeVisible();
  await page.goto("/cart");
  await expect(page.getByText("CLEANSE").first()).toBeVisible();

  await page.getByRole("button", { name: /CART \(1\)/ }).click();
  const drawer = page.getByRole("dialog", { name: "Cart" });
  await expect(drawer).toBeVisible();
  await drawer.getByRole("link", { name: "View cart" }).click();

  await expect(page).toHaveURL(/\/cart$/);
  await expect(page.getByRole("dialog", { name: "Cart" })).toHaveCount(0);
  await expect(page.getByText("CLEANSE").first()).toBeVisible();
});

test("PDP sticky purchase bar aligns to the content shell and clears the lower endpoint", async ({
  page,
}) => {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/products/treat-03-pdrn-5-ampoule");
    await page.evaluate(() => window.scrollTo(0, 0));

    const sticky = page.locator(".pdp-sticky-purchase");
    await expect(page.locator(".pdp-endorsements")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Endorsed by familiar faces" }),
    ).toBeVisible();
    await expect(page.locator(".pdp-endorsements__item")).toHaveCount(4);
    await expect(page.locator(".pdp-endorsements__item img")).toHaveCount(4);
    await expect(page.locator(".pdp-endorsements")).not.toContainText(/quote|review/i);
    await page.locator(".pdp__actions").scrollIntoViewIfNeeded();
    await expect(sticky).toHaveAttribute("data-visible", "false");
    await expect(sticky).toHaveAttribute("aria-hidden", "true");

    await page.locator(".pdp-sections").scrollIntoViewIfNeeded();
    await expect(sticky).toHaveAttribute("data-visible", "true");
    await expect(sticky).toHaveAttribute("aria-hidden", "false");
    await page.waitForTimeout(300);

    const geometry = await page.evaluate(() => {
      const shell = document.querySelector<HTMLElement>(".pdp");
      const bar = document.querySelector<HTMLElement>(".pdp-sticky-purchase");
      if (!shell || !bar) return null;
      const shellRect = shell.getBoundingClientRect();
      const barRect = bar.getBoundingClientRect();
      const style = getComputedStyle(bar);
      return {
        barBottom: barRect.bottom,
        barLeft: barRect.left,
        barRight: barRect.right,
        bottomLeftRadius: style.borderBottomLeftRadius,
        bottomRightRadius: style.borderBottomRightRadius,
        childClasses: Array.from(bar.children).map((child) => child.className),
        overflow:
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
        shellLeft: shellRect.left,
        shellRight: shellRect.right,
        topLeftRadius: Number.parseFloat(style.borderTopLeftRadius),
        topRightRadius: Number.parseFloat(style.borderTopRightRadius),
        viewportHeight: window.innerHeight,
      };
    });

    expect(geometry).not.toBeNull();
    expect(geometry?.barLeft).toBeCloseTo(geometry?.shellLeft ?? 0, 0);
    expect(geometry?.barRight).toBeCloseTo(geometry?.shellRight ?? 0, 0);
    expect(geometry?.barBottom).toBeCloseTo(geometry?.viewportHeight ?? 0, 0);
    expect(geometry?.topLeftRadius).toBeGreaterThan(0);
    expect(geometry?.topRightRadius).toBeGreaterThan(0);
    expect(geometry?.bottomLeftRadius).toBe("0px");
    expect(geometry?.bottomRightRadius).toBe("0px");
    expect(geometry?.childClasses).toEqual([
      "pdp-sticky-purchase__identity",
      "pdp-sticky-purchase__variants",
      "pdp-sticky-purchase__action",
    ]);
    expect(geometry?.overflow).toBeLessThanOrEqual(1);
    await expect(
      sticky.locator(".pdp-sticky-purchase__variants button[aria-pressed='true']"),
    ).toHaveCount(1);
    await expect(sticky.locator(".btn")).toBeVisible();
    await expect(sticky.locator(".pdp-payment-message")).toHaveCount(0);

    await page.locator(".pdp-bottom-sentinel").scrollIntoViewIfNeeded();
    await expect(sticky).toHaveAttribute("data-visible", "false");
    await expect(sticky).toHaveAttribute("aria-hidden", "true");
  }
});

test("PDP familiar faces rail uses finite local media and boundary-aware controls", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/products/cleanse-01-calming-gel-cleanser");

  const section = page.locator(".pdp-endorsements");
  const rail = section.getByRole("list", {
    name: "Familiar faces editorial images",
  });
  await section.scrollIntoViewIfNeeded();
  await expect(section).toBeVisible();
  await expect(section.locator("li")).toHaveCount(4);

  const imageSources = await section.locator("img").evaluateAll((images) =>
    images.map((image) => (image as HTMLImageElement).currentSrc),
  );
  await expect
    .poll(() =>
      section.locator("img").evaluateAll((images) =>
        images.every(
          (image) =>
            (image as HTMLImageElement).complete &&
            (image as HTMLImageElement).naturalWidth > 0,
        ),
      ),
    )
    .toBe(true);
  const pageOrigin = new URL(page.url()).origin;
  expect(imageSources).toHaveLength(4);
  expect(imageSources.every((source) => new URL(source).origin === pageOrigin))
    .toBe(true);
  expect(imageSources.every((source) => decodeURIComponent(source).includes("/media/home/")))
    .toBe(true);
  await expect(
    section.getByRole("button", { name: "Previous endorsement images" }),
  ).toHaveCount(0);
  await expect(
    section.getByRole("button", { name: "Next endorsement images" }),
  ).toBeVisible();

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await section.scrollIntoViewIfNeeded();

  const next = section.getByRole("button", { name: "Next endorsement images" });
  await expect(next).toBeVisible();

  for (let attempt = 0; attempt < 5 && (await next.count()) > 0; attempt += 1) {
    await next.click();
    await page.waitForTimeout(100);
  }

  await expect(next).toHaveCount(0);
  await expect(
    section.getByRole("button", { name: "Previous endorsement images" }),
  ).toBeVisible();

  const beforeKeyboardScroll = await rail.evaluate((element) => element.scrollLeft);
  expect(beforeKeyboardScroll).toBeGreaterThan(0);
  await rail.focus();
  await page.keyboard.press("ArrowLeft");
  await expect
    .poll(() => rail.evaluate((element) => element.scrollLeft))
    .toBeLessThan(beforeKeyboardScroll);
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test("cart outage remains retryable and never reports an unknown cart as empty", async ({
  page,
}) => {
  let available = false;
  await page.route("**/api/cart", async (route) => {
    if (!available) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        headers: {
          "Cache-Control": "private, no-store",
          "Retry-After": "5",
        },
        body: JSON.stringify({
          error: {
            code: "CART_SERVICE_UNAVAILABLE",
            message: "Your cart is temporarily unavailable.",
            retryable: true,
          },
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        lines: [],
        count: 0,
        subtotal: 0,
        currency: "USD",
      }),
    });
  });

  await page.goto("/cart");
  await expect(page.getByText("Your cart is temporarily unavailable.")).toBeVisible();
  await expect(page.getByText("Your cart is empty.")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /CART \(—\)/ })).toBeVisible();

  available = true;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("Your cart is empty.")).toBeVisible();
  await expect(page.getByRole("button", { name: /CART \(0\)/ })).toBeVisible();
});

test("product detail purchase accordions sit beneath add to cart", async ({
  page,
}) => {
  await page.goto("/products/treat-03-pdrn-5-ampoule");

  const order = await page.evaluate(() => {
    const add = document.querySelector(".pdp__actions .btn");
    const does = document.querySelector("#pdp-accordion-does-trigger");
    const use = document.querySelector("#pdp-accordion-use-trigger");
    const ingredients = document.querySelector("#pdp-accordion-ingredients-trigger");
    const details = document.querySelector("#product-details");
    const fullIngredients = document.querySelector("#full-ingredients");
    if (!add || !does || !use || !ingredients || !details || !fullIngredients) {
      return null;
    }
    const before = (a: Element, b: Element) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    return {
      addBeforeDoes: before(add, does),
      doesBeforeUse: before(does, use),
      useBeforeIngredients: before(use, ingredients),
      ingredientsBeforeDetails: before(ingredients, details),
      fullIngredientsBeforeDetails: before(fullIngredients, details),
    };
  });
  expect(order).toEqual({
    addBeforeDoes: true,
    doesBeforeUse: true,
    useBeforeIngredients: true,
    ingredientsBeforeDetails: true,
    fullIngredientsBeforeDetails: true,
  });

  const does = page.getByRole("button", { name: /WHAT IT DOES/ });
  const use = page.getByRole("button", { name: /HOW TO USE/ });
  const ingredients = page.getByRole("button", { name: /KEY INGREDIENTS/ });

  await does.click();
  await expect(does).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#pdp-accordion-does-panel")).toHaveAttribute(
    "data-open",
    "true",
  );

  await use.click();
  await expect(does).toHaveAttribute("aria-expanded", "false");
  await expect(use).toHaveAttribute("aria-expanded", "true");

  await ingredients.click();
  await expect(use).toHaveAttribute("aria-expanded", "false");
  await expect(ingredients).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("link", { name: "View full ingredients" }).click();
  await expect(page).toHaveURL(/#full-ingredients$/);
  await expect(page.locator("#full-ingredients")).toBeInViewport();
  await expect(page.locator("#product-details")).toBeAttached();
});

test("product card quick buy trigger is visible on mobile without hover", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/products");
  const resetCard = page.locator(".product-card").filter({ hasText: "CLEANSE" }).first();
  await expect(
    resetCard.getByRole("button", { name: "Open quick buy for CLEANSE" }),
  ).toBeVisible();
});

test("unknown product slug shows a clear not-found state", async ({ page }) => {
  const response = await page.goto("/products/does-not-exist");
  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { level: 1, name: "Not found" }),
  ).toBeVisible();
});
