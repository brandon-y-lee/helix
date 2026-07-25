import { test, expect, type Locator } from "@playwright/test";

async function expectStickyPurchaseInViewport(sticky: Locator) {
  await expect(sticky).toHaveAttribute("data-visible", "true");
  await expect(sticky).toHaveAttribute("aria-hidden", "false");
  await expect
    .poll(() =>
      sticky.evaluate((bar) => {
        const rect = bar.getBoundingClientRect();
        const style = getComputedStyle(bar);
        return (
          rect.top >= -1 &&
          rect.bottom <= window.innerHeight + 1 &&
          rect.width > 0 &&
          rect.height > 0 &&
          style.visibility !== "hidden" &&
          Number.parseFloat(style.opacity) > 0.99
        );
      }),
    )
    .toBe(true);
  await expect(sticky.locator(".btn")).toBeVisible();
  await expect(sticky.locator(".btn")).toBeEnabled();
}

async function expectStickyMatchesPageBoundaries(sticky: Locator) {
  await expect
    .poll(() =>
      sticky.evaluate((bar) => {
        const videoStart = document.querySelector("[data-pdp-video-start]");
        const footer = document.querySelector("#site-footer");
        if (!videoStart || !footer) return false;

        const footerRect = footer.getBoundingClientRect();
        const expectedVisible =
          videoStart.getBoundingClientRect().top <= 0 &&
          !(footerRect.top < window.innerHeight && footerRect.bottom > 0);
        return (
          bar.getAttribute("data-visible") === String(expectedVisible) &&
          bar.getAttribute("aria-hidden") === String(!expectedVisible)
        );
      }),
    )
    .toBe(true);
}

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
  await expect(page.getByRole("button", { name: /WHAT IT DOES/ })).toHaveCount(0);
  await expect(page.locator("#pdp-accordion-does-trigger")).toHaveCount(0);
  await expect(page.locator("#pdp-accordion-does-panel")).toHaveCount(0);
  await expect(page.locator("#pdp-does-heading")).toHaveCount(0);
  await expect(page.locator(".pdp-editorial-pair--does")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /HOW TO USE/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /KEY INGREDIENTS/ })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "TREAT routine video", exact: true }),
  ).toBeAttached();
  await expect(
    page.getByRole("heading", {
      name: "A lightweight PDRN SERUM for HYDRATION, smoother-looking texture, and a steadier GLOW.",
    }),
  ).toBeAttached();
  await expect(
    page.getByRole("group", { name: "TREAT outcomes" }),
  ).toBeAttached();
  await expect(page.getByRole("heading", { name: "QUICK SIGNALS" })).toHaveCount(0);
  await expect(page.getByText("Endorsed by familiar faces")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "APPLICATION", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "what’s inside", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "FULL INGREDIENTS LIST",
      exact: true,
    }),
  ).toBeVisible();
  const reviews = page.getByRole("region", {
    name: "TREAT customer reviews",
  });
  await expect(reviews.getByText("AVERAGE RATING")).toBeVisible();
  await expect(reviews.locator(".review-row")).toHaveCount(2);

  const thirtyMl = page.getByRole("button", { name: "30 mL", exact: true });
  await thirtyMl.click();
  await expect(thirtyMl).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".pdp__price")).toHaveText("$25.00");
});

