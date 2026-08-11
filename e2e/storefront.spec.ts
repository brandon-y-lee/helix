import type { Locator, Page } from "@playwright/test";
import { formatPrice } from "@/lib/products";
import type { StorefrontPurchase } from "@/test-support/storefront-journeys";
import { installCartFixture } from "./cart-fixture";
import { expect, test } from "./storefront-fixture";

type HorizontalGeometry = { x: number; width: number };
type ElementGeometry = { bottom: number; left: number; top: number };
type ViewportOrigin = {
  scrollX: number;
  scrollY: number;
  visualOffsetLeft: number;
};

const PRODUCT_CARD_WARM_GRAY = "rgb(103, 100, 94)";
const PRODUCT_CARD_CREAM = "rgb(255, 253, 248)";

async function buttonVisual(locator: Locator) {
  return locator.evaluate((element) => {
    const button = getComputedStyle(element);
    const hoverFill = getComputedStyle(element, "::before");

    return {
      backgroundColor: button.backgroundColor,
      color: button.color,
      hoverFillColor: hoverFill.backgroundColor,
      hoverFillOpacity: hoverFill.opacity,
    };
  });
}

async function storefrontGeometry(page: Page): Promise<HorizontalGeometry> {
  return page.locator(".site-header__bar").evaluate((element) => {
    const { x, width } = element.getBoundingClientRect();
    return { x, width };
  });
}

async function elementGeometry(locator: Locator): Promise<ElementGeometry> {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return {
    bottom: box!.y + box!.height,
    left: box!.x,
    top: box!.y,
  };
}

async function finishAnimations(locator: Locator): Promise<void> {
  await locator.evaluate(async (element) => {
    await Promise.all(
      element
        .getAnimations({ subtree: true })
        .map((animation) => animation.finished.catch(() => undefined)),
    );
  });
}

async function viewportOrigin(page: Page): Promise<ViewportOrigin> {
  return page.evaluate(() => ({
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    visualOffsetLeft: window.visualViewport?.offsetLeft ?? 0,
  }));
}

async function finishDrawerExit(page: Page) {
  const overlay = page.locator(".cart-sheet-overlay");
  await expect(overlay).toHaveCount(1);
  await expect(overlay).toHaveAttribute("data-state", "closed");
  await expect(overlay).toHaveAttribute("aria-hidden", "true");
  await expect(overlay).toHaveAttribute("inert", "");
}

function productCount(products: readonly unknown[]) {
  return `${products.length} ${products.length === 1 ? "product" : "products"}`;
}

async function selectPurchaseVariant(
  page: Page,
  purchase: StorefrontPurchase,
) {
  const variant = page.getByRole("button", {
    name: purchase.variant.label,
    exact: true,
  });
  await variant.click();
  await expect(variant).toHaveAttribute("aria-pressed", "true");
}

async function addProduct(
  page: Page,
  purchase: StorefrontPurchase,
): Promise<{ drawer: Locator; geometryBeforeOpen: HorizontalGeometry }> {
  await page.goto(purchase.product.path);
  await expect(
    page.getByRole("button", { name: /CART \(0\)/ }),
  ).toBeVisible();
  const drawerOverlay = page.locator(".cart-sheet-overlay");
  const drawerPanel = page.locator(".cart-sheet");
  await expect(drawerOverlay).toHaveAttribute("data-state", "closed");
  await expect(drawerPanel).toHaveAttribute("data-state", "closed");
  await expect(drawerPanel).toHaveCount(1);
  const geometryBeforeOpen = await storefrontGeometry(page);
  await selectPurchaseVariant(page, purchase);
  const buyButton = page.locator("[data-pdp-buy-button]");
  await expect(buyButton).toHaveText(purchase.buyLabel);
  await buyButton.click();
  const drawer = page.getByRole("dialog", { name: "Cart" });
  await expect(drawer).toBeVisible();
  await expect(drawer).toHaveAttribute("data-state", "open");
  await expect(drawerPanel).toHaveCount(1);
  expect(
    await page.evaluate(() => ({
      scrollX: window.scrollX,
      visualOffsetLeft: window.visualViewport?.offsetLeft ?? 0,
    })),
  ).toEqual({ scrollX: 0, visualOffsetLeft: 0 });
  await expect(
    drawer
      .getByRole("list", { name: "Cart items" })
      .getByText(purchase.product.displayName, { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /CART \(1\)/ }),
  ).toBeVisible();
  return { drawer, geometryBeforeOpen };
}

