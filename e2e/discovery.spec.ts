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
  await expect(page.getByRole("region", { name: "The Core" }))
    .toBeVisible();
  await expect(page.getByRole("heading", { name: "Cleanse, Treat, Seal." }))
    .toHaveCount(0);
  await expect(page.getByText("01 Start with structure skin understands."))
    .toBeVisible();
  await expect(
    page.getByText("02 Most routines fail because they ask for too much too soon."),
  ).toBeVisible();
  await expect(page.getByText("03 Three steps build consistency."))
    .toBeVisible();
  await expect(page.getByText("SIMPLE IS NOT BASIC")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Use all three. Or upgrade one layer." }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name:
        "For skin that looks clearer, younger, more hydrated, and less tired by default.",
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

test("homepage section eyebrows share the Core section treatment", async ({ page }) => {
  await page.goto("/");

  const styles = await page.evaluate(() => {
    const labels = [
      "The Core",
      "Plug and Play",
      "What The Core Supports",
      "Ingredient Literacy",
      "Start Here",
    ];
    const eyebrows = Array.from(document.querySelectorAll<HTMLElement>(".hero__eyebrow"));

    return Object.fromEntries(
      labels.map((label) => {
        const element = eyebrows.find(
          (eyebrow) => eyebrow.textContent?.replace(/\s+/g, " ").trim() === label,
        );
        if (!element) return [label, null];
        const style = getComputedStyle(element);
        return [
          label,
          {
            color: style.color,
            fontSize: style.fontSize,
            fontWeight: style.fontWeight,
            letterSpacing: style.letterSpacing,
            lineHeight: style.lineHeight,
            marginBottom: style.marginBottom,
          },
        ];
      }),
    );
  });

  const core = styles["The Core"];
  expect(core).not.toBeNull();
  for (const label of ["Plug and Play", "What The Core Supports", "Ingredient Literacy"]) {
    expect(styles[label]).toEqual(core);
  }
  expect(styles["Start Here"]).not.toEqual(core);
});

test("homepage core narrative uses compact cards and a split why editorial section", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  const desktop = await page.evaluate(() => {
    const clean = (text: string | null | undefined) =>
      text?.replace(/\s+/g, " ").trim() ?? "";
    const sections = Array.from(document.querySelectorAll<HTMLElement>("main > section"));
    const headings = Array.from(document.querySelectorAll<HTMLElement>("h2"));
    const core = document.querySelector<HTMLElement>("#core-three");
    const why = document.querySelector<HTMLElement>(".home-section--why");
    const coreIntro = core?.querySelector<HTMLElement>(".home-section__intro p:not(.hero__eyebrow)");
    const coreCards = Array.from(core?.querySelectorAll<HTMLElement>(".home-step-card") ?? []);
    const coreIntroBox = coreIntro?.getBoundingClientRect();
    const coreIntroLineHeight = coreIntro
      ? Number.parseFloat(getComputedStyle(coreIntro).lineHeight)
      : 0;
    const whyPrinciples = why?.querySelector<HTMLElement>(".home-why-principles");
    const whyVisual = why?.querySelector<HTMLElement>(".home-why-visual");
    const whyTitle = why?.querySelector<HTMLElement>(".home-why-visual__title");
    const whyImage = why?.querySelector<HTMLImageElement>(".home-why-visual img");
    const supportHeading = headings.find(
      (heading) =>
        clean(heading.textContent) ===
        "For skin that looks clearer, younger, more hydrated, and less tired by default.",
    );
    const plugHeading = headings.find(
      (heading) => clean(heading.textContent) === "Use all three. Or upgrade one layer.",
    );
    const split = supportHeading?.closest<HTMLElement>(".home-section--core-support");
    const supportPanel = supportHeading?.closest<HTMLElement>(".home-core-split__panel");
    const plugPanel = plugHeading?.closest<HTMLElement>(".home-core-split__panel");

    const box = (element: HTMLElement | null | undefined) => {
      const rect = element?.getBoundingClientRect();
      if (!rect) return null;
      return {
        bottom: Math.round(rect.bottom),
        height: Math.round(rect.height),
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        top: Math.round(rect.top),
        width: Math.round(rect.width),
      };
    };

    return {
      coreIndex: sections.indexOf(core as HTMLElement),
      whyIndex: sections.indexOf(why as HTMLElement),
      visibleCoreDisplayHeading: headings.some(
        (heading) => clean(heading.textContent) === "Cleanse, Treat, Seal.",
      ),
      coreIntroText: clean(coreIntro?.textContent),
      coreIntroLines: coreIntroBox && coreIntroLineHeight
        ? coreIntroBox.height / coreIntroLineHeight
        : 0,
      coreIntroWidth: Math.round(coreIntroBox?.width ?? 0),
      coreCards: coreCards.map((card) => ({
        height: Math.round(card.getBoundingClientRect().height),
        tags: Array.from(card.children).map((child) => child.tagName),
        text: clean(card.textContent),
      })),
      whyClass: why?.className ?? "",
      whyBorderTop: why ? getComputedStyle(why).borderTopWidth : "",
      whyBox: box(why),
      whyPrinciplesBox: box(whyPrinciples),
      whyVisualBox: box(whyVisual),
      whyTitleBox: box(whyTitle),
      whyTitleText: clean(whyTitle?.textContent),
      whyTitleColor: whyTitle ? getComputedStyle(whyTitle).color : "",
      whyTitleFamily: whyTitle ? getComputedStyle(whyTitle).fontFamily : "",
      whyTitleAlign: whyTitle ? getComputedStyle(whyTitle).textAlign : "",
      whyStatements: Array.from(why?.querySelectorAll(".home-why-list li") ?? []).map((node) =>
        clean(node.textContent),
      ),
      whyStatementStyle: why?.querySelector(".home-why-list li")
        ? {
            fontSize: getComputedStyle(why.querySelector(".home-why-list li") as HTMLElement)
              .fontSize,
            letterSpacing: getComputedStyle(why.querySelector(".home-why-list li") as HTMLElement)
              .letterSpacing,
          }
        : null,
      whyImageSrc: whyImage?.currentSrc || whyImage?.src || "",
      whyImageAlt: whyImage?.alt ?? "",
      whyImageObjectFit: whyImage ? getComputedStyle(whyImage).objectFit : "",
      supportAndPlugSameSection: Boolean(split && plugHeading?.closest(".home-section--core-support") === split),
      supportBeforePlug: Boolean(
        supportHeading &&
          plugHeading &&
          headings.indexOf(supportHeading) < headings.indexOf(plugHeading),
      ),
      supportBox: box(supportPanel),
      plugBox: box(plugPanel),
      splitClass: split?.className ?? "",
      supportAlign: supportPanel ? getComputedStyle(supportPanel).textAlign : "",
      plugAlign: plugPanel ? getComputedStyle(plugPanel).textAlign : "",
      overflow: document.documentElement.scrollWidth - window.innerWidth,
    };
  });

  expect(desktop.visibleCoreDisplayHeading).toBe(false);
  expect(desktop.coreIntroText).toBe(
    "Simple by design: cleanse the surface, apply the treatment layer, then finish with moisture and barrier support.",
  );
  expect(desktop.coreIntroLines).toBeLessThanOrEqual(1.25);
  expect(desktop.coreIntroWidth).toBeGreaterThan(720);
  expect(desktop.coreCards).toEqual([
    {
      height: expect.any(Number),
      tags: ["H3", "P"],
      text: "CLEANSEcleans the surface before the rest of the routine.",
    },
    {
      height: expect.any(Number),
      tags: ["H3", "P"],
      text: "TREATdelivers the central treatment layer.",
    },
    {
      height: expect.any(Number),
      tags: ["H3", "P"],
      text: "SEALfinishes with moisture and barrier support.",
    },
  ]);
  for (const card of desktop.coreCards) {
    expect(card.height).toBeLessThan(205);
    expect(card.text).not.toMatch(/Cleanser|Treatment Serum|Barrier Cream|—/);
  }
  expect(desktop.whyClass).toContain("home-section--why");
  expect(desktop.whyIndex).toBe(desktop.coreIndex + 1);
  expect(desktop.whyBorderTop).toBe("1px");
  expect(desktop.whyStatements).toEqual([
    "01 Start with structure skin understands.",
    "02 Most routines fail because they ask for too much too soon.",
    "03 Three steps build consistency.",
  ]);
  expect(desktop.whyStatementStyle?.letterSpacing).not.toBe("normal");
  expect(desktop.whyVisualBox?.left).toBeGreaterThanOrEqual(desktop.whyPrinciplesBox?.right ?? 0);
  expect(desktop.whyVisualBox?.right).toBe(desktop.whyBox?.right);
  expect(desktop.whyTitleText).toBe("SIMPLE IS NOT BASIC");
  expect(desktop.whyTitleColor).toBe("rgb(255, 255, 255)");
  expect(desktop.whyTitleFamily).toMatch(/Marcellus/i);
  expect(desktop.whyTitleAlign).toBe("right");
  expect(desktop.whyTitleBox?.right).toBeLessThanOrEqual(desktop.whyVisualBox?.right ?? 0);
  expect((desktop.whyVisualBox?.right ?? 0) - (desktop.whyTitleBox?.right ?? 0))
    .toBeLessThan(90);
  expect((desktop.whyVisualBox?.bottom ?? 0) - (desktop.whyTitleBox?.bottom ?? 0))
    .toBeLessThan(100);
  const whyImageSrc = decodeURIComponent(desktop.whyImageSrc);
  expect(whyImageSrc).toContain("/media/home/why-three.webp");
  expect(whyImageSrc).not.toContain("/mnt/data");
  expect(desktop.whyImageAlt).toBe("Black-and-white editorial portrait.");
  expect(desktop.whyImageObjectFit).toBe("cover");
  expect(desktop.supportAndPlugSameSection).toBe(true);
  expect(desktop.supportBeforePlug).toBe(true);
  expect(desktop.splitClass).toContain("home-section--core-support");
  expect(desktop.supportBox?.right).toBeLessThanOrEqual(desktop.plugBox?.left ?? 0);
  expect(Math.abs((desktop.supportBox?.top ?? 0) - (desktop.plugBox?.top ?? 0))).toBeLessThan(4);
  expect(desktop.supportAlign).toBe("left");
  expect(desktop.plugAlign).toBe("right");
  expect(desktop.overflow).toBeLessThanOrEqual(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  const mobile = await page.evaluate(() => {
    const clean = (text: string | null | undefined) =>
      text?.replace(/\s+/g, " ").trim() ?? "";
    const supportHeading = Array.from(document.querySelectorAll<HTMLElement>("h2")).find(
      (heading) =>
        clean(heading.textContent) ===
        "For skin that looks clearer, younger, more hydrated, and less tired by default.",
    );
    const plugHeading = Array.from(document.querySelectorAll<HTMLElement>("h2")).find(
      (heading) => clean(heading.textContent) === "Use all three. Or upgrade one layer.",
    );
    const supportPanel = supportHeading?.closest<HTMLElement>(".home-core-split__panel");
    const plugPanel = plugHeading?.closest<HTMLElement>(".home-core-split__panel");
    const why = document.querySelector<HTMLElement>(".home-section--why");
    const whyPrinciples = why?.querySelector<HTMLElement>(".home-why-principles");
    const whyVisual = why?.querySelector<HTMLElement>(".home-why-visual");
    const whyTitle = why?.querySelector<HTMLElement>(".home-why-visual__title");
    const box = (element: HTMLElement | null | undefined) => {
      const rect = element?.getBoundingClientRect();
      if (!rect) return null;
      return {
        bottom: Math.round(rect.bottom),
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        top: Math.round(rect.top),
        width: Math.round(rect.width),
      };
    };

    return {
      supportBox: box(supportPanel),
      plugBox: box(plugPanel),
      supportAlign: supportPanel ? getComputedStyle(supportPanel).textAlign : "",
      plugAlign: plugPanel ? getComputedStyle(plugPanel).textAlign : "",
      whyPrinciplesBox: box(whyPrinciples),
      whyVisualBox: box(whyVisual),
      whyTitleBox: box(whyTitle),
      whyTitleAlign: whyTitle ? getComputedStyle(whyTitle).textAlign : "",
      overflow: document.documentElement.scrollWidth - window.innerWidth,
    };
  });

  expect(mobile.plugBox?.top).toBeGreaterThan(mobile.supportBox?.bottom ?? 0);
  expect(mobile.supportAlign).toBe("left");
  expect(mobile.plugAlign).toBe("left");
  expect(mobile.whyVisualBox?.top).toBeGreaterThanOrEqual(mobile.whyPrinciplesBox?.bottom ?? 0);
  expect(mobile.whyTitleAlign).toBe("right");
  expect((mobile.whyVisualBox?.right ?? 0) - (mobile.whyTitleBox?.right ?? 0))
    .toBeLessThan(40);
  expect((mobile.whyVisualBox?.bottom ?? 0) - (mobile.whyTitleBox?.bottom ?? 0))
    .toBeLessThan(48);
  expect(mobile.overflow).toBeLessThanOrEqual(0);
});

test("homepage Core Three products and add-ons resolve by stable slugs", async ({ page }) => {
  await page.goto("/");

  const merchandising = await page.evaluate(() => {
    const clean = (text: string | null | undefined) => text?.replace(/\s+/g, " ").trim() ?? "";
    const sectionByHeading = (heading: string) =>
      Array.from(document.querySelectorAll("section")).find(
        (section) => clean(section.querySelector("h2")?.textContent) === heading,
      );
    const core = document.querySelector("#core-three");
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
  const core = page.getByRole("region", { name: "The Core" });
  const cleanseLink = core.getByRole("link", { name: "CLEANSE", exact: true });
  await expect(cleanseLink).toHaveAttribute(
    "href",
    "/products/cleanse-01-calming-gel-cleanser",
  );
  await Promise.all([
    page.waitForURL(/\/products\/cleanse-01-calming-gel-cleanser$/),
    cleanseLink.locator(".product-card__name").click(),
  ]);
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
