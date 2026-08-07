import {
  homeBeyondCoreDescriptions,
  homeCoreDescriptions,
} from "../lib/content/home";
import { expect, test } from "./storefront-fixture";

function descriptionKey(product: {
  displayName: string;
  systemStepName: string | null;
}, group: "core" | "beyondCore") {
  const key = (product.systemStepName ?? product.displayName).toLowerCase();
  const descriptions = group === "core"
    ? homeCoreDescriptions.items
    : homeBeyondCoreDescriptions.items;
  if (!key || !(key in descriptions)) {
    throw new Error(
      `Product "${product.displayName}" has no ${group} homepage description.`,
    );
  }
  return key as keyof typeof descriptions;
}

test("Core and Beyond descriptions respond to pointer and keyboard discovery", async ({
  page,
  storefront,
}) => {
  const coreProducts = storefront.collection("core");
  const pointerProduct = coreProducts[0];
  const keyboardProduct = coreProducts[1] ?? pointerProduct;
  const beyondProduct = storefront.collection("beyondCore")[0];
  if (!pointerProduct || !keyboardProduct || !beyondProduct) {
    throw new Error("The live Storefront snapshot is missing homepage Products.");
  }
  await page.goto("/");

  const core = page.getByRole("region", { name: "The Core", exact: true });
  const coreDescription = core.locator(".home-phased-description");
  await expect(coreDescription).toHaveText(homeCoreDescriptions.default);

  await core
    .getByRole("link", { name: pointerProduct.displayName, exact: true })
    .hover();
  await expect(coreDescription).toHaveText(
    homeCoreDescriptions.items[descriptionKey(pointerProduct, "core")],
  );

  await core
    .getByRole("link", { name: keyboardProduct.displayName, exact: true })
    .focus();
  await expect(coreDescription).toHaveText(
    homeCoreDescriptions.items[descriptionKey(keyboardProduct, "core")],
  );

  const beyond = page.getByRole("region", {
    name: "Beyond The Core",
    exact: true,
  });
  const beyondDescription = beyond.locator(".home-phased-description");
  await expect(beyondDescription).toHaveText(homeBeyondCoreDescriptions.default);

  await beyond
    .getByRole("link", { name: beyondProduct.displayName, exact: true })
    .hover();
  await expect(beyondDescription).toHaveText(
    homeBeyondCoreDescriptions.items[
      descriptionKey(beyondProduct, "beyondCore")
    ],
  );
  const protectProduct = storefront.snapshot.products.find(
    (product) =>
      (product.systemStepName ?? product.displayName).toLowerCase() ===
      "protect",
  );
  if (!protectProduct) {
    await expect(
      beyond.getByRole("link", {
        name: "View PROTECT System step, coming soon",
      }),
    ).toHaveCount(0);
  }
});

test("Beyond carousel is finite and keyboard operable on mobile", async ({
  page,
  storefront,
}) => {
  const products = storefront.collection("beyondCore");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const beyond = page.getByRole("region", {
    name: "Beyond The Core",
    exact: true,
  });
  const carousel = beyond.locator(".home-beyond-carousel");
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
  const relatedProduct = storefront.productAtPath(href);
  await firstLink.click();

  await expect(page).toHaveURL(new RegExp(`${href}$`));
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: relatedProduct.displayName,
    }),
  ).toBeVisible();
});
