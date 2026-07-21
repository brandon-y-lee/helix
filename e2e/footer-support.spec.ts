import { expect, test } from "@playwright/test";

const footerPages = [
  "/",
  "/products",
  "/products/treat-03-pdrn-5-ampoule",
  "/system",
  "/about",
  "/cart",
  "/account/sign-in",
  "/privacy",
  "/terms",
  "/cookie-policy",
  "/privacy-choices",
  "/accessibility",
  "/faq",
  "/contact",
] as const;

const footerThemeRoutes = [
  "/",
  "/products",
  "/products/treat-03-pdrn-5-ampoule",
  "/system",
  "/about",
  "/cart",
  "/account/sign-in",
] as const;

const footerThemeViewports = [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
  { width: 360, height: 800 },
] as const;

async function readFooterTheme(page: import("@playwright/test").Page) {
  return page.locator(".site-footer").evaluate((footer) => {
    const resolveColor = (value: string) => {
      const probe = document.createElement("span");
      probe.style.color = value;
      document.body.append(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      return color;
    };

    const styleFor = (selector: string) => {
      const element = selector === ":scope" ? footer : footer.querySelector(selector);
      if (!element) return null;
      const style = getComputedStyle(element);
      return {
        backgroundColor: style.backgroundColor,
        backgroundImage: style.backgroundImage,
        borderBottomColor: style.borderBottomColor,
        borderBottomWidth: style.borderBottomWidth,
        borderLeftColor: style.borderLeftColor,
        borderLeftWidth: style.borderLeftWidth,
        borderRadius: style.borderRadius,
        borderRightWidth: style.borderRightWidth,
        borderTopColor: style.borderTopColor,
        borderTopWidth: style.borderTopWidth,
        boxShadow: style.boxShadow,
        color: style.color,
        display: style.display,
        outlineColor: style.outlineColor,
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
        textAlign: style.textAlign,
        whiteSpace: style.whiteSpace,
      };
    };

    const rootStyle = getComputedStyle(document.documentElement);
    const updates = footer.querySelector(".site-footer__updates");
    const primary = footer.querySelector(".site-footer__primary");
    const content = footer.querySelector(".site-footer__content");
    const nav = footer.querySelector(".site-footer__nav");
    const mobileGroups = footer.querySelector(".site-footer__mobile-groups");
    const wordmark = footer.querySelector(".site-footer__wordmark h2");
    const inner = footer.querySelector(".site-footer__inner");
    const rectFor = (element: Element | null) => {
      const rect = element?.getBoundingClientRect();
      return rect
        ? { bottom: rect.bottom, left: rect.left, right: rect.right, top: rect.top, width: rect.width }
        : null;
    };

    return {
      tokens: {
        accent2: resolveColor(rootStyle.getPropertyValue("--accent-2").trim()),
        bg: resolveColor(rootStyle.getPropertyValue("--bg").trim()),
        focus: resolveColor(rootStyle.getPropertyValue("--focus").trim()),
        ink: resolveColor(rootStyle.getPropertyValue("--ink").trim()),
        inkSoft: resolveColor(rootStyle.getPropertyValue("--ink-soft").trim()),
        line: resolveColor(rootStyle.getPropertyValue("--line").trim()),
        surface: resolveColor(rootStyle.getPropertyValue("--surface").trim()),
      },
      footer: styleFor(":scope"),
      inner: styleFor(".site-footer__inner"),
      wordmark: styleFor(".site-footer__wordmark h2"),
      content: styleFor(".site-footer__content"),
      navHeading: styleFor(".site-footer__nav h3"),
      navLink: styleFor(".site-footer__nav a"),
      support: styleFor(".site-footer__support"),
      supportText: styleFor(".site-footer__support p:not(.eyebrow)"),
      updates: styleFor(".site-footer__updates"),
      updatesStatus: styleFor(".site-footer__updates span"),
      utility: styleFor(".site-footer__utility"),
      utilityButton: styleFor(".site-footer__utility-button"),
      accordion: styleFor(".site-footer__accordion"),
      accordionTrigger: styleFor(".site-footer__accordion-trigger"),
      layout: {
        inner: rectFor(inner),
        mobileGroups: rectFor(mobileGroups),
        nav: rectFor(nav),
        updates: rectFor(updates),
        wordmark: rectFor(wordmark),
        newsletterBeforeNavigation: Boolean(
          primary &&
          updates &&
          content &&
          Array.from(primary.children).indexOf(updates) <
            Array.from(primary.children).indexOf(content)
        ),
        wordmarkCount: footer.querySelectorAll(".site-footer__wordmark h2").length,
      },
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
}

test("global footer renders across public routes without unsupported links", async ({
  page,
}) => {
  for (const route of footerPages) {
    await page.goto(route);
    await expect(page.locator(".site-footer")).toBeVisible();
    await expect(
      page.locator(".site-footer").getByRole("heading", {
        name: "MEI PELLE",
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.locator(".site-footer__brand")).toHaveCount(0);
    await expect(page.locator(".site-footer")).not.toContainText("Seoul / Los Angeles");
    await expect(page.locator(".site-footer")).not.toContainText(
      "Prestige skincare for men built around discipline, consistency, and a cleaner routine.",
    );
    await expect(page.locator(".site-footer__wordmark a[href='/']")).toHaveCount(1);
    await expect(page.locator(".site-footer")).toContainText("EMAIL UPDATES ARE NOT OPEN");
    await expect(page.locator(".site-footer a[href='/privacy']")).not.toHaveCount(0);
    await expect(page.locator(".site-footer a[href='/terms']")).not.toHaveCount(0);
    await expect(page.locator(".site-footer a[href='/faq#shipping']")).not.toHaveCount(0);
    await expect(page.locator(".site-footer a[href='/faq#returns']")).not.toHaveCount(0);
    await expect(page.locator(".site-footer a[href='/privacy-choices']")).not.toHaveCount(0);
    await expect(page.locator(".site-footer").getByRole("link", { name: "Rewards" })).not.toHaveCount(0);
    await expect(page.locator(".site-footer").getByRole("link", { name: "Store Locator" })).toHaveCount(0);
    await expect(page.locator(".site-footer").getByRole("link", { name: "Events" })).toHaveCount(0);
    await expect(page.locator(".site-footer").getByRole("link", { name: "Instagram" })).toHaveCount(0);
    await expect(page.locator(".site-footer")).not.toContainText("Development storefront");

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(hasHorizontalOverflow).toBe(false);
  }
});

test("global footer uses a flat responsive composition with newsletter-first order", async ({
  page,
}) => {
  for (const viewport of footerThemeViewports) {
    await page.setViewportSize(viewport);

    for (const route of footerThemeRoutes) {
      await page.goto(route);
      await page.locator(".site-footer").scrollIntoViewIfNeeded();

      const theme = await readFooterTheme(page);

      expect(theme.footer?.backgroundColor).toBe(theme.tokens.bg);
      expect(theme.footer?.backgroundImage).toBe("none");
      expect(theme.footer?.borderTopColor).toBe(theme.tokens.line);
      expect(theme.footer?.borderTopWidth).toBe("1px");
      expect(theme.inner?.backgroundColor).toBe("rgba(0, 0, 0, 0)");
      expect(theme.inner?.borderRadius).toBe("0px");
      expect(theme.inner?.borderTopWidth).toBe("0px");
      expect(theme.inner?.borderRightWidth).toBe("0px");
      expect(theme.inner?.borderBottomWidth).toBe("0px");
      expect(theme.inner?.borderLeftWidth).toBe("0px");
      expect(theme.inner?.boxShadow).toBe("none");
      expect(theme.wordmark?.color).toBe(theme.tokens.ink);
      expect(theme.wordmark?.textAlign).toBe("center");
      expect(theme.wordmark?.whiteSpace).toBe("nowrap");
      expect(theme.navLink?.color).toBe(theme.tokens.ink);
      expect(theme.utilityButton?.color).toBe(theme.tokens.ink);
      expect(theme.navHeading?.color).toBe(theme.tokens.inkSoft);
      expect(theme.supportText?.color).toBe(theme.tokens.inkSoft);
      expect(theme.utility?.color).toBe(theme.tokens.inkSoft);
      expect(theme.support?.borderTopColor).toBe(theme.tokens.line);
      expect(theme.updatesStatus?.color).not.toBe(theme.tokens.surface);
      expect(theme.layout.newsletterBeforeNavigation).toBe(true);
      expect(theme.layout.wordmarkCount).toBe(1);
      expect(theme.layout.wordmark?.width).toBeCloseTo(theme.layout.inner?.width ?? 0, 0);
      expect(theme.overflowX).toBeLessThanOrEqual(1);

      if (viewport.width <= 860) {
        expect(theme.accordion?.borderTopColor).toBe(theme.tokens.line);
        expect(theme.accordionTrigger?.color).toBe(theme.tokens.inkSoft);
        expect(theme.layout.updates?.top ?? 0).toBeLessThan(theme.layout.mobileGroups?.top ?? 0);
      } else {
        expect(theme.layout.updates?.left ?? 0).toBeLessThan(theme.layout.nav?.left ?? 0);
        expect(theme.layout.updates?.top).toBeCloseTo(theme.layout.nav?.top ?? 0, 0);
      }
    }
  }
});

test("footer keyboard focus remains visible on the light surface", async ({ page }) => {
  await page.goto("/");
  const footer = page.locator(".site-footer");
  await footer.scrollIntoViewIfNeeded();

  const shopLink = footer.getByRole("link", { name: "Shop" });
  await expect(shopLink).toHaveCount(1);
  await shopLink.focus();
  const focusedLink = await shopLink.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      outlineColor: style.outlineColor,
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
    };
  });
  const focusColor = await page.evaluate(() => {
    const probe = document.createElement("span");
    probe.style.color = getComputedStyle(document.documentElement)
      .getPropertyValue("--focus")
      .trim();
    document.body.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  });

  expect(focusedLink.outlineColor).toBe(focusColor);
  expect(focusedLink.outlineStyle).toBe("solid");
  expect(focusedLink.outlineWidth).toBe("2px");
});

test("all internal footer links resolve", async ({ page }) => {
  await page.goto("/");
  const hrefs = await page.locator(".site-footer a[href^='/']").evaluateAll((links) =>
    Array.from(new Set(links.map((link) => link.getAttribute("href")).filter(Boolean))),
  );

  expect(hrefs.length).toBeGreaterThan(8);

  for (const href of hrefs) {
    const response = await page.goto(href as string);
    expect(response?.status() ?? 200).toBeLessThan(400);
    await expect(page.locator("main")).toBeVisible();
  }
});

test("mobile footer accordions and cookie preferences are keyboard reachable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const footer = page.locator(".site-footer");
  const navigate = footer.getByRole("button", { name: "Navigate" });
  await expect(navigate).toHaveAttribute("aria-expanded", "false");
  await navigate.click();
  await expect(navigate).toHaveAttribute("aria-expanded", "true");
  await expect(
    footer.locator(".site-footer__mobile-groups").getByRole("link", { name: "Shop" }),
  ).toBeVisible();

  await footer.getByRole("button", { name: "Cookie Preferences" }).click();
  const dialog = page.getByRole("dialog", { name: "Cookie Preferences" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Essential cookies");
  await dialog.getByRole("button", { name: "Save essential preference" }).click();
  await expect(dialog.getByRole("status")).toContainText("Essential-only preference saved.");
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(dialog).toHaveCount(0);
});

test("FAQ anchors and contact route reflect current functionality", async ({
  page,
}) => {
  await page.goto("/faq");
  await expect(page.getByRole("heading", { level: 1, name: "FAQ" })).toBeVisible();
  await expect(page.locator("#shipping")).toBeVisible();
  await expect(page.locator("#returns")).toBeVisible();
  await expect(page.getByText("Can I place an order right now?")).toBeVisible();
  await expect(page.getByText("Stripe-hosted Checkout in sandbox mode")).toBeVisible();
  await expect(page.locator("body")).toContainText("$50+");
  await expect(page.locator("body")).not.toContainText("Development storefront");
  await expect(page.locator("body")).not.toContainText("returns are accepted");

  await page.goto("/contact");
  await expect(page.getByRole("heading", { level: 1, name: "CONTACT" })).toBeVisible();
  await expect(page.getByText("PUBLIC SUPPORT INTAKE PENDING")).toBeVisible();
  await expect(page.getByText("does not include a message form")).toBeVisible();
  await expect(page.locator("form")).toHaveCount(0);
  await expect(page.getByText("Message sent successfully")).toHaveCount(0);
});

test("legacy support and legal routes redirect to canonical pages", async ({ page }) => {
  const redirects = [
    { from: "/privacy-policy", to: /\/privacy$/ },
    { from: "/terms-of-service", to: /\/terms$/ },
    { from: "/support", to: /\/faq$/ },
    { from: "/shipping", to: /\/faq#shipping$/ },
    { from: "/shipping-policy", to: /\/faq#shipping$/ },
    { from: "/returns", to: /\/faq#returns$/ },
    { from: "/returns-exchanges", to: /\/faq#returns$/ },
    { from: "/refund-policy", to: /\/faq#returns$/ },
  ] as const;

  for (const redirect of redirects) {
    await page.goto(redirect.from);
    await expect(page).toHaveURL(redirect.to);
    await expect(page.locator("main")).toBeVisible();
  }

  await page.goto("/rewards");
  await expect(page).toHaveURL(/\/rewards$/);
  await expect(page.getByRole("heading", { level: 1, name: "MEI PELLE REWARDS" })).toBeVisible();
});