test("shop renders live Products and combines filtering with sorting", async ({
  page,
  storefront,
}) => {
  const products = storefront.products();
  const coreProducts = storefront.products("core");
  const beyondProducts = storefront.products("beyondCore");
  const purchasable = storefront.product("purchasable");
  const purchase = storefront.purchase(purchasable);
  const purchasablePrice = storefront.cardPriceLabel(purchasable);
  if (!purchasablePrice) {
    throw new Error("The Purchasable journey is missing Offer presentation.");
  }
  await page.goto("/collections/shop");
  await expect(page.locator(".product-count")).toHaveText(
    productCount(products),
  );
  await expect(page.locator(".product-card")).toHaveCount(products.length);
  await expect(
    page
      .locator(`[data-product-card-slug="${purchasable.slug}"]`)
      .locator(".product-card__quick-trigger"),
  ).toHaveText(purchase.buyLabel);
  await expect(
    page
      .locator(`[data-product-card-slug="${purchasable.slug}"]`)
      .locator(".product-card__price"),
  ).toHaveText(purchasablePrice);

  const filters = page.getByRole("navigation", {
    name: "Shop collections",
  });
  const core = filters.getByRole("link", {
    name: "Core",
    exact: true,
  });
  await core.click();
  await expect(page).toHaveURL(/\/collections\/core$/);
  await expect(core).toHaveAttribute("aria-current", "page");
  await expect(page.locator(".product-count")).toHaveText(
    productCount(coreProducts),
  );
  await expect(
    page.locator(
      `[data-product-card-slug="${storefront.product("beyondCore").slug}"]`,
    ),
  ).toHaveCount(0);

  await page.getByRole("button", { name: "Sort: Featured" }).click();
  await page
    .getByRole("dialog", { name: "Sort products" })
    .getByRole("button", { name: "Name, Z–A" })
    .click();
  const firstCoreByDescendingName = [...coreProducts].sort((a, b) =>
    b.displayName.localeCompare(a.displayName),
  )[0];
  await expect(page.locator(".product-card__display-name").first()).toHaveText(
    firstCoreByDescendingName.displayName,
  );

  const beyond = filters.getByRole("link", {
    name: "Beyond the Core",
    exact: true,
  });
  await beyond.click();
  await expect(page).toHaveURL(/\/collections\/beyond-the-core$/);
  await expect(beyond).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByRole("button", { name: "Sort: Featured" }),
  ).toBeVisible();
  await expect(page.locator(".product-count")).toHaveText(
    productCount(beyondProducts),
  );
  await expect(
    page.locator(
      `[data-product-card-slug="${storefront.product("core").slug}"]`,
    ),
  ).toHaveCount(0);
});

