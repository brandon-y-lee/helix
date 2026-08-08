import {
  homeBeyondCoreDescriptions,
  homeCoreDescriptions,
} from "../lib/content/home";
import type { Locator } from "@playwright/test";
import type { StorefrontJourneys } from "@/test-support/storefront-journeys";
import { expect, test } from "./storefront-fixture";

const CORE_DESCRIPTION_BY_SLUG = {
  "cleanse-01-calming-gel-cleanser": homeCoreDescriptions.items.cleanse,
  "treat-03-pdrn-5-ampoule": homeCoreDescriptions.items.treat,
  "seal-05-green-collagen-cream": homeCoreDescriptions.items.seal,
} as const;

const BEYOND_DESCRIPTION_BY_SLUG = {
  "refine-02-pore-treatment-pads": homeBeyondCoreDescriptions.items.refine,
  "frame-04-pdrn-eye-cream": homeBeyondCoreDescriptions.items.frame,
  "lift-06-pdrn-mask-system": homeBeyondCoreDescriptions.items.lift,
} as const;

function descriptionForSlug(
  descriptions: Readonly<Record<string, string>>,
  slug: string,
) {
  const description = descriptions[slug];
  if (!description) {
    throw new Error(`No homepage description is defined for Product "${slug}".`);
  }
  return description;
}

type PrinciplePresentation = {
  borderTopColor: string;
  color: string;
  fontWeight: string;
  opacity: string;
  rightMarkerContent: string;
  transitionDuration: string;
  x: number;
  width: number;
};

async function principlePresentation(
  principle: Locator,
): Promise<PrinciplePresentation> {
  return principle.evaluate((element) => {
    const style = getComputedStyle(element);
    const bounds = element.getBoundingClientRect();
    return {
      borderTopColor: style.borderTopColor,
      color: style.color,
      fontWeight: style.fontWeight,
      opacity: style.opacity,
      rightMarkerContent: getComputedStyle(element, "::after").content,
      transitionDuration: style.transitionDuration,
      x: bounds.x,
      width: bounds.width,
    };
  });
}

function transitionDurationMs(value: string): number {
  if (value === "") return 0;
  const firstDuration = value.split(",")[0]?.trim() ?? "0s";
  const duration = Number.parseFloat(firstDuration);
  return firstDuration.endsWith("ms") ? duration : duration * 1_000;
}

async function renderedProducts(
  container: Locator,
  storefront: StorefrontJourneys,
) {
  const links = container.locator(".product-card__link");
  const products = [];
  for (let index = 0; index < await links.count(); index += 1) {
    const link = links.nth(index);
    const href = await link.getAttribute("href");
    if (!href) throw new Error("The homepage rendered a Product without a path.");
    const product = storefront.productAtPath(href);
    await expect(link).toHaveAccessibleName(product.displayName);
    products.push({ link, product });
  }
  return products;
}

test("Explore The Core is locally outlined and inverts for discovery", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const exploreCore = page.getByRole("link", { name: "Explore The Core" });
  const readIndex = page.getByRole("link", { name: "READ THE INDEX" });

  await expect(exploreCore).toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)",
  );
  await expect(exploreCore).toHaveCSS("border-color", "rgb(24, 61, 52)");
  await expect(exploreCore).toHaveCSS("color", "rgb(24, 61, 52)");

  await page.setViewportSize({ width: 1280, height: 900 });
  await exploreCore.hover();
  await expect(exploreCore).toHaveCSS("background-color", "rgb(24, 61, 52)");
  await expect(exploreCore).toHaveCSS("color", "rgb(251, 250, 246)");

  await page.mouse.move(0, 0);
  await exploreCore.focus();
  await expect(exploreCore).toHaveCSS("background-color", "rgb(24, 61, 52)");
  await expect(exploreCore).toHaveCSS("color", "rgb(251, 250, 246)");
  await expect(exploreCore).toHaveCSS("outline-style", "solid");
  await expect(exploreCore).toHaveCSS("outline-width", "2px");

  await expect(readIndex).toHaveCSS("border-color", "rgb(211, 206, 194)");
  await expect(readIndex).toHaveCSS("color", "rgb(17, 19, 18)");
});

