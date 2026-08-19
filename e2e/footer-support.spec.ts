import { expect, test } from "./storefront-fixture";

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