test("shop presents the approved Product, collection, sheet, and footer treatment", async ({
  browserName,
  page,
  storefront,
}) => {
  const purchase = storefront.purchase(storefront.product("purchasable"));
  await installCartFixture(page, storefront.snapshot.products);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/collections/shop");

  const hero = page.locator(".shop-hero__surface");
  const heading = page.getByRole("heading", {
    level: 1,
    name: "raise your baseline",
  });

  const card = page.locator(
    `[data-product-card-slug="${purchase.product.slug}"]`,
  );
  const name = card.locator(".product-card__display-name");
  const productType = card.locator(".product-card__type");
  const price = card.locator(".product-card__price");
  await expect(name).toHaveCSS("color", PRODUCT_CARD_WARM_GRAY);
  await expect(productType).toHaveCSS("color", PRODUCT_CARD_WARM_GRAY);
  await expect(price).toHaveCSS("color", PRODUCT_CARD_WARM_GRAY);
  await name.hover();
  await expect(name).toHaveCSS("text-decoration-line", "none");

  const previewCta = card.getByRole("button", {
    name: `Open quick buy for ${purchase.product.displayName}`,
  });
  await expect(previewCta).toBeVisible();
  await expect(previewCta).toHaveCSS("border-top-width", "0px");
  expect(await buttonVisual(previewCta)).toEqual({
    backgroundColor: PRODUCT_CARD_CREAM,
    color: PRODUCT_CARD_WARM_GRAY,
    hoverFillColor: PRODUCT_CARD_WARM_GRAY,
    hoverFillOpacity: "0",
  });
  await previewCta.hover();
  await expect
    .poll(async () => (await buttonVisual(previewCta)).hoverFillOpacity)
    .toBe("1");
  expect(await buttonVisual(previewCta)).toMatchObject({
    color: "rgb(255, 255, 255)",
    hoverFillColor: PRODUCT_CARD_WARM_GRAY,
  });

  await previewCta.click();
  const finalCta = card.locator("[data-product-card-buy]");
  await expect(finalCta).toBeVisible();
  await card.locator(".product-card__quick-head").hover();
  expect(await buttonVisual(finalCta)).toEqual({
    backgroundColor: PRODUCT_CARD_CREAM,
    color: PRODUCT_CARD_WARM_GRAY,
    hoverFillColor: PRODUCT_CARD_WARM_GRAY,
    hoverFillOpacity: "0",
  });
  await finalCta.hover();
  await expect
    .poll(async () => (await buttonVisual(finalCta)).hoverFillOpacity)
    .toBe("1");
  expect(await buttonVisual(finalCta)).toMatchObject({
    color: "rgb(255, 255, 255)",
    hoverFillColor: PRODUCT_CARD_WARM_GRAY,
  });

  const filters = page.getByRole("navigation", { name: "Shop collections" });
  const selectedChip = filters.getByRole("link", {
    name: "Shop All",
    exact: true,
  });
  const unselectedChip = filters.getByRole("link", {
    name: "Core",
    exact: true,
  });
  await unselectedChip.hover();
  await expect(unselectedChip).toHaveCSS(
    "background-color",
    "rgb(24, 61, 52)",
  );
  await expect(unselectedChip).toHaveCSS("color", "rgb(251, 250, 246)");
  await heading.hover();
  if (browserName === "webkit") {
    await unselectedChip.focus();
  } else {
    await selectedChip.focus();
    await page.keyboard.press("Tab");
  }
  await expect(unselectedChip).toBeFocused();
  await expect(unselectedChip).toHaveCSS(
    "background-color",
    "rgba(103, 100, 94, 0.12)",
  );
  if (browserName !== "webkit") {
    await expect(unselectedChip).toHaveCSS("outline-style", "solid");
  }
  await selectedChip.hover();
  await expect(selectedChip).toHaveCSS("background-color", "rgb(24, 61, 52)");
  await expect(selectedChip).toHaveAttribute("aria-current", "page");
  await heading.hover();
  if (browserName === "webkit") {
    await selectedChip.focus();
  } else {
    await unselectedChip.focus();
    await page.keyboard.press("Shift+Tab");
  }
  await expect(selectedChip).toBeFocused();
  await expect(selectedChip).toHaveCSS("background-color", "rgb(24, 61, 52)");

  const [heroGeometry, headingGeometry] = await Promise.all([
    hero.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { bottom: rect.bottom, left: rect.left };
    }),
    heading.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        bottom: rect.bottom,
        color: getComputedStyle(element).color,
        left: rect.left,
        textAlign: getComputedStyle(element).textAlign,
      };
    }),
  ]);
  expect(headingGeometry.left - heroGeometry.left).toBeCloseTo(44.2, 1);
  expect(heroGeometry.bottom - headingGeometry.bottom).toBeCloseTo(44.2, 1);
  expect(headingGeometry).toMatchObject({
    color: "rgb(17, 19, 18)",
    textAlign: "left",
  });

  await page.getByRole("button", { name: "SEARCH" }).click();
  const search = page.getByRole("dialog", { name: "Search" });
  await expect(search).toBeVisible();
  await expect(
    search.getByText("Discover Mei Pelle", { exact: true }),
  ).toHaveCount(0);
  await search.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: /CART \(0\)/ }).click();
  const cart = page.getByRole("dialog", { name: "Cart" });
  await expect(cart).toBeVisible();
  await expect(
    cart.getByText("Ritual in progress", { exact: true }),
  ).toHaveCount(0);
  await cart.getByRole("button", { name: "Close" }).click();
  await expect(cart).toHaveCount(0);
  await finishDrawerExit(page);

  await expect(page.locator(".site-footer__review-status")).toHaveCSS(
    "border-top-width",
    "0px",
  );
  await expect(page.locator(".site-footer__social-status")).toHaveCSS(
    "border-top-width",
    "0px",
  );
  await expect(page.locator(".site-footer__checkout-status")).toHaveCSS(
    "border-top-width",
    "0px",
  );

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileHeroGeometry = await Promise.all([
    hero.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { bottom: rect.bottom, left: rect.left };
    }),
    heading.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { bottom: rect.bottom, left: rect.left };
    }),
  ]);
  expect(mobileHeroGeometry[1].left - mobileHeroGeometry[0].left).toBeCloseTo(
    23,
    1,
  );
  expect(mobileHeroGeometry[0].bottom - mobileHeroGeometry[1].bottom).toBeCloseTo(
    23,
    1,
  );
  await page.reload();
  await expect(page.locator(".site-footer__accordion").first()).toHaveCSS(
    "border-top-width",
    "1px",
  );
  const mobileWidths = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    footerScrollWidth:
      document.querySelector(".site-footer")?.scrollWidth ?? 0,
    mainScrollWidth: document.querySelector("#content")?.scrollWidth ?? 0,
  }));
  expect(mobileWidths).toMatchObject({
    clientWidth: 390,
    footerScrollWidth: 390,
  });
  // The desktop Safari project keeps its desktop grid layout after a live
  // viewport resize; Chromium owns this responsive overflow assertion.
  if (browserName !== "webkit") {
    expect(mobileWidths.mainScrollWidth).toBe(390);
  }
});

