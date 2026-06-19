import { expect, test } from "@playwright/test";

const methodStepIds = [
  "step-reset",
  "step-refine",
  "step-recode",
  "step-frame",
  "step-seal",
  "step-lift",
] as const;

const expectedSequence = [
  "01 RESET",
  "02 REFINE",
  "03 RECODE",
  "04 FRAME",
  "05 SEAL",
  "06 PROTECT",
  "07 LIFT",
] as const;

test("primary navigation reaches Method and About editorial pages", async ({ page }) => {
  await page.goto("/");
  const primaryNav = page.getByRole("navigation", { name: "Primary" });

  await primaryNav.getByRole("link", { name: "METHOD" }).click();
  await expect(page).toHaveURL(/\/method$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "THE METHOD." }),
  ).toBeVisible();

  await primaryNav.getByRole("link", { name: "ABOUT" }).click();
  await expect(page).toHaveURL(/\/about$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "TWO CITIES. ONE STANDARD." }),
  ).toBeVisible();
});

test("Method page renders the full routine without treating SPF as merchandise", async ({
  page,
}) => {
  await page.goto("/method");

  const hero = page.locator(".method-hero");
  await expect(hero.getByText("Mei-Pelle", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 1, name: "THE METHOD." }),
  ).toBeVisible();
  await expect(
    hero.getByText("A system for clearer, healthier, beautiful skin", { exact: true }),
  ).toBeVisible();
  await expect(hero.locator(".editorial-hue-field")).toBeVisible();
  await expect(hero).not.toContainText("01");
  await expect(hero).not.toContainText("SPF");
  await expect(hero.locator(".method-hero__diagram")).toHaveCount(0);

  const heroWidth = await hero.evaluate((node) => node.getBoundingClientRect().width);
  const viewportWidth = await page.evaluate(() => window.innerWidth);
  expect(heroWidth).toBeGreaterThan(viewportWidth - 96);

  await expect(page.getByRole("heading", { name: /Run the routine by timing/i })).toBeVisible();
  await expect(page.locator(".routine-card")).toHaveCount(3);
  await expect(page.getByText("AM", { exact: true })).toBeVisible();
  await expect(page.getByText("PM", { exact: true })).toBeVisible();
  await expect(page.getByText("WEEKLY", { exact: true })).toBeVisible();

  for (const label of expectedSequence) {
    await expect(page.locator(".method-index__link span", { hasText: label })).toBeVisible();
  }

  for (const id of methodStepIds) {
    const step = page.locator(`#${id}`);
    await expect(step).toBeVisible();
    await expect(step.getByRole("heading", { name: "WHAT" })).toBeVisible();
    await expect(step.getByRole("heading", { name: "WHY" })).toBeVisible();
    await expect(step.getByRole("heading", { name: "HOW" })).toBeVisible();
    await expect(step.getByRole("heading", { name: "FORMULA FOCUS" })).toBeVisible();
    await expect(step.getByRole("link", { name: /View / })).toHaveAttribute(
      "href",
      /\/products\//,
    );
  }

  const protect = page.locator("#step-protect");
  await expect(protect).toBeVisible();
  await expect(protect.getByText("STEP 06")).toBeVisible();
  await expect(protect.getByRole("heading", { name: "PROTECT" })).toBeVisible();
  await expect(protect.getByText("COMING SOON")).toBeVisible();
  await expect(protect.getByRole("heading", { name: "WHAT" })).toBeVisible();
  await expect(protect.getByRole("heading", { name: "WHY" })).toBeVisible();
  await expect(protect.getByRole("heading", { name: "HOW" })).toBeVisible();
  await expect(protect.getByRole("heading", { name: "FORMULA FOCUS" })).toBeVisible();
  await expect(protect.getByRole("button", { name: /add to cart/i })).toHaveCount(0);
  await expect(protect.getByRole("link", { name: /view|shop|buy|protect/i })).toHaveCount(0);
  await expect(protect).not.toContainText(/\$\d/);

  const amRoutine = page.locator("#routine-am");
  const pmRoutine = page.locator("#routine-pm");
  const weeklyRoutine = page.locator("#routine-weekly");
  await expect(amRoutine).toContainText("PROTECT");
  await expect(pmRoutine).not.toContainText("PROTECT");
  await expect(weeklyRoutine).toContainText("LIFT");
  await expect(weeklyRoutine).toContainText("07");
  await expect(page.locator("#step-lift").getByText("STEP 07")).toBeVisible();

  await expect(page.locator("#step-refine")).not.toContainText("THE RULE:");
  await expect(page.locator("#step-recode")).not.toContainText("ADVANCED DOES NOT MEAN AGGRESSIVE");

  await expect(page.getByRole("heading", { name: "KNOW WHAT YOU’RE USING." })).toBeVisible();
  await expect(page.getByText("INGREDIENT LITERACY")).toHaveCount(0);
  await expect(page.getByText(/Composition, mechanism/i)).toHaveCount(0);
  await expect(page.locator(".ingredient-card")).not.toHaveCount(0);
  await expect(page.getByText("INCI / IDENTITY").first()).toBeVisible();
  await expect(page.getByText("MECHANISM").first()).toBeVisible();
  await expect(page.getByText("SKIN RELEVANCE").first()).toBeVisible();
  await expect(page.locator(".ingredient-card small")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(
    "More steps are not inherently better. Order, purpose, and restraint matter.",
  );
  await expect(page.locator("body")).not.toContainText(
    "Only ingredients present in the active Mei-Pelle catalog appear here.",
  );

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  expect(hasHorizontalOverflow).toBe(false);
});

