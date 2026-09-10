import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./storefront-fixture";

async function expectNoDocumentOverflow(page: Page) {
  const widths = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(widths.document).toBeLessThanOrEqual(widths.viewport);
}

async function expectAnchorBelowHeader(target: Locator) {
  await expect.poll(async () => target.evaluate((element) => {
    const headerHeight = Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue("--site-header-height"),
    );
    const top = element.getBoundingClientRect().top;
    return top - headerHeight >= 16 && top < 160;
  })).toBe(true);
}

test("phone FAQ categories reveal the hash selection and keep native answers usable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/faq#policies");

  const navigation = page.getByRole("navigation", { name: "FAQ categories" });
  const policies = navigation.getByRole("link", { name: "Policies", exact: true });
  await expect(policies).toHaveAttribute("aria-current", "location");
  await expect(navigation.locator('[aria-current="location"]')).toHaveCount(1);
  await expect.poll(async () => navigation.evaluate((element) => {
    const selected = element.querySelector('[aria-current="location"]')!;
    const nav = element.getBoundingClientRect();
    const link = selected.getBoundingClientRect();
    return element.scrollLeft > 0 && link.left >= nav.left - 1 && link.right <= nav.right + 1;
  })).toBe(true);

  const geometry = await navigation.evaluate((element) => ({
    width: element.clientWidth,
    scrollWidth: element.scrollWidth,
    links: Array.from(element.querySelectorAll("a"), (link) => ({
      top: link.getBoundingClientRect().top,
      height: link.getBoundingClientRect().height,
    })),
  }));
  expect(geometry.scrollWidth).toBeGreaterThan(geometry.width);
  for (const link of geometry.links) {
    expect(link.top).toBeCloseTo(geometry.links[0].top, 1);
    expect(link.height).toBeGreaterThanOrEqual(44);
  }
  await expectAnchorBelowHeader(page.locator("#policies"));
  await expectNoDocumentOverflow(page);

  // Each category retains its original first-answer-open default.
  const categories = page.locator(".faq-category");
  await expect(categories).toHaveCount(8);
  for (const category of await categories.all()) {
    await expect(category.locator("details[open]")).toHaveCount(1);
    await expect(category.locator("details").first()).toHaveAttribute("open", "");
  }

  const products = navigation.getByRole("link", { name: "Products", exact: true });
  await products.click();
  await expect(page).toHaveURL(/\/faq#products$/);
  await expect(products).toHaveAttribute("aria-current", "location");
  await expect(policies).not.toHaveAttribute("aria-current", "location");
  await expectAnchorBelowHeader(page.locator("#products"));

  const firstAnswer = page.locator("#products details").first();
  const summary = firstAnswer.locator("summary");
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(firstAnswer).not.toHaveAttribute("open");
  await expect(summary).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(firstAnswer).toHaveAttribute("open", "");
  await expect(firstAnswer.locator("p")).toBeVisible();
  expect((await summary.boundingBox())!.height).toBeGreaterThanOrEqual(48);
});

test("legal Contents uses a closed phone disclosure and exposes one navigation across breakpoints", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/terms");

  const contents = page.locator("details.legal-toc--mobile");
  const summary = contents.locator("summary");
  const navigation = page.getByRole("navigation", { name: "Terms of Service sections" });
  await expect(summary).toHaveText("Contents");
  await expect(contents).not.toHaveAttribute("open");
  await expect(navigation).toHaveCount(0);
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(contents).toHaveAttribute("open", "");
  await expect(navigation).toHaveCount(1);
  await page.keyboard.press("Tab");
  await expect(navigation.getByRole("link").first()).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/terms#publication-status$/);
  await expectAnchorBelowHeader(page.locator("#publication-status"));
  await expectNoDocumentOverflow(page);

  await page.setViewportSize({ width: 720, height: 1024 });
  await expect(summary).toBeVisible();
  await expect(navigation).toHaveCount(1);
  await expect(contents.getByRole("navigation")).toBeVisible();
  await expect(page.locator(".legal-toc--desktop")).toBeHidden();

  await page.setViewportSize({ width: 721, height: 1024 });
  await expect(contents).toBeHidden();
  await expect(navigation).toHaveCount(1);
  await expect(page.locator(".legal-toc--desktop")).toBeVisible();

  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(contents).toBeHidden();
  await expect(navigation).toHaveCount(1);
  const columns = await page.locator(".legal-shell").evaluate((element) => ({
    contentsRight: element.querySelector(".legal-toc--desktop")!.getBoundingClientRect().right,
    documentLeft: element.querySelector(".legal-document")!.getBoundingClientRect().left,
  }));
  expect(columns.contentsRight).toBeLessThan(columns.documentLeft);
  await expectNoDocumentOverflow(page);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(contents).toHaveAttribute("open", "");
  await expect(navigation).toHaveCount(1);
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(navigation).toHaveCount(0);
  await expect(summary).toBeFocused();
});