test("Core and Beyond descriptions respond to pointer and keyboard discovery", async ({
  page,
  storefront,
}) => {
  await page.goto("/");

  const core = page.getByRole("region", { name: "The Core", exact: true });
  const coreProducts = await renderedProducts(core, storefront);
  const pointer = coreProducts[0];
  const keyboard = coreProducts[1] ?? pointer;
  if (!pointer || !keyboard) {
    throw new Error("The homepage did not render a Core Product.");
  }
  const coreDescription = core.locator(".home-phased-description");
  await expect(coreDescription).toHaveAttribute("aria-live", "polite");
  await expect(coreDescription).toHaveAttribute("aria-atomic", "true");
  await expect(coreDescription).toHaveText(homeCoreDescriptions.default);

  await pointer.link.hover();
  await expect(coreDescription).toHaveText(
    descriptionForSlug(CORE_DESCRIPTION_BY_SLUG, pointer.product.slug),
  );

  await keyboard.link.focus();
  await expect(coreDescription).toHaveText(
    descriptionForSlug(CORE_DESCRIPTION_BY_SLUG, keyboard.product.slug),
  );

  const beyond = page.getByRole("region", {
    name: "Beyond The Core",
    exact: true,
  });
  const beyondProducts = await renderedProducts(beyond, storefront);
  const beyondProduct = beyondProducts[0];
  if (!beyondProduct) {
    throw new Error("The homepage did not render a Beyond The Core Product.");
  }
  const beyondDescription = beyond.locator(".home-phased-description");
  await expect(beyondDescription).toHaveAttribute("aria-live", "polite");
  await expect(beyondDescription).toHaveAttribute("aria-atomic", "true");
  await expect(beyondDescription).toHaveText(homeBeyondCoreDescriptions.default);

  await beyondProduct.link.hover();
  await expect(beyondDescription).toHaveText(
    descriptionForSlug(
      BEYOND_DESCRIPTION_BY_SLUG,
      beyondProduct.product.slug,
    ),
  );

  const beyondKeyboardProduct = beyondProducts[1] ?? beyondProduct;
  await beyondKeyboardProduct.link.focus();
  await expect(beyondDescription).toHaveText(
    descriptionForSlug(
      BEYOND_DESCRIPTION_BY_SLUG,
      beyondKeyboardProduct.product.slug,
    ),
  );
});

test("reduced motion presents Product discovery copy immediately", async ({
  page,
  storefront,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  const core = page.getByRole("region", { name: "The Core", exact: true });
  const [coreProduct] = await renderedProducts(core, storefront);
  if (!coreProduct) {
    throw new Error("The homepage did not render a Core Product.");
  }

  await coreProduct.link.focus();
  const description = core.locator(".home-phased-description");
  await expect(description).toHaveText(
    descriptionForSlug(CORE_DESCRIPTION_BY_SLUG, coreProduct.product.slug),
  );
  expect(
    await description
      .locator(".home-phased-description__character")
      .evaluateAll((characters) =>
        characters.every(
          (character) => getComputedStyle(character).opacity === "1",
        ),
      ),
  ).toBe(true);
});

test("Three Principles selection uses only a persistent 700ms label fade", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: null });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");

  const group = page.getByRole("group", { name: "Mei Pelle principles" });
  const mission = group.getByRole("button", { name: "mission" });
  const innovation = group.getByRole("button", { name: "innovation" });
  const sustainability = group.getByRole("button", {
    name: "sustainability",
  });
  const principles = [mission, innovation, sustainability];

  await expect(mission).toHaveAttribute("aria-pressed", "true");
  await expect(innovation).toHaveCSS("opacity", "0.75");
  await expect(sustainability).toHaveCSS("opacity", "0.75");
  await expect(mission).toHaveCSS("opacity", "1");

  const initialPresentation = await Promise.all(
    principles.map(principlePresentation),
  );
  expect(new Set(initialPresentation.map(({ color }) => color)).size).toBe(1);
  expect(
    new Set(initialPresentation.map(({ fontWeight }) => fontWeight)).size,
  ).toBe(1);
  expect(
    initialPresentation.every(({ transitionDuration }) =>
      transitionDurationMs(transitionDuration) === 700,
    ),
  ).toBe(true);
  expect(
    initialPresentation.every(
      ({ rightMarkerContent }) => rightMarkerContent === "none",
    ),
  ).toBe(true);

  await innovation.hover();
  await expect(innovation).toHaveAttribute("aria-pressed", "true");
  await expect(innovation).toHaveCSS("opacity", "1");
  await page.mouse.move(0, 0);
  await expect(innovation).toHaveAttribute("aria-pressed", "true");

  await sustainability.click();
  await expect(sustainability).toHaveAttribute("aria-pressed", "true");

  await mission.focus();
  await expect(mission).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("ArrowUp");
  await expect(sustainability).toBeFocused();
  await expect(sustainability).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Home");
  await expect(mission).toBeFocused();
  await page.keyboard.press("End");
  await expect(sustainability).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(mission).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(innovation).toBeFocused();
  await expect(innovation).toHaveAttribute("aria-pressed", "true");

  const selectedPresentation = await Promise.all(
    principles.map(principlePresentation),
  );
  expect(
    selectedPresentation.map(({ borderTopColor }) => borderTopColor),
  ).toEqual(initialPresentation.map(({ borderTopColor }) => borderTopColor));
  expect(selectedPresentation.map(({ x }) => x)).toEqual(
    initialPresentation.map(({ x }) => x),
  );
  expect(selectedPresentation.map(({ width }) => width)).toEqual(
    initialPresentation.map(({ width }) => width),
  );
});