test("skip link stays hidden during overscroll and appears on keyboard focus", async ({
  page,
}) => {
  await page.goto("/method");

  const skipLink = page.locator(".skip-link");
  await expect(skipLink).toHaveText("Skip to main content");

  await page.mouse.wheel(0, -800);
  await expect.poll(async () => {
    return skipLink.evaluate((node) => {
      const styles = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return {
        clipPath: styles.clipPath,
        pointerEvents: styles.pointerEvents,
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        paddingTop: styles.paddingTop,
        hasTransparentBackground: ["rgba(0, 0, 0, 0)", "transparent"].includes(
          styles.backgroundColor,
        ),
      };
    });
  })
    .toEqual({
      clipPath: "inset(50%)",
      pointerEvents: "none",
      width: 1,
      height: 1,
      paddingTop: "0px",
      hasTransparentBackground: true,
    });

  await page.keyboard.press("Tab");
  await expect(skipLink).toBeFocused();
  await expect.poll(async () => {
    return skipLink.evaluate((node) => {
      const styles = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return {
        clipPath: styles.clipPath,
        pointerEvents: styles.pointerEvents,
        width: rect.width > 1,
        height: rect.height > 1,
        hasVisibleColor: styles.color !== "rgba(0, 0, 0, 0)",
      };
    });
  })
    .toEqual({
      clipPath: "none",
      pointerEvents: "auto",
      width: true,
      height: true,
      hasVisibleColor: true,
    });

  await page.keyboard.press("Enter");
  await expect(page.locator("#content")).toBeFocused();
});

test("Method product links navigate to live product detail pages", async ({ page }) => {
  await page.goto("/method");
  await page.locator("#step-recode").getByRole("link", { name: /View RECODE/ }).click();

  await expect(page).toHaveURL(/\/products\/recode-03-pdrn-5-ampoule$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "RECODE" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /Add to cart/ })).toBeVisible();
});

test("About page keeps the brand story editorial and claim-safe", async ({ page }) => {
  await page.goto("/about");

  await expect(
    page.getByRole("heading", { level: 1, name: "TWO CITIES. ONE STANDARD." }),
  ).toBeVisible();
  await expect(page.getByText("SEOUL", { exact: true })).toBeVisible();
  await expect(page.getByText("LOS ANGELES", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "MEN DESERVE A BETTER SYSTEM." }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "THE STANDARD." })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "PURPOSEFUL COMPOUNDS. NO EMPTY STATUS." }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "LESS, DONE BETTER." })).toBeVisible();
  await expect(page.locator(".about-hero .editorial-hue-field")).toBeVisible();
  await expect(page.locator(".method-index")).toHaveCount(0);

  const bodyText = (await page.locator("body").innerText()).toLowerCase();
  expect(bodyText).not.toContain("founder");
  expect(bodyText).not.toContain("advisor");
  expect(bodyText).not.toContain("dermatologist approved");
  expect(bodyText).not.toContain("certified sustainable");

  await page.getByRole("link", { name: /learn the method/i }).click();
  await expect(page).toHaveURL(/\/method$/);
});

test("editorial pages remain usable in the mobile header layout", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await page.getByRole("button", { name: "Menu" }).click();
  const menu = page.getByRole("dialog", { name: "Menu" });
  await expect(menu).toBeVisible();
  await menu.getByRole("link", { name: "ABOUT" }).click();
  await expect(page).toHaveURL(/\/about$/);
  await expect(menu).toHaveCount(0);
  await expect(
    page.getByRole("heading", { level: 1, name: "TWO CITIES. ONE STANDARD." }),
  ).toBeVisible();

  await page.goto("/method");
  await expect(
    page.getByText("A system for clearer, healthier, beautiful skin", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".method-index")).toBeVisible();
  await page.locator(".method-index a", { hasText: "RECODE" }).click();
  await expect(page.locator("#step-recode")).toBeInViewport();
  await expect(page.locator("#step-protect").getByText("COMING SOON")).toBeVisible();

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  expect(hasHorizontalOverflow).toBe(false);
});