test("PDP resolves canonical data and exposes an available variant", async ({
  page,
  storefront,
}) => {
  const product = storefront.product("richPdp");
  const purchase = storefront.purchase(product);
  const gallery = storefront.gallery(product);
  const serverResponse = await page.request.get(product.path);
  expect(serverResponse.ok()).toBe(true);
  expect(await serverResponse.text()).toContain(
    `<h1>${product.displayName}</h1>`,
  );

  await page.goto(product.path);
  await expect(
    page.getByRole("heading", { level: 1, name: product.displayName }),
  ).toBeVisible();
  await expect(page.locator(".pdp__availability")).toHaveCount(0);
  await selectPurchaseVariant(page, purchase);
  await expect(page.locator("[data-pdp-buy-button]")).toHaveText(
    purchase.buyLabel,
  );

  await expect(page.locator(".pdp__price")).toHaveText(
    formatPrice(purchase.variant.price),
  );
  await expect(
    page.getByRole("region", {
      name: `${product.displayName} routine video`,
      exact: true,
    }),
  ).toBeAttached();
  await expect(
    page.getByRole("region", {
      name: `${product.displayName} customer reviews`,
    }),
  ).toBeVisible();

  await expect(page.locator("[data-pdp-media-thumbnail]")).toHaveCount(
    gallery.length,
  );
  const firstMedia = gallery[0];
  const lastMedia = gallery.at(-1);
  if (!firstMedia || !lastMedia) {
    throw new Error(`Rich PDP Product "${product.slug}" has no gallery media.`);
  }
  const lastView = page.getByRole("button", {
    name: `View ${lastMedia.alt}, media ${lastMedia.index} of ${lastMedia.total}`,
  });
  await lastView.click();
  await expect(lastView).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.locator(`[data-pdp-gallery-state="${lastMedia.index}"]`),
  ).toHaveAttribute("data-state", "active");

  const firstView = page.getByRole("button", {
    name: `View ${firstMedia.alt}, media ${firstMedia.index} of ${firstMedia.total}`,
  });
  await firstView.click();
  await expect(firstView).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.locator(`[data-pdp-gallery-state="${firstMedia.index}"]`),
  ).toHaveAttribute(
    "data-state",
    "active",
  );
});