test("Three Principles selection is immediate with reduced motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  const group = page.getByRole("group", { name: "Mei Pelle principles" });
  const mission = group.getByRole("button", { name: "mission" });
  const innovation = group.getByRole("button", { name: "innovation" });

  await expect(mission).toHaveCSS("opacity", "1");
  await expect(innovation).toHaveCSS("opacity", "0.75");
  expect(
    transitionDurationMs(
      await innovation.evaluate(
        (element) => getComputedStyle(element).transitionDuration,
      ),
    ),
  ).toBeLessThanOrEqual(1);

  await innovation.click();
  await expect(innovation).toHaveAttribute("aria-pressed", "true");
  await expect(innovation).toHaveCSS("opacity", "1");
  await expect(mission).toHaveCSS("opacity", "0.75");
});

test("Beyond carousel is finite and keyboard operable on mobile", async ({
  page,
  storefront,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const beyond = page.getByRole("region", {
    name: "Beyond The Core",
    exact: true,
  });
  const carousel = beyond.locator(".home-beyond-carousel");
  const products = await renderedProducts(carousel, storefront);
  if (products.length === 0) {
    throw new Error("The homepage did not render a Beyond The Core Product.");
  }
  await expect(carousel).toHaveAttribute("data-active-index", "0");
  await expect(
    beyond.getByRole("button", { name: "Previous product" }),
  ).toHaveCount(0);

  const next = beyond.getByRole("button", { name: "Next product" });
  if (products.length === 1) {
    await expect(next).toHaveCount(0);
    return;
  }
  await next.focus();
  await page.keyboard.press("Enter");
  await expect(carousel).toHaveAttribute("data-active-index", "1");
  await expect(
    beyond.getByRole("button", { name: "Previous product" }),
  ).toBeVisible();

  while (
    (await carousel.getAttribute("data-active-index")) !==
    String(products.length - 1)
  ) {
    await beyond.getByRole("button", { name: "Next product" }).click();
  }
  await expect(carousel).toHaveAttribute(
    "data-active-index",
    String(products.length - 1),
  );
  await expect(
    beyond.getByRole("button", { name: "Next product" }),
  ).toHaveCount(0);
});

test("homepage ingredient discovery lands below the fixed System header", async ({
  page,
}) => {
  await page.goto("/");

  const link = page.getByRole("link", {
    name: "Read about PDRN in the System",
  });
  await expect(link).toHaveAttribute(
    "href",
    "/system#system-ingredient-pdrn",
  );
  await link.click();

  await expect(page).toHaveURL(/\/system#system-ingredient-pdrn$/);
  const ingredient = page.locator("#system-ingredient-pdrn");
  await expect(
    ingredient.getByRole("heading", { name: "PDRN / Sodium DNA" }),
  ).toBeVisible();
  await expect
    .poll(() =>
      ingredient.evaluate((element) => {
        const headerBottom =
          document
            .querySelector(".site-header")
            ?.getBoundingClientRect().bottom ?? 0;
        return element.getBoundingClientRect().top >= headerBottom;
      }),
    )
    .toBe(true);
});

test("PDP discovery excludes the current product and navigates a recommendation", async ({
  page,
  storefront,
}) => {
  const product = storefront.product("richPdp");
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto(product.path);

  const reviews = page.getByRole("region", {
    name: `${product.displayName} customer reviews`,
  });
  const discovery = page.getByRole("region", {
    name: "Recommended products",
  });
  await expect(reviews).toBeAttached();
  await expect(discovery).toBeVisible();

  const firstLink = discovery.locator(".product-card__link").first();
  const href = await firstLink.getAttribute("href");
  expect(href).toMatch(/^\/products\/[\w-]+$/);
  if (!href) throw new Error("Expected a recommended Product path.");
  const recommendedProduct = storefront.productAtPath(href);
  await firstLink.click();

  await expect(page).toHaveURL(new RegExp(`${href}$`));
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: recommendedProduct.displayName,
    }),
  ).toBeVisible();
});
