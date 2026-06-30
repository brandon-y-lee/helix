import { test, expect } from "@playwright/test";

// Homepage merchandising modules are rendered from the seeded Supabase catalog
// (server-side). They are product discovery and positioning surfaces, not
// interactive search, so they do not depend on Algolia.

test("homepage Core Three ladder renders", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "It all starts with three steps." }),
  ).toBeVisible();
  await expect(page.getByText("Cleanse. Treat. Seal.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Cleanse, Treat, Seal." }))
    .toBeVisible();
  await expect(page.getByRole("heading", { name: "Simple Is Not Basic." }))
    .toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Use all three. Or upgrade one layer." }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name:
        "For skin that looks cleaner, more hydrated, more controlled, and less tired by default.",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Add only what solves a real problem." }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Know what each step is doing." }))
    .toBeVisible();
  await expect(page.getByRole("heading", { name: "Make the baseline automatic." }))
    .toBeVisible();
});

test("homepage Core Three products and add-ons resolve by stable slugs", async ({ page }) => {
  await page.goto("/");

  const merchandising = await page.evaluate(() => {
    const clean = (text: string | null | undefined) => text?.replace(/\s+/g, " ").trim() ?? "";
    const sectionByHeading = (heading: string) =>
      Array.from(document.querySelectorAll("section")).find(
        (section) => clean(section.querySelector("h2")?.textContent) === heading,
      );
    const core = sectionByHeading("Cleanse, Treat, Seal.");
    const beyond = sectionByHeading("Add only what solves a real problem.");
    return {
      coreProducts: Array.from(core?.querySelectorAll(".product-card__name") ?? []).map((node) =>
        clean(node.textContent),
      ),
      coreLinks: Array.from(core?.querySelectorAll(".product-card__link") ?? []).map((link) =>
        link.getAttribute("href"),
      ),
      addOnLinks: Array.from(beyond?.querySelectorAll("a") ?? []).map((link) =>
        link.getAttribute("href"),
      ),
      protectText: clean(
        beyond?.querySelector(".home-addon-card--protect")?.textContent,
      ),
      protectButtons: beyond?.querySelector(".home-addon-card--protect")?.querySelectorAll("button")
        .length ?? 0,
    };
  });

  expect(merchandising.coreProducts).toEqual(["CLEANSE", "TREAT", "SEAL"]);
  expect(merchandising.coreLinks).toEqual([
    "/products/cleanse-01-calming-gel-cleanser",
    "/products/treat-03-pdrn-5-ampoule",
    "/products/seal-05-green-collagen-cream",
  ]);
  expect(merchandising.addOnLinks).toContain("/products/refine-02-pore-treatment-pads");
  expect(merchandising.addOnLinks).toContain("/products/frame-04-pdrn-eye-cream");
  expect(merchandising.addOnLinks).toContain("/products/lift-06-pdrn-mask-system");
  expect(merchandising.addOnLinks).toContain("/system#system-protect");
  expect(merchandising.protectText).toContain("COMING SOON");
  expect(merchandising.protectText).toContain("SPF");
  expect(merchandising.protectText).not.toMatch(/\$\d/);
  expect(merchandising.protectButtons).toBe(0);
});

test("Core Three product card navigates to a product detail page", async ({ page }) => {
  await page.goto("/");
  await page.locator('#core-three .product-card__link[href="/products/cleanse-01-calming-gel-cleanser"]').click();
  await expect(page).toHaveURL(/\/products\/cleanse-01-calming-gel-cleanser$/);
  await expect(page.getByRole("heading", { level: 1, name: "CLEANSE" })).toBeVisible();
});

test("PDP complete-the-routine renders and a related product navigates", async ({
  page,
}) => {
  await page.goto("/products/treat-03-pdrn-5-ampoule");
  await expect(
    page.getByRole("heading", { name: "COMPLETE THE SYSTEM" }),
  ).toBeVisible();

  const related = page.locator(".related .product-card__name").first();
  const name = (await related.textContent())?.trim() ?? "";
  expect(name.length).toBeGreaterThan(0);
  await related.click();

  await expect(page).toHaveURL(/\/products\/[\w-]+$/);
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
});
