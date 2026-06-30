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
  await expect(page.getByRole("heading", { name: "Simple is not basic." }))
    .toBeVisible();
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

test("homepage core narrative uses a centered why pause and combined split", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  const desktop = await page.evaluate(() => {
    const clean = (text: string | null | undefined) =>
      text?.replace(/\s+/g, " ").trim() ?? "";
    const sections = Array.from(document.querySelectorAll<HTMLElement>("main > section"));
    const headings = Array.from(document.querySelectorAll<HTMLElement>("h2"));
    const sectionByHeading = (heading: string) =>
      sections.find((section) => clean(section.querySelector("h2")?.textContent) === heading);
    const core = sectionByHeading("Cleanse, Treat, Seal.");
    const why = sectionByHeading("Simple is not basic.");
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
    const reasonGrid = why?.querySelector<HTMLElement>(".home-reason-grid");
    const coreHeading = core?.querySelector<HTMLElement>("h2");

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
      whyClass: why?.className ?? "",
      whyBackground: why ? getComputedStyle(why).backgroundColor : "",
      coreBackground: core ? getComputedStyle(core).backgroundColor : "",
      whyBorderTop: why ? getComputedStyle(why).borderTopWidth : "",
      whyHeadingAlign: why?.querySelector("h2")
        ? getComputedStyle(why.querySelector("h2") as HTMLElement).textAlign
        : "",
      whyCardAlign: why?.querySelector(".home-reason-card p")
        ? getComputedStyle(why.querySelector(".home-reason-card p") as HTMLElement).textAlign
        : "",
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
      splitHeadingSize: supportHeading
        ? Number.parseFloat(getComputedStyle(supportHeading).fontSize)
        : 0,
      majorHeadingSize: coreHeading
        ? Number.parseFloat(getComputedStyle(coreHeading).fontSize)
        : 0,
      reasonGridTop: box(reasonGrid)?.top ?? 0,
      overflow: document.documentElement.scrollWidth - window.innerWidth,
    };
  });

  expect(desktop.whyClass).toContain("home-section--why");
  expect(desktop.whyIndex).toBe(desktop.coreIndex + 1);
  expect(desktop.whyBackground).not.toEqual(desktop.coreBackground);
  expect(desktop.whyBorderTop).toBe("1px");
  expect(desktop.whyHeadingAlign).toBe("center");
  expect(desktop.whyCardAlign).toBe("center");
  expect(desktop.supportAndPlugSameSection).toBe(true);
  expect(desktop.supportBeforePlug).toBe(true);
  expect(desktop.splitClass).toContain("home-section--core-support");
  expect(desktop.supportBox?.right).toBeLessThanOrEqual(desktop.plugBox?.left ?? 0);
  expect(Math.abs((desktop.supportBox?.top ?? 0) - (desktop.plugBox?.top ?? 0))).toBeLessThan(4);
  expect(desktop.supportAlign).toBe("left");
  expect(desktop.plugAlign).toBe("right");
  expect(desktop.splitHeadingSize).toBeLessThan(desktop.majorHeadingSize);
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
    const box = (element: HTMLElement | null | undefined) => {
      const rect = element?.getBoundingClientRect();
      if (!rect) return null;
      return {
        bottom: Math.round(rect.bottom),
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        width: Math.round(rect.width),
      };
    };

    return {
      supportBox: box(supportPanel),
      plugBox: box(plugPanel),
      supportAlign: supportPanel ? getComputedStyle(supportPanel).textAlign : "",
      plugAlign: plugPanel ? getComputedStyle(plugPanel).textAlign : "",
      whyHeadingAlign: getComputedStyle(
        document.querySelector<HTMLElement>("#why-three-heading")!,
      ).textAlign,
      overflow: document.documentElement.scrollWidth - window.innerWidth,
    };
  });

  expect(mobile.plugBox?.top).toBeGreaterThan(mobile.supportBox?.bottom ?? 0);
  expect(mobile.supportAlign).toBe("left");
  expect(mobile.plugAlign).toBe("left");
  expect(mobile.whyHeadingAlign).toBe("center");
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
  const core = page.getByRole("region", { name: "Cleanse, Treat, Seal." });
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