test("PDP purchase island contains and reveals purchase details across its responsive boundary", async ({
  page,
  storefront,
}) => {
  const product = storefront.product("richPdp");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 821, height: 640 });
  await page.goto(product.path);

  const primary = page.locator("[data-pdp-primary-section]");
  const gallery = primary.locator(".pdp__gallery");
  const purchase = primary.locator(".pdp__purchase");
  const howToUse = purchase.getByRole("button", { name: "HOW TO USE" });

  await expect(
    purchase.getByRole("heading", { level: 1, name: product.displayName }),
  ).toBeVisible();
  await expect(purchase.locator("[data-pdp-buy-button]")).toBeVisible();
  await expect(purchase.locator(".pdp-accordions")).toBeVisible();

  const desktop = await Promise.all([
    gallery.boundingBox(),
    purchase.boundingBox(),
    purchase.evaluate((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return {
        backgroundColor: style.backgroundColor,
        borderRadius: style.borderRadius,
        bottom: rect.bottom,
        clientHeight: element.clientHeight,
        overflowY: style.overflowY,
        position: style.position,
        scrollbarGutter: style.scrollbarGutter,
        scrollHeight: element.scrollHeight,
        top: rect.top,
      };
    }),
  ]);
  const [desktopGallery, desktopPurchase, desktopPresentation] = desktop;
  expect(desktopGallery).not.toBeNull();
  expect(desktopPurchase).not.toBeNull();
  expect(desktopPurchase!.x).toBeGreaterThan(desktopGallery!.x);
  expect(desktopPresentation).toMatchObject({
    backgroundColor: "rgb(223, 229, 223)",
    overflowY: "auto",
    position: "sticky",
    scrollbarGutter: "stable",
  });
  expect(desktopPresentation.borderRadius).not.toBe("0px");
  expect(desktopPresentation.scrollHeight).toBeGreaterThan(
    desktopPresentation.clientHeight,
  );
  expect(desktopPresentation.top).toBeGreaterThan(0);
  expect(desktopPresentation.bottom).toBeLessThan(640);

  await howToUse.focus();
  await page.keyboard.press("Enter");
  await expect(howToUse).toHaveAttribute("aria-expanded", "true");
  await expect(howToUse).toBeFocused();
  await expect
    .poll(() =>
      purchase.evaluate(
        (element) =>
          Math.abs(element.scrollHeight - element.clientHeight - element.scrollTop) <=
          1,
      ),
    )
    .toBe(true);

  await page.setViewportSize({ width: 820, height: 640 });
  await page.goto(product.path);

  const narrowPrimary = page.locator("[data-pdp-primary-section]");
  const narrowGallery = narrowPrimary.locator(".pdp__gallery");
  const narrowMedia = narrowGallery.locator(".pdp__media-frame");
  const narrowPurchase = narrowPrimary.locator(".pdp__purchase");
  const narrowHowToUse = narrowPurchase.getByRole("button", {
    name: "HOW TO USE",
  });
  const narrow = await Promise.all([
    narrowGallery.boundingBox(),
    narrowPurchase.boundingBox(),
    narrowMedia.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        borderBottomLeftRadius: style.borderBottomLeftRadius,
        borderBottomRightRadius: style.borderBottomRightRadius,
        borderTopLeftRadius: style.borderTopLeftRadius,
        borderTopRightRadius: style.borderTopRightRadius,
      };
    }),
    narrowPurchase.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        borderBottomLeftRadius: style.borderBottomLeftRadius,
        borderBottomRightRadius: style.borderBottomRightRadius,
        borderTopLeftRadius: style.borderTopLeftRadius,
        borderTopRightRadius: style.borderTopRightRadius,
        clientHeight: element.clientHeight,
        overflowY: style.overflowY,
        position: style.position,
        scrollHeight: element.scrollHeight,
      };
    }),
  ]);
  const [narrowGalleryBox, narrowPurchaseBox, narrowMediaStyle, narrowPurchaseStyle] =
    narrow;
  expect(narrowGalleryBox).not.toBeNull();
  expect(narrowPurchaseBox).not.toBeNull();
  expect(narrowPurchaseBox!.y).toBeCloseTo(
    narrowGalleryBox!.y + narrowGalleryBox!.height,
    1,
  );
  expect(narrowMediaStyle).toMatchObject({
    borderBottomLeftRadius: "0px",
    borderBottomRightRadius: "0px",
  });
  expect(narrowMediaStyle.borderTopLeftRadius).not.toBe("0px");
  expect(narrowMediaStyle.borderTopRightRadius).not.toBe("0px");
  expect(narrowPurchaseStyle).toMatchObject({
    borderTopLeftRadius: "0px",
    borderTopRightRadius: "0px",
    overflowY: "visible",
    position: "static",
  });
  expect(narrowPurchaseStyle.borderBottomLeftRadius).not.toBe("0px");
  expect(narrowPurchaseStyle.borderBottomRightRadius).not.toBe("0px");
  expect(narrowPurchaseStyle.scrollHeight).toBe(narrowPurchaseStyle.clientHeight);

  await narrowHowToUse.focus();
  const pageOriginBeforeReveal = await viewportOrigin(page);
  await page.keyboard.press("Enter");
  await expect(narrowHowToUse).toHaveAttribute("aria-expanded", "true");
  await expect(narrowHowToUse).toBeFocused();
  expect(await viewportOrigin(page)).toEqual(pageOriginBeforeReveal);
});

