import { expect, test } from "./storefront-fixture";
import { expectStableIdentityLayout } from "./identity-assertions";

test("all internal footer destinations return a successful response", async ({
  page,
  request,
}) => {
  await page.goto("/");
  const hrefs = await page.locator("#site-footer a[href^='/']").evaluateAll(
    (links) =>
      Array.from(
        new Set(
          links
            .map((link) => link.getAttribute("href"))
            .filter((href): href is string => Boolean(href)),
        ),
      ),
  );
  expect(hrefs.length).toBeGreaterThan(8);

  for (const href of hrefs) {
    const path = href.split("#")[0] || "/";
    const response = await request.get(path);
    expect(response.status(), `${href} should resolve`).toBeLessThan(400);
  }
});

test("the Helix Wordmark preserves full-band scaling and reduced motion", async ({
  page,
}) => {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/", { waitUntil: "networkidle" });

    const band = page.locator(".site-footer__wordmark-band");
    const identityLink = band.getByRole("link", { name: "helix" });
    const wordmark = identityLink.locator(
      '[data-helix-identity="wordmark"]',
    );
    await page.evaluate(() => {
      document.querySelector("#site-footer")?.scrollIntoView();
    });
    await expect(identityLink).toBeVisible();
    await expect(wordmark).toHaveAttribute("aria-hidden", "true");
    await identityLink.focus();
    await expect(identityLink).toBeFocused();

    await expectStableIdentityLayout(wordmark);

    const layout = await page.evaluate(() => {
      const root = document.documentElement;
      const bandElement = document.querySelector(
        ".site-footer__wordmark-band",
      );
      const heading = bandElement?.querySelector("h2");
      const identity = bandElement?.querySelector(
        '[data-helix-identity="wordmark"]',
      );
      const bandRect = bandElement?.getBoundingClientRect();
      const identityRect = identity?.getBoundingClientRect();
      return {
        animationName: heading ? getComputedStyle(heading).animationName : null,
        hasHorizontalOverflow: root.scrollWidth > window.innerWidth,
        widthCoverage:
          bandRect && identityRect ? identityRect.width / bandRect.width : 0,
        renderedAspectRatio: identityRect
          ? identityRect.width / identityRect.height
          : 0,
      };
    });

    expect(layout.animationName).toBe("none");
    expect(layout.hasHorizontalOverflow).toBe(false);
    expect(layout.widthCoverage).toBeGreaterThan(0.95);
    expect(layout.renderedAspectRatio).toBeCloseTo(374 / 155, 1);
  }
});

for (const width of [320, 390, 430, 720]) {
  test(`phone footer exposes four full-width navigation groups before services at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    const footer = page.locator("#site-footer");
    const navigation = footer.getByRole("navigation", { name: "Footer navigation" });
    await navigation.scrollIntoViewIfNeeded();
    await expect(navigation).toBeVisible();
    await expect(footer.locator(".site-footer__mobile-groups")).toBeHidden();
    await expect(navigation.getByRole("heading", { level: 3 })).toHaveText([
      "Navigate", "Support", "Legal", "Account",
    ]);

    const geometry = await footer.evaluate((element) => {
      const nav = element.querySelector(".site-footer__nav")!;
      const body = element.querySelector(".site-footer__body")!;
      const services = element.querySelector(".site-footer__services")!;
      const wordmark = element.querySelector(".site-footer__wordmark-band")!;
      const rect = (node: Element) => {
        const box = node.getBoundingClientRect();
        return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width };
      };
      return {
        nav: rect(nav),
        body: rect(body),
        services: rect(services),
        wordmark: rect(wordmark),
        groups: Array.from(nav.querySelectorAll("section"), rect),
        links: Array.from(nav.querySelectorAll("a"), (link) => ({
          label: link.textContent,
          height: link.getBoundingClientRect().height,
          clipped: link.scrollWidth > link.clientWidth,
        })),
        scrollWidth: document.documentElement.scrollWidth,
      };
    });
    expect(geometry.nav.width).toBeCloseTo(geometry.body.width, 1);
    // The shared shell retains its fluid gutter above approximately 711px.
    expect(Math.abs(geometry.nav.width - (width - 32))).toBeLessThanOrEqual(1);
    expect(geometry.nav.top).toBeGreaterThanOrEqual(geometry.wordmark.bottom);
    expect(geometry.services.top).toBeGreaterThanOrEqual(geometry.nav.bottom);
    expect(geometry.groups).toHaveLength(4);
    for (const index of [0, 2]) {
      expect(geometry.groups[index].left).toBeCloseTo(geometry.nav.left, 1);
      expect(geometry.groups[index + 1].right).toBeCloseTo(geometry.nav.right, 1);
      expect(geometry.groups[index].top).toBeCloseTo(geometry.groups[index + 1].top, 1);
      expect(geometry.groups[index].width).toBeCloseTo((geometry.nav.width - 16) / 2, 1);
      expect(geometry.groups[index + 1].width).toBeCloseTo(geometry.groups[index].width, 1);
    }
    expect(geometry.groups[2].top).toBeGreaterThanOrEqual(geometry.groups[0].bottom);
    expect(geometry.groups[3].top).toBeGreaterThanOrEqual(geometry.groups[1].bottom);
    for (const link of geometry.links) {
      expect(link.height, `${link.label} should have a usable target`).toBeGreaterThanOrEqual(44);
      expect(link.clipped, `${link.label} should wrap without clipping`).toBe(false);
    }
    expect(geometry.scrollWidth).toBe(width);
  });
}

test("tablet footer keeps its disclosures and desktop keeps visible navigation", async ({ page }) => {
  await page.setViewportSize({ width: 721, height: 1024 });
  await page.goto("/");
  const footer = page.locator("#site-footer");
  const disclosures = footer.locator(".site-footer__mobile-groups");
  await disclosures.scrollIntoViewIfNeeded();
  await expect(disclosures).toBeVisible();
  await expect(footer.locator(".site-footer__nav")).toBeHidden();
  await expect(disclosures.locator("details")).toHaveCount(4);
  await expect(disclosures.locator("details[open]")).toHaveCount(0);
  await disclosures.locator("summary").filter({ hasText: "Navigate" }).click();
  await expect(disclosures.getByRole("link", { name: "Shop", exact: true })).toBeVisible();

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.reload();
  const navigation = footer.getByRole("navigation", { name: "Footer navigation" });
  await navigation.scrollIntoViewIfNeeded();
  await expect(navigation).toBeVisible();
  await expect(disclosures).toBeHidden();
  await expect(navigation.getByRole("heading", { level: 3 })).toHaveText([
    "Navigate", "Support", "Legal", "Account",
  ]);
  const rows = await navigation.locator("section").evaluateAll((sections) =>
    sections.map((section) => section.getBoundingClientRect().top),
  );
  for (const top of rows) expect(top).toBeCloseTo(rows[0], 1);
});
