import { expect, test, type Locator, type Page } from "@playwright/test";

const TREAT_PATH = "/products/treat-03-pdrn-5-ampoule";

async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      ),
    )
    .toBeLessThanOrEqual(1);
}

async function expectGridColumns(grid: Locator, count: number) {
  await expect
    .poll(() =>
      grid.evaluate(
        (element) =>
          getComputedStyle(element).gridTemplateColumns
            .split(" ")
            .filter(Boolean).length,
      ),
    )
    .toBe(count);
}

test("homepage product layout switches between desktop and mobile modes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const coreGrid = page.locator("#core-three .product-grid");
  await expect(coreGrid.locator(".product-card")).toHaveCount(3);
  await expectGridColumns(coreGrid, 3);
  await expectNoHorizontalOverflow(page);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expectGridColumns(coreGrid, 1);
  await expect(
    page.getByRole("region", { name: "Beyond The Core", exact: true }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("shop grid keeps a usable representative desktop and mobile layout", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/products");
  const grid = page.locator(".shop-grid-shell .product-grid");
  await expect(grid.locator(".product-card")).toHaveCount(6);
  await expectGridColumns(grid, 3);
  await expectNoHorizontalOverflow(page);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expectGridColumns(grid, 2);
  await expectNoHorizontalOverflow(page);
});

test("PDP panels split on desktop, stack on mobile, and preserve review dividers", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(TREAT_PATH);
  await expectGridColumns(page.locator(".pdp"), 2);
  await expectGridColumns(
    page.locator('[data-pdp-panel-row="profile"]'),
    2,
  );
  await expect(page.locator("[data-review-row]")).toHaveCount(2);
  await expect(page.locator("[data-review-row]").first()).toHaveAttribute(
    "data-review-divider",
    "true",
  );
  await expect(page.locator("[data-review-row]").last()).toHaveAttribute(
    "data-review-divider",
    "false",
  );
  await expectNoHorizontalOverflow(page);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expectGridColumns(page.locator(".pdp"), 1);
  await expectGridColumns(
    page.locator('[data-pdp-panel-row="profile"]'),
    1,
  );
  await expectNoHorizontalOverflow(page);
});

test("PDP panel breakpoint changes once at the 820px boundary", async ({
  page,
}) => {
  await page.setViewportSize({ width: 820, height: 900 });
  await page.goto(TREAT_PATH);
  const profile = page.locator('[data-pdp-panel-row="profile"]');
  await expectGridColumns(profile, 1);

  await page.setViewportSize({ width: 821, height: 900 });
  await expectGridColumns(profile, 2);
  await expectNoHorizontalOverflow(page);
});