test("Quick Buy places Product education before configuration and the final Buy action", async ({
  page,
  storefront,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const shopProducts = storefront.products();
  const offerProducts = shopProducts.filter(
    (product) => product.offer !== null,
  );
  const singleVariantProduct =
    offerProducts.find((product) => product.variants.length === 1) ??
    storefront.product("purchasable");
  const multipleVariantProduct = offerProducts.find(
    (product) => product.variants.length > 1,
  );
  const homepageProducts = [
    storefront.product("core"),
    storefront.product("beyondCore"),
  ].filter((product) => product.offer !== null);
  const cases = [
    ...homepageProducts.map((product) => ({ path: "/", product })),
    { path: "/collections/shop", product: singleVariantProduct },
    ...(multipleVariantProduct
      ? [{ path: "/collections/shop", product: multipleVariantProduct }]
      : []),
  ];

  for (const { path, product } of cases) {
    await page.goto(path);
    const card = page.locator(`[data-product-card-slug="${product.slug}"]`);
    await card.hover();
    await card
      .getByRole("button", {
        name: `Open quick buy for ${product.displayName}`,
      })
      .click();

    const panel = card.locator(".product-card__quick-buy");
    await expect(panel).toHaveAttribute("data-open", "true");
    const details = card.locator(".product-card__quick-details");
    const fullDetails = card.getByRole("link", { name: "Full details" });
    const variants = card.locator(".product-card__quick-variants");
    const finalBuy = card.locator("[data-product-card-buy]");
    await finishAnimations(panel);
    const [panelBox, detailsBox, fullDetailsBox, finalBuyBox] = await Promise.all([
      elementGeometry(panel),
      elementGeometry(details),
      elementGeometry(fullDetails),
      elementGeometry(finalBuy),
    ]);

    expect(fullDetailsBox.top).toBeGreaterThanOrEqual(detailsBox.bottom);
    expect(Math.abs(fullDetailsBox.left - detailsBox.left)).toBeLessThanOrEqual(1);
    if ((await variants.count()) > 0) {
      const variantsBox = await elementGeometry(variants);
      expect(variantsBox.top).toBeGreaterThanOrEqual(fullDetailsBox.bottom);
      expect(finalBuyBox.top).toBeGreaterThanOrEqual(variantsBox.bottom);
    } else {
      expect(finalBuyBox.top).toBeGreaterThanOrEqual(fullDetailsBox.bottom);
    }
    expect(panelBox.bottom - finalBuyBox.bottom).toBeLessThanOrEqual(26);

    await card
      .getByRole("button", {
        name: `Close quick buy for ${product.displayName}`,
      })
      .click();
  }
});

test("PDP add-to-cart persists across reload and reaches the cart page", async ({
  page,
  storefront,
}) => {
  const purchase = storefront.purchase(storefront.product("purchasable"));
  await installCartFixture(page, storefront.snapshot.products);
  const { drawer, geometryBeforeOpen } = await addProduct(page, purchase);
  const drawerOverlay = page.locator(".cart-sheet-overlay");
  expect(await storefrontGeometry(page)).toEqual(geometryBeforeOpen);
  await drawer.getByRole("button", { name: "Close" }).click();
  await expect(drawerOverlay).toHaveAttribute("data-state", "closed");
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
  await expect(
    page.getByText(purchase.product.displayName).first(),
  ).toBeVisible();
  await expect(page.getByRole("list", { name: "Cart items" })).toBeVisible();
  await page.getByRole("button", { name: "Clear cart" }).click();
  await expect(
    page.locator("#content").getByText(/your cart is empty/i),
  ).toBeVisible();
});

test("mobile quick buy Escape preserves the Customer's viewport and focus preview", async ({
  page,
  storefront,
}) => {
  const product = storefront.product("purchasable");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/collections/shop");

  const card = page.locator(`[data-product-card-slug="${product.slug}"]`);
  await card.hover();
  const quickBuy = card.getByRole("button", {
    name: `Open quick buy for ${product.displayName}`,
  });
  await quickBuy.focus();
  await page.keyboard.press("Enter");
  const scrollYBeforeClose = await page.evaluate(() => window.scrollY);
  await page.keyboard.press("Escape");

  await expect(card).toHaveAttribute("data-quick-buy-open", "false");
  await expect(quickBuy).toBeFocused();
  await expect(card).toHaveAttribute("data-visual-state", "preview");
  await page.waitForTimeout(750);
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollYBeforeClose);
});

