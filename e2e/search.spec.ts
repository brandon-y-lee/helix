import { expect, test, type Page } from "@playwright/test";

const TREAT_HIT = {
  objectID: "e2e-treat",
  slug: "treat-03-pdrn-5-ampoule",
  displayName: "TREAT",
  cardTagline: "PDRN care for a steadier glow.",
  productType: "Ampoule / Serum",
  status: "available",
  priceMin: 2500,
  priceMax: 2500,
  available: true,
  waitlist: false,
  swatch: ["#dfe4e5", "#7f8f95"],
  placeholderMedia: {
    alt: "TREAT search placeholder surface",
    paletteId: "treat-search",
    palette: {
      start: "#dfe4e5",
      end: "#7f8f95",
      accent: "#244b56",
      surface: "#fffdf8",
      ink: "#111312",
      highlight: "#faf2e8",
    },
  },
};

async function mockAlgolia(page: Page) {
  await page.route(/algolia/i, async (route) => {
    const payload = JSON.parse(route.request().postData() ?? "{}");
    const query = String(payload?.requests?.[0]?.query ?? "").toLowerCase();
    const hits = query.includes("zzz") ? [] : [TREAT_HIT];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        results: [
          {
            hits,
            nbHits: hits.length,
            page: 0,
            nbPages: 1,
            hitsPerPage: 12,
            processingTimeMS: 1,
            query,
          },
        ],
      }),
    });
  });
}

test("Algolia result opens its canonical product detail page", async ({
  page,
}) => {
  await mockAlgolia(page);
  await page.goto("/search");

  await page.getByLabel("Search products").fill("serum");
  await expect(page.getByText(/1 result for/i)).toBeVisible();
  const result = page.getByRole("link", { name: /TREAT/ }).first();
  await expect(result).toContainText("$25.00");
  await result.click();

  await expect(page).toHaveURL(
    /\/products\/treat-03-pdrn-5-ampoule$/,
  );
  await expect(
    page.getByRole("heading", { level: 1, name: "TREAT" }),
  ).toBeVisible();
});

test("search reports a clear no-results state", async ({ page }) => {
  await mockAlgolia(page);
  await page.goto("/search");

  await page.getByLabel("Search products").fill("zzznotathing");
  await expect(page.getByText(/No products match/i)).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Popular searches" }),
  ).toBeVisible();
});

test("header search manages initial focus and restores its trigger on Escape", async ({
  page,
}) => {
  await mockAlgolia(page);
  await page.goto("/");

  const trigger = page
    .getByRole("navigation", { name: "Utilities" })
    .getByRole("button", { name: "SEARCH" });
  const panel = page.locator(".search-sheet");
  const overlay = panel.locator("..");
  await expect(panel).toHaveCount(1);
  await expect(panel).toHaveAttribute("data-state", "closed");
  await expect(overlay).toHaveAttribute("data-state", "closed");
  await expect(overlay).toHaveAttribute("aria-hidden", "true");
  await expect(overlay).toHaveAttribute("inert", "");
  const viewportOriginBeforeOpen = await page.evaluate(() => ({
    scrollX: window.scrollX,
    visualOffsetLeft: window.visualViewport?.offsetLeft ?? 0,
  }));

  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Search" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("data-state", "open");
  await expect(panel).toHaveCount(1);
  const input = dialog.getByLabel("Search products");
  await expect(input).toBeFocused();
  expect(
    await page.evaluate(() => ({
      scrollX: window.scrollX,
      visualOffsetLeft: window.visualViewport?.offsetLeft ?? 0,
    })),
  ).toEqual(viewportOriginBeforeOpen);
  await expect(
    dialog.getByRole("heading", { name: "Popular searches" }),
  ).toBeVisible();
  await input.fill("serum");
  await expect(dialog.getByText(/1 result for/i)).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(panel).toHaveAttribute("data-state", "closed");
  await expect(overlay).toHaveAttribute("data-state", "closed");
  await expect(overlay).toHaveAttribute("aria-hidden", "true");
  await expect(overlay).toHaveAttribute("inert", "");
  await expect
    .poll(() => page.evaluate(() => document.body.style.overflow))
    .not.toBe("hidden");
  await expect(trigger).toBeFocused();

  await trigger.click();
  await expect(dialog).toBeVisible();
  await expect(input).toHaveValue("serum");
  await expect(input).toBeFocused();
  await expect(dialog.getByText(/1 result for/i)).toBeVisible();

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(overlay).toHaveAttribute("data-state", "closed");
  await expect
    .poll(() => page.evaluate(() => document.body.style.overflow))
    .not.toBe("hidden");
  await expect(trigger).toBeFocused();
});
