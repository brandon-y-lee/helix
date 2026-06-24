import { test, expect } from "@playwright/test";

// Discovery / merchandising modules are rendered from the seeded Supabase
// catalog (server-side) — they are product discovery, not interactive search,
// so they do not depend on Algolia.

test("homepage discovery modules render", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Shop by collection" }),
  ).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Featured" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Build your daily routine" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "New arrivals" }),
  ).toBeVisible();
});

test("homepage Method presets drive Featured and Build Your Routine", async ({ page }) => {
  await page.goto("/");

  const merchandising = await page.evaluate(() => {
    const clean = (text: string | null | undefined) => text?.replace(/\s+/g, " ").trim() ?? "";
    const sectionByHeading = (heading: string) =>
      Array.from(document.querySelectorAll("section")).find(
        (section) => clean(section.querySelector("h2")?.textContent) === heading,
      );
    const featured = sectionByHeading("Featured");
    const routine = sectionByHeading("Build your daily routine");
    return {
      featured: Array.from(featured?.querySelectorAll(".product-card__name") ?? []).map((node) =>
        clean(node.textContent),
      ),
      routine: Array.from(routine?.querySelectorAll(".routine-step__name") ?? []).map((node) =>
        clean(node.textContent),
      ),
      routineLinks: Array.from(routine?.querySelectorAll("a") ?? []).map((link) =>
        link.getAttribute("href"),
      ),
      protectText: clean(
        routine?.querySelector(".routine-step--protect")?.textContent,
      ),
      protectButtons: routine?.querySelector(".routine-step--protect")?.querySelectorAll("button")
        .length ?? 0,
    };
  });

  expect(merchandising.featured).toEqual(["RESET", "RECODE", "SEAL"]);
  expect(merchandising.routine).toEqual(["RESET", "RECODE", "SEAL", "PROTECT"]);
  expect(merchandising.routineLinks).toContain("/method");
  expect(merchandising.routineLinks).toContain("/method#step-protect");
  expect(merchandising.protectText).toContain("COMING SOON");
  expect(merchandising.protectText).toContain("Final morning SPF step");
  expect(merchandising.protectText).not.toMatch(/\$\d/);
  expect(merchandising.protectButtons).toBe(0);
});

test("routine step navigates to a product detail page", async ({ page }) => {
  await page.goto("/");
  await page.locator('.routine-step__link[href^="/products/"]').first().click();
  await expect(page).toHaveURL(/\/products\/[\w-]+$/);
  await expect(page.locator("h1")).toBeVisible();
});

test("PDP complete-the-routine renders and a related product navigates", async ({
  page,
}) => {
  await page.goto("/products/recode-03-pdrn-5-ampoule");
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