test("phone cookie details scroll by keyboard inside a labeled region", async ({ page }) => {
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/cookie-policy");
    const region = page.getByRole("region", { name: "Cookie categories", exact: true });
    await expect(page.getByText(/scroll horizontally/i)).toBeVisible();
    await expect(region.getByRole("columnheader")).toHaveText([
      "Category", "Status", "Examples", "Purpose", "Optional",
    ]);
    await region.focus();
    await page.keyboard.press("Shift+Tab");
    await expect(region).not.toBeFocused();
    await page.keyboard.press("Tab");
    await expect(region).toBeFocused();
    const geometry = await region.evaluate((element) => ({
      width: element.clientWidth,
      scrollWidth: element.scrollWidth,
      outlineStyle: getComputedStyle(element).outlineStyle,
      outlineWidth: Number.parseFloat(getComputedStyle(element).outlineWidth),
    }));
    expect(geometry.scrollWidth).toBeGreaterThan(geometry.width);
    expect(geometry.outlineStyle).not.toBe("none");
    expect(geometry.outlineWidth).toBeGreaterThanOrEqual(2);
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => region.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
    await expectNoDocumentOverflow(page);
  }
});

for (const access of [
  { path: "/account/sign-in?error=expired-link", heading: "Sign in", action: "Sign in", firstField: "Email" },
  { path: "/account/sign-up", heading: "Create Account", action: "Create account", firstField: "First name" },
  { path: "/account/forgot-password", heading: "Reset password", action: "Send reset link", firstField: "Email" },
]) {
  test(`phone ${access.heading} form starts near the panel top and fits narrow screens`, async ({ page }) => {
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(access.path);
      await page.evaluate(() => document.fonts.ready);
      const panel = page.locator(".account-access-layout__form-panel");
      const form = panel.locator(".account-form");
      await expect(panel.getByRole("heading", { name: access.heading, exact: true })).toBeVisible();
      await expect(page.locator(".account-access-layout__visual")).toBeHidden();
      if (access.path.includes("expired-link")) {
        await expect(form.getByRole("alert")).toHaveText(
          "This sign-in link expired. Request a new one and try again.",
        );
      }

      const geometry = await panel.evaluate((element) => {
        const panel = element.getBoundingClientRect();
        const content = element.querySelector(".account-access-layout__form")!.getBoundingClientRect();
        const heading = element.querySelector("h1")!.getBoundingClientRect();
        const action = element.querySelector('button[type="submit"]')!.getBoundingClientRect();
        return {
          leadingSpace: heading.top - panel.top,
          trailingSpace: panel.bottom - content.bottom,
          panelLeft: panel.left,
          panelRight: panel.right,
          headingRight: heading.right,
          action: { left: action.left, right: action.right, height: action.height },
          inputs: Array.from(element.querySelectorAll('input:not([type="hidden"])'), (input) => ({
            left: input.getBoundingClientRect().left,
            right: input.getBoundingClientRect().right,
            fontSize: Number.parseFloat(getComputedStyle(input).fontSize),
          })),
        };
      });
      expect(geometry.leadingSpace).toBeGreaterThanOrEqual(24);
      expect(geometry.leadingSpace).toBeLessThanOrEqual(33);
      expect(geometry.trailingSpace).toBeLessThanOrEqual(33);
      expect(geometry.headingRight).toBeLessThanOrEqual(geometry.panelRight);
      expect(geometry.action.left).toBeGreaterThanOrEqual(geometry.panelLeft);
      expect(geometry.action.right).toBeLessThanOrEqual(geometry.panelRight);
      expect(geometry.action.height).toBeGreaterThanOrEqual(44);
      for (const input of geometry.inputs) {
        expect(input.fontSize).toBeGreaterThanOrEqual(16);
        expect(input.left).toBeGreaterThanOrEqual(geometry.panelLeft);
        expect(input.right).toBeLessThanOrEqual(geometry.panelRight);
      }
      await expectNoDocumentOverflow(page);

      await form.getByLabel(access.firstField, { exact: true }).focus();
      await page.keyboard.press("Tab");
      const fields = form.locator('input:not([type="hidden"])');
      if (await fields.count() > 1) {
        await expect(fields.nth(1)).toBeFocused();
      } else {
        await expect(form.getByRole("button", { name: access.action, exact: true })).toBeFocused();
      }
    }
  });
}

test("account access keeps the centered tablet panel and desktop image composition", async ({ page }) => {
  await page.setViewportSize({ width: 721, height: 1000 });
  await page.goto("/account/sign-in");
  const panel = page.locator(".account-access-layout__form-panel");
  const visual = page.locator(".account-access-layout__visual");
  await expect(visual).toBeHidden();
  const tablet = await panel.evaluate((element) => {
    const panel = element.getBoundingClientRect();
    const content = element.querySelector(".account-access-layout__form")!.getBoundingClientRect();
    return { leading: content.top - panel.top, trailing: panel.bottom - content.bottom };
  });
  expect(tablet.leading).toBeGreaterThan(64);
  expect(tablet.leading).toBeCloseTo(tablet.trailing, 1);

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => document.fonts.ready);
  await expect(visual).toBeVisible();
  const imageBox = (await visual.boundingBox())!;
  const panelBox = (await panel.boundingBox())!;
  expect(imageBox.x + imageBox.width).toBeCloseTo(panelBox.x, 1);
  expect(imageBox.width).toBeCloseTo(panelBox.width, 1);
  expect(imageBox.height).toBeCloseTo(panelBox.height, 1);
  const desktop = await panel.evaluate((element) => {
    const panel = element.getBoundingClientRect();
    const content = element.querySelector(".account-access-layout__form")!.getBoundingClientRect();
    return { leading: content.top - panel.top, trailing: panel.bottom - content.bottom };
  });
  expect(desktop.leading).toBeCloseTo(desktop.trailing, 1);
  await expectNoDocumentOverflow(page);
});