test("Core PDP editorial modules keep product-specific media, order, and interaction", async ({
  page,
}) => {
  const products = [
    {
      slug: "cleanse-01-calming-gel-cleanser",
      name: "CLEANSE",
      outcomeHeading: "YOUR DAILY CLEANSER THAT:",
    },
    {
      slug: "treat-03-pdrn-5-ampoule",
      name: "TREAT",
      outcomeHeading: "YOUR DAILY TREATMENT THAT:",
    },
    {
      slug: "seal-05-green-collagen-cream",
      name: "SEAL",
      outcomeHeading: "YOUR DAILY CREAM THAT:",
    },
  ] as const;

  for (const product of products) {
    await page.goto(`/products/${product.slug}`);

    const routine = page.getByRole("region", {
      name: `${product.name} routine video`,
      exact: true,
    });
    const foreground = routine.locator(".pdp-routine-video__foreground");
    const background = routine.locator(".pdp-routine-video__background");
    const profile = page.locator(".pdp-profile-split");
    const outcome = page.locator(".pdp-outcome-split");
    const application = page.locator(".pdp-application");
    const ingredients = page.locator(".pdp-ingredients");

    await expect(routine).toBeAttached();
    await expect(profile).toBeAttached();
    await expect(
      page.getByRole("heading", { name: product.outcomeHeading }),
    ).toBeAttached();
    await expect(application).toBeAttached();
    await expect(ingredients).toBeAttached();
    await expect(
      application.getByRole("button", {
        name: "Show application step 1 of 3",
      }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      application.getByRole("button", {
        name: /Show application step \d of 3/,
      }),
    ).toHaveCount(3);
    await expect(
      application.getByRole("button", {
        name: "Show next application step",
      }),
    ).toHaveCount(1);
    await expect(
      application.getByRole("button", { name: /previous/i }),
    ).toHaveCount(0);
    await expect(
      ingredients.locator("img, [role='status']"),
    ).toHaveCount(1);
    await expect(foreground).toHaveAttribute("controls", "");
    await expect(foreground).not.toHaveAttribute("autoplay", "");
    await expect(foreground).toHaveAttribute("preload", "metadata");
    await expect(foreground).toHaveAttribute("src", new RegExp(product.slug));
    await expect(foreground).toHaveAttribute("poster", new RegExp(product.slug));
    await expect(background).toHaveAttribute("muted", "");
    await expect(background).toHaveAttribute("aria-hidden", "true");
    await expect(
      profile.locator("img"),
    ).toHaveAttribute("src", new RegExp(product.slug));

    const order = await page.evaluate(() => {
      const routineNode = document.querySelector(".pdp-routine-video");
      const profileNode = document.querySelector(".pdp-profile-split");
      const outcomeNode = document.querySelector(".pdp-outcome-split");
      const applicationNode = document.querySelector(".pdp-application");
      const ingredientsNode = document.querySelector(".pdp-ingredients");
      if (
        !routineNode ||
        !profileNode ||
        !outcomeNode ||
        !applicationNode ||
        !ingredientsNode
      ) {
        return null;
      }
      return (
        Boolean(
          routineNode.compareDocumentPosition(profileNode) &
            Node.DOCUMENT_POSITION_FOLLOWING,
        ) &&
        Boolean(
          profileNode.compareDocumentPosition(outcomeNode) &
            Node.DOCUMENT_POSITION_FOLLOWING,
        ) &&
        Boolean(
          outcomeNode.compareDocumentPosition(applicationNode) &
            Node.DOCUMENT_POSITION_FOLLOWING,
        ) &&
        Boolean(
          applicationNode.compareDocumentPosition(ingredientsNode) &
            Node.DOCUMENT_POSITION_FOLLOWING,
        )
      );
    });
    expect(order).toBe(true);
  }

  const options = page.getByRole("group", { name: "SEAL outcomes" });
  const first = options.getByRole("button").nth(0);
  const second = options.getByRole("button").nth(1);
  const third = options.getByRole("button").nth(2);
  await expect(first).toHaveAttribute("aria-pressed", "true");

  await third.hover();
  await expect(third).toHaveAttribute("aria-pressed", "true");
  await page.mouse.move(0, 0);
  await expect(third).toHaveAttribute("aria-pressed", "true");

  await second.click();
  await expect(second).toHaveAttribute("aria-pressed", "true");
  await second.focus();
  await page.keyboard.press("ArrowUp");
  await expect(first).toHaveAttribute("aria-pressed", "true");
  await expect(first).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(first).toHaveAttribute("aria-pressed", "true");
  await expect(first).toBeFocused();

  const application = page.locator(".pdp-application");
  const nextApplication = application.getByRole("button", {
    name: "Show next application step",
  });
  const applicationSwatches = application.getByRole("button", {
    name: /Show application step \d of 3/,
  });
  await nextApplication.click();
  await expect(applicationSwatches.nth(1)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await nextApplication.click();
  await expect(applicationSwatches.nth(2)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await nextApplication.click();
  await expect(applicationSwatches.nth(0)).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await page.goto("/products/treat-03-pdrn-5-ampoule");
  const texture = page.getByTestId("pdp-ingredients-media");
  const disclosure = texture.getByRole("button", {
    name: "FULL INGREDIENTS LIST",
    exact: true,
  });
  await texture.evaluate((node) => {
    node.setAttribute("data-mount-marker", "stable");
  });
  await disclosure.click();
  await expect(disclosure).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.getByRole("button", { name: "Close full ingredients list" }),
  ).toBeFocused();
  await expect(texture).toHaveAttribute("data-mount-marker", "stable");
  await page.keyboard.press("Escape");
  await expect(disclosure).toHaveAttribute("aria-expanded", "false");
  await expect(disclosure).toBeFocused();
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
  const cartThumb = page.locator(".cart-item__thumb").first();
  await expect(cartThumb).toHaveAttribute("data-media-kind", "image");
  await expect(cartThumb.locator("img")).toHaveAttribute(
    "src",
    /cleanse-01-calming-gel-cleanser/,
  );
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

test("PDP sticky purchase bar stays within the video-to-footer bounds", async ({
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
    const videoStart = page.locator("[data-pdp-video-start]");
    const footer = page.locator("#site-footer");
    await expect(
      page.getByRole("region", { name: "TREAT routine video", exact: true }),
    ).toBeAttached();
    await expect(videoStart).toHaveCount(1);
    await expect(footer).toHaveCount(1);
    await expect(page.locator("[data-pdp-purchase-end]")).toHaveCount(0);
    await expect(sticky).toHaveAttribute("data-visible", "false");
    await expect(sticky).toHaveAttribute("aria-hidden", "true");

    await videoStart.evaluate((marker) => {
      const markerTop = window.scrollY + marker.getBoundingClientRect().top;
      window.scrollTo(0, Math.max(0, markerTop - 1));
    });
    await expect(sticky).toHaveAttribute("data-visible", "false");

    await videoStart.evaluate((marker) => {
      const markerTop = window.scrollY + marker.getBoundingClientRect().top;
      window.scrollTo(0, markerTop + 1);
    });
    await expectStickyPurchaseInViewport(sticky);
    if (viewport.width === 1440) {
      await page.reload();
      await expectStickyPurchaseInViewport(sticky);
    }

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

    for (const selector of [
      ".pdp-routine-video",
      ".pdp-profile-split",
      ".pdp-outcome-split",
      ".pdp-application",
      ".pdp-ingredients",
      "#product-details",
      ".pdp-core-routine",
      ".pdp-reviews",
      ".pdp-discovery",
    ]) {
      const section = page.locator(selector);
      if (await section.count()) {
        await section.scrollIntoViewIfNeeded();
        await expectStickyPurchaseInViewport(sticky);
      }
    }

    const showMoreReviews = page.getByRole("button", { name: /show more/i });
    if (await showMoreReviews.count()) {
      await showMoreReviews.click();
      await expectStickyPurchaseInViewport(sticky);
    }

    await page.locator(".pdp-reviews").scrollIntoViewIfNeeded();
    await expectStickyPurchaseInViewport(sticky);
    await page.locator(".pdp-discovery").scrollIntoViewIfNeeded();
    await expectStickyPurchaseInViewport(sticky);

    await footer.evaluate((siteFooter) => {
      const footerTop =
        window.scrollY + siteFooter.getBoundingClientRect().top;
      window.scrollTo(0, footerTop - window.innerHeight - 1);
    });
    await expectStickyPurchaseInViewport(sticky);

    await footer.evaluate((siteFooter) => {
      const footerTop =
        window.scrollY + siteFooter.getBoundingClientRect().top;
      window.scrollTo(0, footerTop - window.innerHeight + 1);
    });
    await expect(sticky).toHaveAttribute("data-visible", "false");
    await expect(sticky).toHaveAttribute("aria-hidden", "true");

    await footer.evaluate((siteFooter) => {
      const footerTop =
        window.scrollY + siteFooter.getBoundingClientRect().top;
      window.scrollTo(0, footerTop - window.innerHeight - 1);
    });
    await expectStickyPurchaseInViewport(sticky);

    await videoStart.evaluate((marker) => {
      const markerTop = window.scrollY + marker.getBoundingClientRect().top;
      window.scrollTo(0, Math.max(0, markerTop - 1));
    });
    await expect(sticky).toHaveAttribute("data-visible", "false");
    await expect(sticky).toHaveAttribute("aria-hidden", "true");
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/products/treat-03-pdrn-5-ampoule");
  const discovery = page.getByRole("region", {
    name: "Recommended products",
    exact: true,
  });
  await discovery.scrollIntoViewIfNeeded();
  await discovery.getByRole("link", { name: "CLEANSE", exact: true }).click();
  await expect(page).toHaveURL(
    /\/products\/cleanse-01-calming-gel-cleanser$/,
  );

  const routedSticky = page.locator(".pdp-sticky-purchase");
  await expect(routedSticky).toHaveAttribute("data-visible", "false");
  await expect(
    routedSticky.locator(".pdp-sticky-purchase__identity strong"),
  ).toHaveText("CLEANSE");
  await expect(
    routedSticky.locator(
      ".pdp-sticky-purchase__variants button[aria-pressed='true']",
    ),
  ).toHaveText("200 mL");

  await page.locator("[data-pdp-video-start]").evaluate((marker) => {
    const markerTop = window.scrollY + marker.getBoundingClientRect().top;
    window.scrollTo(0, markerTop + 1);
  });
  await expectStickyPurchaseInViewport(routedSticky);

  await page.locator("#site-footer").evaluate((footer) => {
    const footerTop = window.scrollY + footer.getBoundingClientRect().top;
    window.scrollTo(0, footerTop - window.innerHeight + 1);
  });
  await expect(routedSticky).toHaveAttribute("data-visible", "false");

  await page.goBack();
  await expect(page).toHaveURL(/\/products\/treat-03-pdrn-5-ampoule$/);
  await expect(
    page.locator(".pdp-sticky-purchase__identity strong"),
  ).toHaveText("TREAT");
  await expectStickyMatchesPageBoundaries(
    page.locator(".pdp-sticky-purchase"),
  );

  await page.goForward();
  await expect(page).toHaveURL(
    /\/products\/cleanse-01-calming-gel-cleanser$/,
  );
  await expect(
    page.locator(".pdp-sticky-purchase__identity strong"),
  ).toHaveText("CLEANSE");
  await expectStickyMatchesPageBoundaries(routedSticky);
});

test("Core PDPs render the complete routine in canonical sequence", async ({
  page,
}) => {
  const coreProducts = [
    {
      slug: "cleanse-01-calming-gel-cleanser",
      step: "01",
      name: "CLEANSE",
    },
    {
      slug: "treat-03-pdrn-5-ampoule",
      step: "02",
      name: "TREAT",
    },
    {
      slug: "seal-05-green-collagen-cream",
      step: "03",
      name: "SEAL",
    },
  ];

  for (const product of coreProducts) {
    await page.goto(`/products/${product.slug}`);

    const routine = page.getByRole("region", {
      name: "The Mei Pelle CORE for clearer, healthier skin.",
    });
    await expect(routine).toBeVisible();
    await expect(routine).toHaveAttribute("data-active-step", product.step);
    await expect(
      routine.getByRole("radio", {
        name: `Show step ${Number(product.step)}, ${product.name}`,
      }),
    ).toHaveAttribute("aria-checked", "true");
    await expect(routine.locator("img")).toHaveCount(3);
    await expect(routine.locator(".pdp-core-routine__visual img")).toHaveCount(0);

    const followsDetails = await page.evaluate(() => {
      const details = document.querySelector(".pdp-editorial-pair--details");
      const routineSection = document.querySelector(".pdp-core-routine");
      return Boolean(
        details &&
          routineSection &&
          details.compareDocumentPosition(routineSection) &
            Node.DOCUMENT_POSITION_FOLLOWING,
      );
    });
    expect(followsDetails).toBe(true);
  }

  await page.goto("/products/refine-02-pore-treatment-pads");
  await expect(page.locator(".pdp-core-routine")).toHaveCount(0);
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
  await page.goto("/products/refine-02-pore-treatment-pads");
  await expect(page.locator(".pdp-application")).toHaveCount(0);
  await expect(page.locator(".pdp-ingredients")).toHaveCount(0);

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
    const use = document.querySelector("#pdp-accordion-use-trigger");
    const ingredients = document.querySelector("#pdp-accordion-ingredients-trigger");
    const details = document.querySelector("#product-details");
    const application = document.querySelector(".pdp-application");
    const ingredientStory = document.querySelector(".pdp-ingredients");
    if (
      !add ||
      !use ||
      !ingredients ||
      !details ||
      !application ||
      !ingredientStory
    ) {
      return null;
    }
    const before = (a: Element, b: Element) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    return {
      addBeforeUse: before(add, use),
      useBeforeIngredients: before(use, ingredients),
      ingredientsBeforeDetails: before(ingredients, details),
      applicationBeforeIngredientStory: before(application, ingredientStory),
      ingredientStoryBeforeDetails: before(ingredientStory, details),
    };
  });
  expect(order).toEqual({
    addBeforeUse: true,
    useBeforeIngredients: true,
    ingredientsBeforeDetails: true,
    applicationBeforeIngredientStory: true,
    ingredientStoryBeforeDetails: true,
  });

  const use = page.getByRole("button", { name: /HOW TO USE/ });
  const ingredients = page.getByRole("button", { name: /KEY INGREDIENTS/ });

  await use.click();
  await expect(use).toHaveAttribute("aria-expanded", "true");

  await ingredients.click();
  await expect(use).toHaveAttribute("aria-expanded", "false");
  await expect(ingredients).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("link", { name: "Explore ingredients" }).click();
  await expect(page).toHaveURL(
    /#pdp-ingredients-treat-03-pdrn-5-ampoule$/,
  );
  await expect(page.locator(".pdp-ingredients")).toBeInViewport();
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