test("opening another Product's Quick Buy preserves the viewport", async ({
  page,
  storefront,
}) => {
  const [firstProduct, secondProduct] = storefront
    .products()
    .filter((product) => product.offer !== null);
  if (!firstProduct || !secondProduct) {
    test.skip(
      true,
      "The canonical Catalog does not currently expose two collection Products with Offers.",
    );
    return;
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/collections/shop");

  const firstCard = page.locator(
    `[data-product-card-slug="${firstProduct.slug}"]`,
  );
  const secondCard = page.locator(
    `[data-product-card-slug="${secondProduct.slug}"]`,
  );
  await firstCard.hover();
  await firstCard
    .getByRole("button", {
      name: `Open quick buy for ${firstProduct.displayName}`,
    })
    .click();
  await secondCard.hover();
  const secondQuickBuy = secondCard.getByRole("button", {
    name: `Open quick buy for ${secondProduct.displayName}`,
  });
  await secondQuickBuy.scrollIntoViewIfNeeded();
  const scrollYBeforeSwitch = await page.evaluate(() => window.scrollY);
  await secondQuickBuy.click();

  await expect(firstCard).toHaveAttribute("data-quick-buy-open", "false");
  await expect(secondCard).toHaveAttribute("data-quick-buy-open", "true");
  await page.waitForTimeout(750);
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollYBeforeSwitch);
});

test.describe("touch Quick Buy", () => {
  test.use({ hasTouch: true });

  test("close preserves the viewport without pinning desktop preview", async ({
    browserName,
    page,
    storefront,
  }) => {
    test.skip(
      browserName === "webkit",
      "Playwright WebKit resolves this transformed close control to the underlying card link; Chromium and the in-app Browser cover native touch hit-testing.",
    );
    const product = storefront.product("purchasable");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/collections/shop");

    const card = page.locator(`[data-product-card-slug="${product.slug}"]`);
    await card
      .getByRole("button", {
        name: `Open quick buy for ${product.displayName}`,
      })
      .tap();
    const close = card.getByRole("button", {
      name: `Close quick buy for ${product.displayName}`,
    });
    await expect(card).toHaveAttribute("data-visual-state", "quick-buy");
    await expect(card.locator(".product-card__link")).toHaveCSS(
      "pointer-events",
      "none",
    );
    await close.scrollIntoViewIfNeeded();
    const closeBox = await close.boundingBox();
    if (!closeBox) throw new Error("Touch Quick Buy close control has no box.");
    const cardUrl = page.url();
    const scrollYBeforeClose = await page.evaluate(() => window.scrollY);
    await page.touchscreen.tap(
      closeBox.x + closeBox.width / 2,
      closeBox.y + closeBox.height / 2,
    );

    await expect(card).toHaveAttribute("data-quick-buy-open", "false");
    await expect(card).toHaveAttribute("data-visual-state", "default");
    expect(page.url()).toBe(cardUrl);
    await page.waitForTimeout(750);
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollYBeforeClose);
  });
});

