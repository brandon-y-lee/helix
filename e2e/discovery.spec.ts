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
    page.getByText("For skin that is clearer, more hydrated, and less tired."),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Plug and Play" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Explore The Core" })).toHaveAttribute(
    "href",
    "#core-three",
  );
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
      "Ingredient Literacy",
      "Start Here",
      "Plug and Play",
      "What The Core Supports",
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
  expect(styles["Ingredient Literacy"]).toEqual(core);
  for (const label of ["Plug and Play", "What The Core Supports"]) {
    expect(styles[label]).toBeNull();
  }
  expect(styles["Start Here"]).not.toBeNull();
});

test("homepage core narrative uses taller why and asymmetric plug video sections", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.locator(".home-plug-media__frame").waitFor({ state: "attached" });

  const desktop = await page.evaluate(() => {
    const clean = (text: string | null | undefined) =>
      text?.replace(/\s+/g, " ").trim() ?? "";
    const sections = Array.from(document.querySelectorAll<HTMLElement>("main > section"));
    const headings = Array.from(document.querySelectorAll<HTMLElement>("h2"));
    const core = document.querySelector<HTMLElement>("#core-three");
    const why = document.querySelector<HTMLElement>(".home-section--why");
    const plugSection = document.querySelector<HTMLElement>(".home-section--core-support");
    const coreIntro = core?.querySelector<HTMLElement>(".home-section__intro p:not(.hero__eyebrow)");
    const coreIntroBox = coreIntro?.getBoundingClientRect();
    const coreIntroLineHeight = coreIntro
      ? Number.parseFloat(getComputedStyle(coreIntro).lineHeight)
      : 0;
    const whyPrinciples = why?.querySelector<HTMLElement>(".home-why-principles");
    const whyList = why?.querySelector<HTMLElement>(".home-why-list");
    const whyVisual = why?.querySelector<HTMLElement>(".home-why-visual");
    const whyTitle = why?.querySelector<HTMLElement>(".home-why-visual__title");
    const whyImage = why?.querySelector<HTMLImageElement>(".home-why-visual img");
    const plugSplit = plugSection?.querySelector<HTMLElement>(".home-plug-split");
    const plugMedia = plugSection?.querySelector<HTMLElement>(".home-plug-media");
    const plugPanel = plugSection?.querySelector<HTMLElement>(".home-plug-panel");
    const plugCaption = plugSection?.querySelector<HTMLElement>(".home-plug-media__caption");
    const plugTitle = plugSection?.querySelector<HTMLElement>("#plug-play-heading");
    const plugBody = plugSection?.querySelector<HTMLElement>(".home-plug-panel__body");
    const plugBodyText = plugBody?.querySelector<HTMLElement>("p");
    const plugCta = plugBody?.querySelector<HTMLAnchorElement>("a");
    const plugPoster = plugSection?.querySelector<HTMLImageElement>(".home-plug-media__poster");
    const plugFrame = plugSection?.querySelector<HTMLElement>(".home-plug-media__frame");
    const plugVideo = plugSection?.querySelector<HTMLVideoElement>(".home-plug-media__video");

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
      plugIndex: sections.indexOf(plugSection as HTMLElement),
      visibleCoreDisplayHeading: headings.some(
        (heading) => clean(heading.textContent) === "Cleanse, Treat, Seal.",
      ),
      oldSupportHeadingCount: headings.filter(
        (heading) =>
          clean(heading.textContent) ===
          "For skin that looks clearer, younger, more hydrated, and less tired by default.",
      ).length,
      oldPlugHeadingCount: headings.filter(
        (heading) => clean(heading.textContent) === "Use all three. Or upgrade one layer.",
      ).length,
      oldSupportEyebrowCount: Array.from(document.querySelectorAll<HTMLElement>(".hero__eyebrow"))
        .filter((eyebrow) => clean(eyebrow.textContent) === "What The Core Supports").length,
      coreIntroText: clean(coreIntro?.textContent),
      coreIntroLines: coreIntroBox && coreIntroLineHeight
        ? coreIntroBox.height / coreIntroLineHeight
        : 0,
      coreIntroWidth: Math.round(coreIntroBox?.width ?? 0),
      coreStepGridExists: Boolean(core?.querySelector(".home-step-grid")),
      coreStepCardCount: core?.querySelectorAll(".home-step-card").length ?? 0,
      coreProductNames: Array.from(core?.querySelectorAll(".product-card__name") ?? []).map((node) =>
        clean(node.textContent),
      ),
      viewportHeight: window.innerHeight,
      bodyBackground: getComputedStyle(document.body).backgroundColor,
      whyClass: why?.className ?? "",
      whyBackground: why ? getComputedStyle(why).backgroundColor : "",
      whyPrinciplesBackground: whyPrinciples ? getComputedStyle(whyPrinciples).backgroundColor : "",
      whyBox: box(why),
      whyPrinciplesBox: box(whyPrinciples),
      whyListBox: box(whyList),
      whyVisualBox: box(whyVisual),
      whyVisualAfterContent: whyVisual ? getComputedStyle(whyVisual, "::after").content : "",
      whyTitleBox: box(whyTitle),
      whyTitleText: clean(whyTitle?.textContent),
      whyTitleColor: whyTitle ? getComputedStyle(whyTitle).color : "",
      whyTitleFamily: whyTitle ? getComputedStyle(whyTitle).fontFamily : "",
      whyTitleAlign: whyTitle ? getComputedStyle(whyTitle).textAlign : "",
      whyTitleTextShadow: whyTitle ? getComputedStyle(whyTitle).textShadow : "",
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
      whyImageFilter: whyImage ? getComputedStyle(whyImage).filter : "",
      whyImageObjectFit: whyImage ? getComputedStyle(whyImage).objectFit : "",
      whyImageOpacity: whyImage ? getComputedStyle(whyImage).opacity : "",
      plugSectionClass: plugSection?.className ?? "",
      plugSplitBox: box(plugSplit),
      plugMediaBox: box(plugMedia),
      plugPanelBox: box(plugPanel),
      plugPanelBackground: plugPanel ? getComputedStyle(plugPanel).backgroundColor : "",
      plugPanelShadow: plugPanel ? getComputedStyle(plugPanel).boxShadow : "",
      plugCaptionBox: box(plugCaption),
      plugCaptionText: clean(plugCaption?.textContent),
      plugCaptionColor: plugCaption ? getComputedStyle(plugCaption).color : "",
      plugCaptionFamily: plugCaption ? getComputedStyle(plugCaption).fontFamily : "",
      plugCaptionShadow: plugCaption ? getComputedStyle(plugCaption).textShadow : "",
      plugCaptionWhiteSpace: plugCaption ? getComputedStyle(plugCaption).whiteSpace : "",
      plugTitleBox: box(plugTitle),
      plugTitleAria: plugTitle?.getAttribute("aria-label") ?? "",
      plugTitleSpans: Array.from(plugTitle?.querySelectorAll("span") ?? []).map((node) =>
        clean(node.textContent),
      ),
      plugTitleAlign: plugTitle ? getComputedStyle(plugTitle).textAlign : "",
      plugBodyBox: box(plugBody),
      plugBodyText: clean(plugBodyText?.textContent),
      plugBodyAlign: plugBody ? getComputedStyle(plugBody).textAlign : "",
      plugCtaHref: plugCta?.getAttribute("href") ?? "",
      plugCtaText: clean(plugCta?.textContent),
      plugPosterSrc: plugPoster?.currentSrc || plugPoster?.src || "",
      plugMotionState: plugFrame?.getAttribute("data-motion-state") ?? "",
      plugVideoReady: plugFrame?.getAttribute("data-video-ready") ?? "",
      plugVideoPoster: plugVideo?.getAttribute("poster") ?? "",
      plugVideoPreload: plugVideo?.getAttribute("preload") ?? "",
      plugVideoAttributes: plugVideo
        ? {
            autoPlay: plugVideo.autoplay,
            controls: plugVideo.controls,
            loop: plugVideo.loop,
            muted: plugVideo.muted,
            playsInline: plugVideo.playsInline,
          }
        : null,
      plugVideoSources: Array.from(plugVideo?.querySelectorAll("source") ?? []).map((source) => ({
        src: source.getAttribute("src"),
        type: source.getAttribute("type"),
      })),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });

  expect(desktop.visibleCoreDisplayHeading).toBe(false);
  expect(desktop.oldSupportHeadingCount).toBe(0);
  expect(desktop.oldPlugHeadingCount).toBe(0);
  expect(desktop.oldSupportEyebrowCount).toBe(0);
  expect(desktop.coreIntroText).toBe(
    "Simple by design: cleanse the surface, apply the treatment layer, then finish with moisture and barrier support.",
  );
  expect(desktop.coreIntroLines).toBeLessThanOrEqual(1.25);
  expect(desktop.coreIntroWidth).toBeGreaterThan(720);
  expect(desktop.coreStepGridExists).toBe(false);
  expect(desktop.coreStepCardCount).toBe(0);
  expect(desktop.coreProductNames).toEqual(["CLEANSE", "TREAT", "SEAL"]);
  expect(desktop.whyClass).toContain("home-section--why");
  expect(desktop.whyIndex).toBe(desktop.coreIndex + 1);
  expect(desktop.plugIndex).toBe(desktop.whyIndex + 1);
  expect(desktop.whyBackground).toBe(desktop.bodyBackground);
  expect(desktop.whyPrinciplesBackground).toBe(desktop.bodyBackground);
  expect(desktop.whyBox?.height).toBeGreaterThanOrEqual(desktop.viewportHeight * 1.1);
  expect(desktop.whyBox?.height).toBeLessThanOrEqual(desktop.viewportHeight * 1.17);
  expect(Math.abs((desktop.whyPrinciplesBox?.height ?? 0) - (desktop.whyVisualBox?.height ?? 0)))
    .toBeLessThanOrEqual(2);
  expect(desktop.whyVisualBox?.height).toBeGreaterThanOrEqual(desktop.viewportHeight * 1.1);
  expect(desktop.whyStatements).toEqual([
    "01 Start with structure skin understands.",
    "02 Most routines fail because they ask for too much too soon.",
    "03 Three steps build consistency.",
  ]);
  expect(desktop.whyStatementStyle?.letterSpacing).not.toBe("normal");
  expect(desktop.whyListBox?.height).toBeGreaterThanOrEqual(desktop.viewportHeight * 0.54);
  expect(desktop.whyListBox?.height).toBeLessThanOrEqual(desktop.viewportHeight * 0.64);
  expect((desktop.whyListBox?.top ?? 0) - (desktop.whyPrinciplesBox?.top ?? 0))
    .toBeGreaterThan(desktop.viewportHeight * 0.2);
  expect((desktop.whyPrinciplesBox?.bottom ?? 0) - (desktop.whyListBox?.bottom ?? 0))
    .toBeGreaterThan(desktop.viewportHeight * 0.2);
  expect(desktop.whyVisualBox?.left).toBeGreaterThanOrEqual(desktop.whyPrinciplesBox?.right ?? 0);
  expect(desktop.whyVisualBox?.right).toBe(desktop.whyBox?.right);
  expect(desktop.whyVisualAfterContent).toBe("none");
  expect(desktop.whyTitleText).toBe("SIMPLE IS NOT BASIC");
  expect(desktop.whyTitleColor).toBe("rgb(255, 255, 255)");
  expect(desktop.whyTitleFamily).toMatch(/Marcellus/i);
  expect(desktop.whyTitleAlign).toBe("right");
  expect(desktop.whyTitleTextShadow).toContain("rgba");
  expect(desktop.whyTitleTextShadow.split("rgba").length).toBeGreaterThanOrEqual(4);
  expect(desktop.whyTitleBox?.right).toBeLessThanOrEqual(desktop.whyVisualBox?.right ?? 0);
  expect((desktop.whyVisualBox?.right ?? 0) - (desktop.whyTitleBox?.right ?? 0))
    .toBeLessThan(36);
  expect((desktop.whyVisualBox?.bottom ?? 0) - (desktop.whyTitleBox?.bottom ?? 0))
    .toBeLessThan(36);
  const whyImageSrc = decodeURIComponent(desktop.whyImageSrc);
  expect(whyImageSrc).toContain("/media/home/why-three.webp");
  expect(whyImageSrc).not.toContain("/_next/image");
  expect(whyImageSrc).not.toContain("/mnt/data");
  expect(desktop.whyImageAlt).toBe("Black-and-white editorial portrait.");
  expect(desktop.whyImageFilter).toBe("none");
  expect(desktop.whyImageObjectFit).toBe("cover");
  expect(desktop.whyImageOpacity).toBe("1");
  expect(desktop.plugSectionClass).toContain("home-section--core-support");
  expect((desktop.plugMediaBox?.width ?? 0) / (desktop.plugSplitBox?.width ?? 1))
    .toBeGreaterThan(0.62);
  expect((desktop.plugMediaBox?.width ?? 0) / (desktop.plugSplitBox?.width ?? 1))
    .toBeLessThan(0.68);
  expect(desktop.plugMediaBox?.right).toBeLessThanOrEqual(desktop.plugPanelBox?.left ?? 0);
  expect(desktop.plugPanelBackground).toBe(desktop.bodyBackground);
  expect(desktop.plugPanelShadow).toBe("none");
  expect(desktop.plugCaptionText).toBe("For skin that is clearer, more hydrated, and less tired.");
  expect(desktop.plugCaptionColor).toBe("rgb(255, 255, 255)");
  expect(desktop.plugCaptionFamily).toMatch(/Marcellus/i);
  expect(desktop.plugCaptionShadow).toContain("rgba");
  expect(desktop.plugCaptionWhiteSpace).toBe("nowrap");
  expect((desktop.plugCaptionBox?.left ?? 0) - (desktop.plugMediaBox?.left ?? 0))
    .toBeLessThan(60);
  expect((desktop.plugMediaBox?.bottom ?? 0) - (desktop.plugCaptionBox?.bottom ?? 0))
    .toBeLessThan(60);
  expect(desktop.plugTitleAria).toBe("Plug and Play");
  expect(desktop.plugTitleSpans).toEqual(["Plug", "and", "Play"]);
  expect(desktop.plugTitleAlign).toBe("right");
  expect((desktop.plugTitleBox?.top ?? 0) - (desktop.plugPanelBox?.top ?? 0)).toBeLessThan(90);
  expect((desktop.plugPanelBox?.right ?? 0) - (desktop.plugTitleBox?.right ?? 0))
    .toBeLessThan(60);
  expect(desktop.plugBodyText).toBe(
    "The Core is designed to work as a full routine, but it does not need to replace yours. Upgrade the layer your current routine is missing or underperforming in.",
  );
  expect(desktop.plugBodyAlign).toBe("right");
  expect((desktop.plugPanelBox?.bottom ?? 0) - (desktop.plugBodyBox?.bottom ?? 0))
    .toBeLessThan(90);
  expect((desktop.plugPanelBox?.right ?? 0) - (desktop.plugBodyBox?.right ?? 0))
    .toBeLessThan(60);
  expect(desktop.plugCtaText).toBe("Explore The Core");
  expect(desktop.plugCtaHref).toBe("#core-three");
  const plugPosterSrc = decodeURIComponent(desktop.plugPosterSrc);
  expect(plugPosterSrc).toContain("/media/home/plug-and-play-poster.webp");
  expect(plugPosterSrc).not.toContain("/mnt/data");
  expect(["pending", "motion", "static", "failed"]).toContain(desktop.plugMotionState);
  if (desktop.plugVideoSources.length > 0) {
    expect(desktop.plugVideoPoster).toBe("/media/home/plug-and-play-poster.webp");
    expect(desktop.plugVideoPreload).toBe("metadata");
    expect(desktop.plugVideoAttributes).toEqual({
      autoPlay: true,
      controls: false,
      loop: true,
      muted: true,
      playsInline: true,
    });
    expect(desktop.plugVideoSources).toEqual([
      { src: "/media/home/plug-and-play-loop.mp4", type: "video/mp4" },
    ]);
  } else {
    expect(desktop.plugMotionState).toBe("static");
  }
  expect(desktop.overflow).toBeLessThanOrEqual(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.locator(".home-plug-media__frame").waitFor({ state: "attached" });
  const mobile = await page.evaluate(() => {
    const why = document.querySelector<HTMLElement>(".home-section--why");
    const whyPrinciples = why?.querySelector<HTMLElement>(".home-why-principles");
    const whyList = why?.querySelector<HTMLElement>(".home-why-list");
    const whyVisual = why?.querySelector<HTMLElement>(".home-why-visual");
    const whyTitle = why?.querySelector<HTMLElement>(".home-why-visual__title");
    const plugSection = document.querySelector<HTMLElement>(".home-section--core-support");
    const plugMedia = plugSection?.querySelector<HTMLElement>(".home-plug-media");
    const plugPanel = plugSection?.querySelector<HTMLElement>(".home-plug-panel");
    const plugCaption = plugSection?.querySelector<HTMLElement>(".home-plug-media__caption");
    const plugTitle = plugSection?.querySelector<HTMLElement>("#plug-play-heading");
    const plugBody = plugSection?.querySelector<HTMLElement>(".home-plug-panel__body");
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
      viewportHeight: window.innerHeight,
      bodyBackground: getComputedStyle(document.body).backgroundColor,
      whyBox: box(why),
      whyBackground: why ? getComputedStyle(why).backgroundColor : "",
      whyPrinciplesBackground: whyPrinciples ? getComputedStyle(whyPrinciples).backgroundColor : "",
      whyPrinciplesBox: box(whyPrinciples),
      whyListBox: box(whyList),
      whyVisualBox: box(whyVisual),
      whyTitleBox: box(whyTitle),
      whyTitleAlign: whyTitle ? getComputedStyle(whyTitle).textAlign : "",
      plugSectionBox: box(plugSection),
      plugMediaBox: box(plugMedia),
      plugPanelBox: box(plugPanel),
      plugPanelAlign: plugPanel ? getComputedStyle(plugPanel).textAlign : "",
      plugPanelBackground: plugPanel ? getComputedStyle(plugPanel).backgroundColor : "",
      plugCaptionWhiteSpace: plugCaption ? getComputedStyle(plugCaption).whiteSpace : "",
      plugTitleAlign: plugTitle ? getComputedStyle(plugTitle).textAlign : "",
      plugBodyAlign: plugBody ? getComputedStyle(plugBody).textAlign : "",
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });

  expect(mobile.whyBackground).toBe(mobile.bodyBackground);
  expect(mobile.whyPrinciplesBackground).toBe(mobile.bodyBackground);
  expect(mobile.whyBox?.height).toBeGreaterThanOrEqual(mobile.viewportHeight);
  expect(mobile.whyBox?.height).toBeLessThanOrEqual(mobile.viewportHeight * 1.3);
  expect(mobile.whyListBox?.height).toBeGreaterThanOrEqual(150);
  expect(mobile.whyListBox?.height).toBeLessThanOrEqual(230);
  expect(mobile.whyVisualBox?.top).toBeGreaterThanOrEqual(mobile.whyPrinciplesBox?.bottom ?? 0);
  expect(mobile.whyTitleAlign).toBe("right");
  expect((mobile.whyVisualBox?.right ?? 0) - (mobile.whyTitleBox?.right ?? 0))
    .toBeLessThan(40);
  expect((mobile.whyVisualBox?.bottom ?? 0) - (mobile.whyTitleBox?.bottom ?? 0))
    .toBeLessThan(48);
  expect(mobile.plugMediaBox?.top).toBeGreaterThanOrEqual(mobile.plugSectionBox?.top ?? 0);
  expect(mobile.plugPanelBox?.top).toBeGreaterThanOrEqual((mobile.plugMediaBox?.bottom ?? 0) - 1);
  expect(mobile.plugMediaBox?.height).toBeGreaterThanOrEqual(420);
  expect(mobile.plugMediaBox?.height).toBeLessThanOrEqual(680);
  expect(mobile.plugPanelBox?.height).toBeGreaterThanOrEqual(330);
  expect(mobile.plugPanelAlign).toBe("right");
  expect(mobile.plugPanelBackground).toBe(mobile.bodyBackground);
  expect(mobile.plugCaptionWhiteSpace).toBe("normal");
  expect(mobile.plugTitleAlign).toBe("right");
  expect(mobile.plugBodyAlign).toBe("right");
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
