import type { Page } from "@playwright/test";
import { expect, test } from "./storefront-fixture";
import {
  expectWhiteCanvas,
} from "./surface-assertions";

async function expectNoDocumentOverflow(page: Page) {
  const widths = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(widths.document).toBeLessThanOrEqual(widths.viewport);
}

test("phone FAQ categories clear the sticky rail and keep native answers usable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/faq#policies");
  const navigation = page.getByRole("navigation", { name: "FAQ categories" });
  const policies = navigation.getByRole("link", { name: "Policies", exact: true });
  const products = navigation.getByRole("link", { name: "Products", exact: true });
  const expectClearance = async (id: string) => {
    await expect.poll(async () => page.locator(id).first().evaluate((element) => {
      const nav = document.querySelector('.faq-category-nav')!.getBoundingClientRect();
      return element.getBoundingClientRect().top - nav.bottom;
    })).toBeGreaterThanOrEqual(20);
  };
  await expectWhiteCanvas(page);
  await expect(page.locator('.faq-categories')).toHaveCSS('background-color', 'rgb(241, 240, 237)');
  await expect(policies).toHaveAttribute("aria-current", "location");
  await expect(policies).toHaveCSS("background-color", "rgb(17, 19, 18)");
  await expect(policies).toHaveCSS("color", "rgb(255, 253, 248)");
  await expect(navigation.locator('[aria-current="location"]')).toHaveCount(1);
  await expect.poll(async () => navigation.evaluate((element) => {
    const selected = element.querySelector('[aria-current="location"]')!;
    const nav = element.getBoundingClientRect();
    const link = selected.getBoundingClientRect();
    return link.left >= nav.left - 1 && link.right <= nav.right + 1;
  })).toBe(true);
  for (const link of await navigation.locator('a').all()) {
    expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  await expectClearance('#policies');
  await expectNoDocumentOverflow(page);
  const categories = page.locator(".faq-category");
  await expect(categories).toHaveCount(8);
  for (const category of await categories.all()) {
    await expect(category.locator("details[open]")).toHaveCount(1);
  }
  await products.click();
  await expect(page).toHaveURL(/\/faq#products$/);
  await expect(products).toHaveAttribute("aria-current", "location");
  await expectClearance('#products');
  await page.goBack();
  await expect(policies).toHaveAttribute('aria-current', 'location');
  await expectClearance('#policies');
  await page.reload();
  await expect(policies).toHaveAttribute('aria-current', 'location');
  await expectClearance('#policies');
  for (const width of [720, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(policies).toHaveAttribute('aria-current', 'location');
    await expect.poll(async () => policies.evaluate((element) => {
      const rail = element.closest('nav')!.getBoundingClientRect();
      const link = element.getBoundingClientRect();
      return link.left >= rail.left - 1 && link.right <= rail.right + 1;
    })).toBe(true);
  }
  await products.click();
  const firstAnswer = page.locator("#products details").first();
  const summary = firstAnswer.locator("summary");
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(firstAnswer).not.toHaveAttribute("open");
  await expect(summary).toHaveAttribute('aria-expanded', 'false');
  await expect(summary).toBeFocused();
  await page.keyboard.press("Space");
  await expect(firstAnswer).toHaveAttribute("open", "");
  await expect(summary).toHaveAttribute('aria-expanded', 'true');
  await expect(firstAnswer.locator("p")).toBeVisible();
  expect((await summary.boundingBox())!.height).toBeGreaterThanOrEqual(48);
  await expectClearance('#products summary');
});

test("phone cookie details scroll by keyboard inside a labeled region", async ({ page }) => {
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/cookie-policy");
    const region = page.getByRole("region", { name: "Required cookies", exact: true });
    await expectWhiteCanvas(page);
    await expect(page.getByRole("article", { name: "Cookie Policy" })).toBeVisible();
    await expect(page.getByText(/scroll horizontally/i)).toBeVisible();
    await expect(region.getByRole("columnheader")).toHaveText([
      "Name", "Function", "Duration",
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
  test(`phone ${access.heading} form starts near the panel top and fits narrow screens`, async ({ browserName, page }) => {
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
      await page.keyboard.press(browserName === "webkit" ? "Alt+Tab" : "Tab");
      const fields = form.locator('input:not([type="hidden"])');
      if (await fields.count() > 1) {
        await expect(fields.nth(1)).toBeFocused();
      } else {
        await expect(form.getByRole("button", { name: access.action, exact: true })).toBeFocused();
      }
    }
  });
}

test("phone sign-up keeps enlarged heading text and form controls inside the reading frame", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/account/sign-up");
  await page.evaluate(() => document.fonts.ready);

  const panel = page.locator(".account-access-layout__form-panel");
  const heading = panel.getByRole("heading", { name: "Create Account", exact: true });
  const baselineFontSize = await heading.evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).fontSize),
  );
  const enlargedText = await page.addStyleTag({ content: "html { font-size: 200%; }" });
  await expect.poll(() => heading.evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).fontSize),
  )).toBeGreaterThanOrEqual(baselineFontSize * 2);

  const geometry = await heading.evaluate((element) => {
    const form = element.closest(".account-access-layout__form")!.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(element);
    return {
      form: { left: form.left, right: form.right },
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      text: Array.from(range.getClientRects(), (rect) => ({ left: rect.left, right: rect.right })),
    };
  });
  expect(geometry.text.length).toBeGreaterThan(1);
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1);
  for (const line of geometry.text) {
    expect(line.left).toBeGreaterThanOrEqual(geometry.form.left - 1);
    expect(line.right).toBeLessThanOrEqual(geometry.form.right + 1);
  }

  const controls = panel.locator('.account-form input:not([type="hidden"]), .account-form button[type="submit"]');
  const submit = panel.getByRole("button", { name: "Create account", exact: true });
  await expect(submit).toBeVisible();
  expect(await controls.count()).toBeGreaterThan(1);
  for (const control of await controls.all()) {
    await control.scrollIntoViewIfNeeded();
    await control.evaluate((element) => (element as HTMLElement).focus({ preventScroll: true }));
    await expect(control).toBeFocused();
    const box = (await control.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(geometry.form.left - 1);
    expect(box.x + box.width).toBeLessThanOrEqual(geometry.form.right + 1);
    // Native scrolling can leave a fractional CSS pixel of the control border at the viewport edge.
    expect(box.y).toBeGreaterThanOrEqual(-1);
    expect(box.y + box.height).toBeLessThanOrEqual(568 + 1);
  }

  const submitText = await submit.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    return Array.from(range.getClientRects(), (rect) => ({
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
    }));
  });
  expect(submitText.length).toBeGreaterThan(0);
  for (const line of submitText) {
    expect(line.left).toBeGreaterThanOrEqual(geometry.form.left);
    expect(line.right).toBeLessThanOrEqual(geometry.form.right);
    expect(line.top).toBeGreaterThanOrEqual(0);
    expect(line.bottom).toBeLessThanOrEqual(568);
  }

  await enlargedText.evaluate((element) => {
    element.parentNode?.removeChild(element);
  });
  await page.setViewportSize({ width: 721, height: 1000 });
  await expect(heading).toHaveCSS("white-space", "nowrap");
});

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