test("mobile quick buy opens the cart drawer and restores focus on Escape", async ({
  page,
  storefront,
}) => {
  const purchase = storefront.purchase(storefront.product("purchasable"));
  await installCartFixture(page, storefront.snapshot.products);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/collections/shop");
  await expect(
    page.getByRole("button", { name: /CART \(0\)/ }),
  ).toBeVisible();

  const card = page
    .locator(`[data-product-card-slug="${purchase.product.slug}"]`);
  const quickBuy = card.getByRole("button", {
    name: `Open quick buy for ${purchase.product.displayName}`,
  });
  await expect(quickBuy).toBeVisible();
  await quickBuy.click();

  const finalBuy = card.getByRole("button", {
    name: purchase.buyLabel,
  });
  if (purchase.product.variants.length > 1) {
    for (const variant of purchase.product.variants) {
      const option = card
        .locator(".product-card__quick-option")
        .filter({ hasText: variant.label });
      await expect(option.locator("span")).toHaveText(variant.label);
      await expect(option.locator("small")).toHaveText(
        formatPrice(variant.price),
      );
    }
    await expect(
      card.locator(
        `input[type="radio"][value="${purchase.variant.id}"]`,
      ),
    ).toBeChecked();
  }
  await expect(finalBuy).toHaveText(purchase.buyLabel);
  await finalBuy.scrollIntoViewIfNeeded();
  const viewportOriginBeforeCart = await viewportOrigin(page);
  const standardCardUrl = page.url();
  await finalBuy.click();
  const drawer = page.getByRole("dialog", { name: "Cart" });
  await expect(drawer).toBeVisible();
  const drawerOverlay = page.locator(".cart-sheet-overlay");
  const drawerPanel = page.locator(".cart-sheet");
  await expect(drawerOverlay).toHaveAttribute("data-state", "open");
  await expect(drawerPanel).toHaveAttribute("data-state", "open");
  await expect(drawerPanel).toHaveCount(1);
  expect(await viewportOrigin(page)).toEqual(viewportOriginBeforeCart);
  await expect(card).toHaveAttribute("data-quick-buy-open", "false");
  await expect(card.locator(".product-card__quick-buy")).toHaveAttribute(
    "data-open",
    "false",
  );
  await expect(page).toHaveURL(standardCardUrl);
  await expect(
    page.getByRole("button", { name: /CART \(1\)/ }),
  ).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await finishDrawerExit(page);
  await expect(quickBuy).toBeFocused();
  expect(await viewportOrigin(page)).toEqual(viewportOriginBeforeCart);

  await page.emulateMedia({ reducedMotion: "reduce" });
  const cartTrigger = page.getByRole("button", { name: /CART \(1\)/ });
  await cartTrigger.click();
  await expect(drawer).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await finishDrawerExit(page);
  await expect
    .poll(() => page.evaluate(() => document.body.style.overflow))
    .not.toBe("hidden");
  await expect(cartTrigger).toBeFocused();
});

test("PDP sticky purchase appears after routine video and hides at the footer", async ({
  page,
  storefront,
}) => {
  const purchase = storefront.purchase(storefront.product("richPdp"));
  await installCartFixture(page, storefront.snapshot.products);
  await page.goto(purchase.product.path);
  await selectPurchaseVariant(page, purchase);
  const sticky = page.locator(".pdp-sticky-purchase");
  await expect(sticky).toHaveAttribute("data-visible", "false");

  await page.locator("[data-pdp-video-start]").evaluate((element) => {
    const markerTop = window.scrollY + element.getBoundingClientRect().top;
    window.scrollTo(0, markerTop + 1);
  });
  await expect(sticky).toHaveAttribute("data-visible", "true");
  await expect(sticky).toHaveAttribute("aria-hidden", "false");
  const stickyBuy = sticky.locator("[data-sticky-pdp-buy-button]");
  await expect(stickyBuy).toHaveText(purchase.buyLabel);
  await stickyBuy.click();

  const drawer = page.getByRole("dialog", { name: "Cart" });
  await expect(drawer).toBeVisible();
  await expect(
    drawer
      .getByRole("list", { name: "Cart items" })
      .getByText(purchase.product.displayName, { exact: true }),
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
  const cartPage = page.locator("#content");
  await expect(
    cartPage.getByText("Your cart is temporarily unavailable."),
  ).toBeVisible();
  await expect(cartPage.getByText("Your cart is empty.")).toHaveCount(0);

  available = true;
  await cartPage.getByRole("button", { name: "Try again" }).click();
  await expect(cartPage.getByText("Your cart is empty.")).toBeVisible();
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

test("unknown collection slug returns the storefront not-found response", async ({
  page,
}) => {
  const response = await page.goto("/collections/does-not-exist");
  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { level: 1, name: "Not found" }),
  ).toBeVisible();
});
