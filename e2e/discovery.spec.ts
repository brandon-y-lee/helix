import { test, expect } from "@playwright/test";

// Homepage merchandising modules are rendered from the seeded Supabase catalog
// (server-side). They are product discovery and positioning surfaces, not
// interactive search, so they do not depend on Algolia.

function scaleFromTransform(transform: string) {
  if (!transform || transform === "none") return 1;

  const matrix = transform.match(/^matrix\(([^,]+),/);
  if (matrix?.[1]) {
    return Number.parseFloat(matrix[1]);
  }

  const scale = transform.match(/^scale\(([^)]+)\)/);
  return scale?.[1] ? Number.parseFloat(scale[1]) : 1;
}

test("homepage Core Three ladder renders", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Your skin starts with three steps." }),
  ).toBeVisible();
  await expect(page.getByText("Cleanse. Treat. Seal.")).toBeVisible();
  await expect(page.getByRole("region", { name: "The Core", exact: true }))
    .toBeVisible();
  await expect(page.getByRole("heading", { name: "Cleanse, Treat, Seal." }))
    .toHaveCount(0);
  await expect(
    page.getByText(
      "01 Start with structure that skin understands: cleanse first, treat second, seal last.",
    ),
  ).toBeVisible();
  await expect(
    page.getByText(
      "02 Use high-performing, innovative ingredients at efficacious levels in your essential layers.",
    ),
  ).toBeVisible();
  await expect(
    page.getByText(
      "03 Most routines fail because they ask for too much too soon. Three steps build consistency.",
    ),
  ).toBeVisible();
  await expect(page.locator("#why-three-heading")).toHaveText(/simple is\s+not basic\.?/i);
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
  await expect(page.locator("#beyond-heading")).toHaveText("Beyond The Core");
  await expect(
    page.getByText("For when your skin has a high baseline. Add what you need."),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: /^(Know what each step is doing\.|Know what you are using\.)$/,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Invest in your skin's future.",
    }),
  ).toBeVisible();
});

test("homepage section eyebrows share the Core section treatment", async ({ page }) => {
  await page.goto("/");

  const styles = await page.evaluate(() => {
    const labels = [
      "The Core",
      "Ingredient Literacy",
      "Start Here",
      "Mei Pelle",
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
  for (const label of [
    "Ingredient Literacy",
    "Start Here",
    "Mei Pelle",
    "Plug and Play",
    "What The Core Supports",
  ]) {
    expect(styles[label]).toBeNull();
  }
});

test("homepage ingredient cards navigate to matching System ingredient anchors", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });

  const targets = [
    {
      name: "Read about PDRN in the System",
      href: "/system#system-ingredient-pdrn",
      heading: "PDRN / Sodium DNA",
    },
    {
      name: "Read about Peptides in the System",
      href: "/system#system-ingredient-peptides",
      heading: "Peptides",
    },
    {
      name: "Read about Niacinamide in the System",
      href: "/system#system-ingredient-niacinamide",
      heading: "Niacinamide",
    },
  ] as const;

  for (const target of targets) {
    await page.goto("/");
    const link = page.getByRole("link", { name: target.name });
    await expect(link).toHaveAttribute("href", target.href);
    await expect(link.locator("a")).toHaveCount(0);

    await link.scrollIntoViewIfNeeded();
    await expect(link).toBeVisible();
    await Promise.all([
      page.waitForURL(new RegExp(`${target.href.replace("#", "\\#")}$`), { timeout: 15_000 }),
      link.click(),
    ]);

    const card = page.locator(`#${target.href.split("#")[1]}`);
    await expect(card.getByRole("heading", { name: target.heading })).toBeVisible();
    const anchorPosition = await card.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const headerBottom =
        document.querySelector(".site-header")?.getBoundingClientRect().bottom ?? 0;
      return {
        headerBottom: Math.round(headerBottom),
        scrollMarginTop: Number.parseFloat(getComputedStyle(element).scrollMarginTop),
        top: Math.round(rect.top),
      };
    });

    expect(anchorPosition.scrollMarginTop).toBeGreaterThanOrEqual(88);
    expect(anchorPosition.top).toBeGreaterThanOrEqual(anchorPosition.headerBottom + 8);
  }
});

test("homepage final CTA video uses poster-only treatment for reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  const finalSection = page.locator(".home-section--final");
  const media = finalSection.locator(".home-final-media");

  await expect(finalSection.getByRole("heading", { name: "Invest in your skin's future." }))
    .toBeVisible();
  await expect(media).toHaveAttribute("data-motion-state", "static");
  await expect(finalSection.locator(".home-final-media__poster")).toBeVisible();
  await expect(finalSection.locator("video")).toHaveCount(0);
});

test("homepage core narrative uses taller why and asymmetric plug video sections", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await page.locator(".home-plug-media__frame").waitFor({ state: "attached" });
  await page.locator(".home-why-visual__zoom").waitFor({ state: "attached" });
  await expect(page.locator(".home-why-visual__zoom")).toHaveAttribute(
    "data-scroll-zoom-motion",
    "motion",
  );

  const desktop = await page.evaluate(() => {
    const clean = (text: string | null | undefined) =>
      text?.replace(/\s+/g, " ").trim() ?? "";
    const sections = Array.from(document.querySelectorAll<HTMLElement>("main > section"));
    const headings = Array.from(document.querySelectorAll<HTMLElement>("h2"));
    const core = document.querySelector<HTMLElement>("#core-three");
    const why = document.querySelector<HTMLElement>(".home-section--why");
    const plugSection = document.querySelector<HTMLElement>(".home-section--core-support");
    const coreIntro = core?.querySelector<HTMLElement>(".home-section__intro--core");
    const coreEyebrow = coreIntro?.querySelector<HTMLElement>(".hero__eyebrow");
    const coreDescription = coreIntro?.querySelector<HTMLElement>("p:not(.hero__eyebrow)");
    const coreProducts = core?.querySelector<HTMLElement>(".home-core-products");
    const whyPrinciples = why?.querySelector<HTMLElement>(".home-why-principles");
    const whyList = why?.querySelector<HTMLElement>(".home-why-list");
    const whyVisual = why?.querySelector<HTMLElement>(".home-why-visual");
    const whyTitle = why?.querySelector<HTMLElement>("#why-three-heading");
    const whyZoom = why?.querySelector<HTMLElement>(".home-why-visual__zoom");
    const whyImage = why?.querySelector<HTMLImageElement>(".home-why-visual img");
    const plugSplit = plugSection?.querySelector<HTMLElement>(".home-plug-split");
    const plugMedia = plugSection?.querySelector<HTMLElement>(".home-plug-media");
    const plugPanel = plugSection?.querySelector<HTMLElement>(".home-plug-panel");
    const plugCaption = plugSection?.querySelector<HTMLElement>(".home-plug-media__caption");
    const plugTitle = plugSection?.querySelector<HTMLElement>("#plug-play-heading");
    const plugBody = plugSection?.querySelector<HTMLElement>(".home-plug-panel__body");
    const plugBodyParagraph = plugBody?.querySelector<HTMLElement>("p");
    const plugCta = plugBody?.querySelector<HTMLAnchorElement>("a");
    const plugPoster = plugSection?.querySelector<HTMLImageElement>(".home-plug-media__poster");
    const plugFrame = plugSection?.querySelector<HTMLElement>(".home-plug-media__frame");
    const plugVideo = plugSection?.querySelector<HTMLVideoElement>(".home-plug-media__video");
    const beyondTitle = document.querySelector<HTMLElement>("#beyond-heading");
    const beyondDescription = beyondTitle?.parentElement?.querySelector<HTMLElement>(
      "p:not(.hero__eyebrow)",
    );
    const ingredientsTitle = document.querySelector<HTMLElement>("#ingredients-heading");
    const ingredientsDescription = ingredientsTitle?.parentElement?.querySelector<HTMLElement>(
      "p:not(.hero__eyebrow)",
    );
    const finalSection = document.querySelector<HTMLElement>(".home-section--final");
    const final = finalSection?.querySelector<HTMLElement>(".home-final");
    const finalTitle = document.querySelector<HTMLElement>("#final-heading");
    const finalDescription = final?.querySelector<HTMLElement>("p:not(.hero__eyebrow)");
    const finalActions = final?.querySelector<HTMLElement>(".hero__actions");
    const finalPoster = finalSection?.querySelector<HTMLImageElement>(".home-final-media__poster");
    const finalMedia = finalSection?.querySelector<HTMLElement>(".home-final-media");
    const finalVideo = finalSection?.querySelector<HTMLVideoElement>(".home-final-media__video");
    const homeIngredientCards = Array.from(
      document.querySelectorAll<HTMLAnchorElement>(".home-ingredient-card"),
    );

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
    const textStyle = (element: HTMLElement | null | undefined) => {
      if (!element) return null;
      const style = getComputedStyle(element);
      return {
        color: style.color,
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        letterSpacing: style.letterSpacing,
        lineHeight: style.lineHeight,
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
      oldCoreDescriptionCount: Array.from(core?.querySelectorAll<HTMLElement>("p") ?? [])
        .filter((node) =>
          clean(node.textContent) ===
          "Simple by design: cleanse the surface, apply the treatment layer, then finish with moisture and barrier support."
        ).length,
      coreIntroBox: box(coreIntro),
      coreEyebrowText: clean(coreEyebrow?.textContent),
      coreEyebrowStyle: coreEyebrow
        ? {
            color: getComputedStyle(coreEyebrow).color,
            fontSize: getComputedStyle(coreEyebrow).fontSize,
            fontWeight: getComputedStyle(coreEyebrow).fontWeight,
            letterSpacing: getComputedStyle(coreEyebrow).letterSpacing,
            textAlign: getComputedStyle(coreEyebrow).textAlign,
          }
        : null,
      coreDescriptionText: clean(coreDescription?.textContent),
      coreDescriptionStyle: textStyle(coreDescription),
      coreProductGridBox: box(coreProducts),
      coreProgressCount: core?.querySelectorAll(".home-core-progress").length ?? 0,
      coreProgressShellCount: core?.querySelectorAll(".home-core-progress-shell").length ?? 0,
      coreRailCount: core?.querySelectorAll(".home-core-progress__rail").length ?? 0,
      coreNodeCount: core?.querySelectorAll(".home-core-progress__node-item").length ?? 0,
      coreStepNumberCount: core?.querySelectorAll(".home-core-progress__step-number").length ?? 0,
      coreMiniDescriptionCount:
        core?.querySelectorAll(".home-core-progress__mini-description").length ?? 0,
      coreActiveDataCount: core?.querySelectorAll("[data-core-active]").length ?? 0,
      coreStepDataCount: core?.querySelectorAll("[data-core-step]").length ?? 0,
      standardContentLeft: Math.round(coreIntro?.getBoundingClientRect().left ?? 0),
      beyondDescriptionStyle: textStyle(beyondDescription),
      beyondTitleStyle: textStyle(beyondTitle),
      finalBox: box(final),
      finalDescriptionStyle: textStyle(finalDescription),
      finalDescriptionText: clean(finalDescription?.textContent),
      finalDescriptionActionsGap: finalDescription && finalActions
        ? Math.round(finalActions.getBoundingClientRect().top - finalDescription.getBoundingClientRect().bottom)
        : null,
      finalEyebrowCount: finalSection?.querySelectorAll(".hero__eyebrow").length ?? 0,
      finalMediaBox: box(finalMedia),
      finalMotionState: finalMedia?.getAttribute("data-motion-state") ?? "",
      finalPosterSrc: finalPoster?.currentSrc || finalPoster?.src || "",
      finalSectionBox: box(finalSection),
      finalTitleStyle: textStyle(finalTitle),
      finalVideoAttributes: finalVideo
        ? {
            autoPlay: finalVideo.autoplay,
            controls: finalVideo.controls,
            loop: finalVideo.loop,
            muted: finalVideo.muted,
            playsInline: finalVideo.playsInline,
          }
        : null,
      finalVideoPoster: finalVideo?.getAttribute("poster") ?? "",
      finalVideoPreload: finalVideo?.getAttribute("preload") ?? "",
      finalVideoSources: Array.from(finalVideo?.querySelectorAll("source") ?? []).map((source) => ({
        src: source.getAttribute("src"),
        type: source.getAttribute("type"),
      })),
      finalVideoReady: finalMedia?.getAttribute("data-video-ready") ?? "",
      ingredientEyebrowCount:
        ingredientsTitle?.parentElement?.querySelectorAll(".hero__eyebrow").length ?? 0,
      ingredientHeadingGap: ingredientsTitle && ingredientsDescription
        ? Math.round(
            ingredientsDescription.getBoundingClientRect().top -
              ingredientsTitle.getBoundingClientRect().bottom,
          )
        : null,
      ingredientPreviewLinks: homeIngredientCards.map((card) => ({
        ariaLabel: card.getAttribute("aria-label"),
        href: card.getAttribute("href"),
        text: clean(card.textContent),
      })),
      ingredientsDescriptionStyle: textStyle(ingredientsDescription),
      ingredientsTitleStyle: textStyle(ingredientsTitle),
      coreStepGridExists: Boolean(core?.querySelector(".home-step-grid")),
      coreStepCardCount: core?.querySelectorAll(".home-step-card").length ?? 0,
      coreProductNames: Array.from(core?.querySelectorAll(".product-card__name") ?? []).map((node) =>
        clean(node.textContent),
      ),
      viewportHeight: window.innerHeight,
      bodyBackground: getComputedStyle(document.body).backgroundColor,
      whyClass: why?.className ?? "",
      whyBackground: why ? getComputedStyle(why).backgroundColor : "",
      whyBorderTopWidth: why ? getComputedStyle(why).borderTopWidth : "",
      whyBorderBottomWidth: why ? getComputedStyle(why).borderBottomWidth : "",
      whyPrinciplesBackground: whyPrinciples ? getComputedStyle(whyPrinciples).backgroundColor : "",
      whyBox: box(why),
      whyPrinciplesBox: box(whyPrinciples),
      whyListBox: box(whyList),
      whyVisualBox: box(whyVisual),
      whyVisualAfterContent: whyVisual ? getComputedStyle(whyVisual, "::after").content : "",
      whyVisualOverlayCount: whyVisual?.querySelectorAll(".home-why-visual__title").length ?? 0,
      whyTitleBox: box(whyTitle),
      whyTitleText: clean(whyTitle?.textContent),
      whyTitleColor: whyTitle ? getComputedStyle(whyTitle).color : "",
      whyTitleFamily: whyTitle ? getComputedStyle(whyTitle).fontFamily : "",
      whyTitleFontSize: whyTitle ? getComputedStyle(whyTitle).fontSize : "",
      whyTitleLineHeight: whyTitle ? getComputedStyle(whyTitle).lineHeight : "",
      whyTitleAlign: whyTitle ? getComputedStyle(whyTitle).textAlign : "",
      whyTitleTextTransform: whyTitle ? getComputedStyle(whyTitle).textTransform : "",
      whyTitleWhiteSpace: whyTitle ? getComputedStyle(whyTitle).whiteSpace : "",
      whyTitleTextShadow: whyTitle ? getComputedStyle(whyTitle).textShadow : "",
      whyTitleClass: whyTitle?.className ?? "",
      whyTitleParentClass: whyTitle?.parentElement?.className ?? "",
      whyPanelPaddingLeft: whyPrinciples ? getComputedStyle(whyPrinciples).paddingLeft : "",
      whyZoomMotion: whyZoom?.getAttribute("data-scroll-zoom-motion") ?? "",
      whyZoomActive: whyZoom?.getAttribute("data-scroll-zoom-active") ?? "",
      whyStatements: Array.from(why?.querySelectorAll(".home-why-list li") ?? []).map((node) =>
        clean(node.textContent),
      ),
      whyStatementLineBoxes: Array.from(why?.querySelectorAll(".home-why-list li") ?? []).map((node) => {
        const rect = node.getBoundingClientRect();
        return {
          bottom: Math.round(rect.bottom),
          height: Math.round(rect.height),
          top: Math.round(rect.top),
        };
      }),
      whyStatementStyle: why?.querySelector(".home-why-list li")
        ? {
            color: getComputedStyle(why.querySelector(".home-why-list li") as HTMLElement)
              .color,
            fontFamily: getComputedStyle(why.querySelector(".home-why-list li") as HTMLElement)
              .fontFamily,
            fontSize: getComputedStyle(why.querySelector(".home-why-list li") as HTMLElement)
              .fontSize,
            fontWeight: getComputedStyle(why.querySelector(".home-why-list li") as HTMLElement)
              .fontWeight,
            letterSpacing: getComputedStyle(why.querySelector(".home-why-list li") as HTMLElement)
              .letterSpacing,
            lineHeight: getComputedStyle(why.querySelector(".home-why-list li") as HTMLElement)
              .lineHeight,
          }
        : null,
      plugBodyParagraphStyle: plugBodyParagraph
        ? {
            color: getComputedStyle(plugBodyParagraph).color,
            fontFamily: getComputedStyle(plugBodyParagraph).fontFamily,
            fontSize: getComputedStyle(plugBodyParagraph).fontSize,
            fontWeight: getComputedStyle(plugBodyParagraph).fontWeight,
            letterSpacing: getComputedStyle(plugBodyParagraph).letterSpacing,
            lineHeight: getComputedStyle(plugBodyParagraph).lineHeight,
          }
        : null,
      whyImageSrc: whyImage?.currentSrc || whyImage?.src || "",
      whyImageAlt: whyImage?.alt ?? "",
      whyImageFilter: whyImage ? getComputedStyle(whyImage).filter : "",
      whyImageObjectFit: whyImage ? getComputedStyle(whyImage).objectFit : "",
      whyImageOpacity: whyImage ? getComputedStyle(whyImage).opacity : "",
      whyImageTransform: whyImage ? getComputedStyle(whyImage).transform : "",
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
      plugTitleColor: plugTitle ? getComputedStyle(plugTitle).color : "",
      plugTitleFamily: plugTitle ? getComputedStyle(plugTitle).fontFamily : "",
      plugTitleFontSize: plugTitle ? getComputedStyle(plugTitle).fontSize : "",
      plugTitleLineHeight: plugTitle ? getComputedStyle(plugTitle).lineHeight : "",
      plugTitleStyle: textStyle(plugTitle),
      plugTitleAlign: plugTitle ? getComputedStyle(plugTitle).textAlign : "",
      plugTitleDisplay: plugTitle ? getComputedStyle(plugTitle).display : "",
      plugTitleRowGap: plugTitle ? getComputedStyle(plugTitle).rowGap : "",
      plugTitleLineBoxes: Array.from(plugTitle?.querySelectorAll("span") ?? []).map((node) => {
        const rect = node.getBoundingClientRect();
        return {
          bottom: rect.bottom,
          height: rect.height,
          text: clean(node.textContent),
          top: rect.top,
        };
      }),
      plugBodyBox: box(plugBody),
      plugBodyText: Array.from(plugBody?.querySelectorAll("p") ?? [])
        .map((node) => clean(node.textContent))
        .join(" "),
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
  expect(desktop.oldCoreDescriptionCount).toBe(0);
  expect(desktop.coreEyebrowText).toBe("The Core");
  expect(desktop.coreEyebrowStyle?.fontWeight).toBe("900");
  expect(["left", "start"]).toContain(desktop.coreEyebrowStyle?.textAlign);
  expect(desktop.coreDescriptionText).toBe("Simple by design. For all skin types.");
  expect(desktop.coreDescriptionStyle).toEqual(desktop.plugBodyParagraphStyle);
  expect(desktop.coreIntroBox?.width).toBeGreaterThan(920);
  expect(desktop.coreProductGridBox?.width).toBeGreaterThan(920);
  expect(desktop.coreProgressCount).toBe(0);
  expect(desktop.coreProgressShellCount).toBe(0);
  expect(desktop.coreRailCount).toBe(0);
  expect(desktop.coreNodeCount).toBe(0);
  expect(desktop.coreStepNumberCount).toBe(0);
  expect(desktop.coreMiniDescriptionCount).toBe(0);
  expect(desktop.coreActiveDataCount).toBe(0);
  expect(desktop.coreStepDataCount).toBe(0);
  expect(desktop.beyondDescriptionStyle).toEqual(desktop.plugBodyParagraphStyle);
  expect(desktop.ingredientsDescriptionStyle).toEqual(desktop.plugBodyParagraphStyle);
  expect(desktop.finalDescriptionStyle).toEqual(desktop.plugBodyParagraphStyle);
  expect(desktop.ingredientsTitleStyle).toEqual(desktop.plugTitleStyle);
  expect(desktop.finalTitleStyle).toEqual(desktop.plugTitleStyle);
  expect(desktop.ingredientEyebrowCount).toBe(0);
  expect(desktop.ingredientHeadingGap).toBeGreaterThanOrEqual(24);
  expect(desktop.ingredientPreviewLinks).toEqual([
    expect.objectContaining({
      ariaLabel: "Read about PDRN in the System",
      href: "/system#system-ingredient-pdrn",
    }),
    expect.objectContaining({
      ariaLabel: "Read about Peptides in the System",
      href: "/system#system-ingredient-peptides",
    }),
    expect.objectContaining({
      ariaLabel: "Read about Niacinamide in the System",
      href: "/system#system-ingredient-niacinamide",
    }),
  ]);
  for (const link of desktop.ingredientPreviewLinks) {
    expect(link.href).not.toContain("/method");
  }
  expect(desktop.finalEyebrowCount).toBe(0);
  expect(desktop.finalSectionBox?.height).toBeLessThanOrEqual(desktop.viewportHeight * 0.72);
  expect(desktop.finalSectionBox?.height).toBeGreaterThanOrEqual(desktop.viewportHeight * 0.45);
  expect(
    Math.abs(
      ((desktop.finalBox?.top ?? 0) - (desktop.finalSectionBox?.top ?? 0)) -
        ((desktop.finalSectionBox?.bottom ?? 0) - (desktop.finalBox?.bottom ?? 0)),
    ),
  ).toBeLessThanOrEqual(2);
  expect(desktop.finalDescriptionText).toBe(
    "Three steps, one order, repeatable morning or night.",
  );
  expect(desktop.finalDescriptionActionsGap).toBeGreaterThanOrEqual(2);
  expect(desktop.finalDescriptionActionsGap).toBeLessThanOrEqual(32);
  expect(desktop.finalMediaBox?.width).toBe(desktop.finalSectionBox?.width);
  expect(desktop.finalMediaBox?.height).toBe(desktop.finalSectionBox?.height);
  const finalPosterSrc = decodeURIComponent(desktop.finalPosterSrc);
  expect(finalPosterSrc).toContain("/media/home/final-cta-poster.webp");
  expect(finalPosterSrc).not.toContain("/mnt/data");
  expect(["pending", "motion", "static", "failed"]).toContain(desktop.finalMotionState);
  if (desktop.finalVideoSources.length > 0) {
    expect(desktop.finalVideoPoster).toBe("/media/home/final-cta-poster.webp");
    expect(desktop.finalVideoPreload).toBe("metadata");
    expect(desktop.finalVideoAttributes).toEqual({
      autoPlay: true,
      controls: false,
      loop: true,
      muted: true,
      playsInline: true,
    });
    expect(desktop.finalVideoSources).toEqual([
      { src: "/media/home/final-cta-loop.mp4", type: "video/mp4" },
    ]);
  } else {
    expect(desktop.finalMotionState).toBe("static");
  }
  expect(desktop.coreStepGridExists).toBe(false);
  expect(desktop.coreStepCardCount).toBe(0);
  expect(desktop.coreProductNames).toEqual(["CLEANSE", "TREAT", "SEAL"]);
  expect(desktop.whyClass).toContain("home-section--why");
  expect(desktop.whyIndex).toBe(desktop.coreIndex + 1);
  expect(desktop.plugIndex).toBe(desktop.whyIndex + 1);
  expect(desktop.whyBackground).toBe(desktop.bodyBackground);
  expect(desktop.whyBorderTopWidth).toBe("0px");
  expect(desktop.whyBorderBottomWidth).toBe("0px");
  expect(desktop.whyPrinciplesBackground).toBe(desktop.bodyBackground);
  expect(desktop.whyBox?.height).toBeGreaterThanOrEqual(desktop.viewportHeight * 1.1);
  expect(desktop.whyBox?.height).toBeLessThanOrEqual(desktop.viewportHeight * 1.17);
  expect(Math.abs((desktop.whyPrinciplesBox?.height ?? 0) - (desktop.whyVisualBox?.height ?? 0)))
    .toBeLessThanOrEqual(2);
  expect(desktop.whyVisualBox?.height).toBeGreaterThanOrEqual(desktop.viewportHeight * 1.1);
  expect(desktop.whyStatements).toEqual([
    "01 Start with structure that skin understands: cleanse first, treat second, seal last.",
    "02 Use high-performing, innovative ingredients at efficacious levels in your essential layers.",
    "03 Most routines fail because they ask for too much too soon. Three steps build consistency.",
  ]);
  expect(desktop.whyStatementStyle).toEqual(desktop.plugBodyParagraphStyle);
  const whyStatementGaps = desktop.whyStatementLineBoxes.slice(1).map((line, index) =>
    line.top - desktop.whyStatementLineBoxes[index].bottom,
  );
  expect(whyStatementGaps).toHaveLength(2);
  expect(Math.abs(whyStatementGaps[0] - whyStatementGaps[1])).toBeLessThanOrEqual(1);
  for (const gap of whyStatementGaps) {
    expect(gap).toBeGreaterThanOrEqual(28);
    expect(gap).toBeLessThanOrEqual(58);
  }
  expect(desktop.whyListBox?.height).toBeGreaterThanOrEqual(120);
  expect(desktop.whyListBox?.height).toBeLessThanOrEqual(desktop.viewportHeight * 0.28);
  expect((desktop.whyListBox?.top ?? 0) - (desktop.whyPrinciplesBox?.top ?? 0))
    .toBeGreaterThan(desktop.viewportHeight * 0.2);
  expect((desktop.whyPrinciplesBox?.bottom ?? 0) - (desktop.whyListBox?.bottom ?? 0))
    .toBeGreaterThan(desktop.viewportHeight * 0.26);
  expect((desktop.whyPrinciplesBox?.bottom ?? 0) - (desktop.whyListBox?.bottom ?? 0))
    .toBeLessThan(desktop.viewportHeight * 0.46);
  expect(desktop.whyVisualBox?.left).toBeGreaterThanOrEqual(desktop.whyPrinciplesBox?.right ?? 0);
  expect(desktop.whyVisualBox?.right).toBe(desktop.whyBox?.right);
  expect(desktop.whyVisualAfterContent).toBe("none");
  expect(desktop.whyVisualOverlayCount).toBe(0);
  expect(desktop.whyTitleText).toMatch(/^simple is not basic\.?$/i);
  expect(desktop.whyTitleColor).toBe("rgb(17, 19, 18)");
  expect(desktop.whyTitleFamily).toMatch(/Marcellus/i);
  expect(desktop.whyTitleFamily).toBe(desktop.plugTitleFamily);
  expect(desktop.whyTitleColor).toBe(desktop.plugTitleColor);
  expect(Number.parseFloat(desktop.whyTitleFontSize)).toBeGreaterThanOrEqual(
    Number.parseFloat(desktop.plugTitleFontSize) * 0.68,
  );
  expect(Number.parseFloat(desktop.whyTitleFontSize)).toBeLessThanOrEqual(
    Number.parseFloat(desktop.plugTitleFontSize),
  );
  expect(
    Number.parseFloat(desktop.whyTitleLineHeight) /
      Number.parseFloat(desktop.whyTitleFontSize),
  ).toBeCloseTo(
    Number.parseFloat(desktop.plugTitleLineHeight) /
      Number.parseFloat(desktop.plugTitleFontSize),
    1,
  );
  expect(desktop.whyTitleAlign).toBe("left");
  expect(desktop.whyTitleTextTransform).toBe("none");
  expect(desktop.whyTitleWhiteSpace).toBe("normal");
  expect(desktop.whyTitleTextShadow).toBe("none");
  expect(desktop.whyTitleClass).toContain("home-plug-panel__title");
  expect(desktop.whyTitleParentClass).toContain("home-why-principles");
  expect(Math.abs((desktop.whyTitleBox?.left ?? 0) - desktop.standardContentLeft))
    .toBeLessThanOrEqual(1);
  expect(Math.abs((desktop.whyListBox?.left ?? 0) - desktop.standardContentLeft))
    .toBeLessThanOrEqual(1);
  expect(Number.parseFloat(desktop.whyPanelPaddingLeft)).toBeCloseTo(
    desktop.standardContentLeft,
    0,
  );
  expect((desktop.whyTitleBox?.top ?? 0) - (desktop.whyPrinciplesBox?.top ?? 0))
    .toBeLessThan(130);
  expect(desktop.whyTitleBox?.right).toBeLessThanOrEqual(desktop.whyPrinciplesBox?.right ?? 0);
  expect(desktop.whyTitleBox?.bottom ?? 0).toBeLessThan(desktop.whyListBox?.top ?? 0);
  expect(desktop.whyZoomMotion).toBe("motion");
  expect(["true", "false"]).toContain(desktop.whyZoomActive);
  const whyImageSrc = decodeURIComponent(desktop.whyImageSrc);
  expect(whyImageSrc).toContain("/media/home/why-three.webp");
  expect(whyImageSrc).not.toContain("/_next/image");
  expect(whyImageSrc).not.toContain("/mnt/data");
  expect(desktop.whyImageAlt).toBe("Black-and-white editorial portrait.");
  expect(desktop.whyImageFilter).toBe("none");
  expect(desktop.whyImageObjectFit).toBe("cover");
  expect(desktop.whyImageOpacity).toBe("1");
  expect(scaleFromTransform(desktop.whyImageTransform)).toBeGreaterThanOrEqual(1.009);
  expect(scaleFromTransform(desktop.whyImageTransform)).toBeLessThanOrEqual(1.161);
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
  expect(desktop.plugTitleDisplay).toBe("grid");
  expect(Number.parseFloat(desktop.plugTitleRowGap)).toBeGreaterThan(2);
  const plugTitleGaps = desktop.plugTitleLineBoxes.slice(1).map((line, index) =>
    line.top - desktop.plugTitleLineBoxes[index].bottom,
  );
  expect(plugTitleGaps).toHaveLength(2);
  for (const gap of plugTitleGaps) {
    expect(gap).toBeGreaterThan(2);
    expect(gap).toBeLessThan(14);
  }
  expect(Math.abs(plugTitleGaps[0] - plugTitleGaps[1])).toBeLessThanOrEqual(1.5);
  expect((desktop.plugTitleBox?.top ?? 0) - (desktop.plugPanelBox?.top ?? 0)).toBeLessThan(90);
  expect((desktop.plugPanelBox?.right ?? 0) - (desktop.plugTitleBox?.right ?? 0))
    .toBeLessThan(60);
  expect(desktop.plugBodyText).toBe(
    "The Core is designed to work as a full routine. Or simply upgrade the layer your current routine is missing or underperforming in.",
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

  const readWhyZoom = async () =>
    page.evaluate(() => {
      const image = document.querySelector<HTMLElement>(".home-why-visual__image");
      const zoom = document.querySelector<HTMLElement>(".home-why-visual__zoom");
      const imageStyle = image ? getComputedStyle(image) : null;
      return {
        motion: zoom?.getAttribute("data-scroll-zoom-motion") ?? "",
        scaleVariable: zoom
          ? getComputedStyle(zoom).getPropertyValue("--home-why-image-scale").trim()
          : "",
        transform: imageStyle?.transform ?? "",
      };
    });

  await page.evaluate(() => {
    document.querySelector(".home-section--why")?.scrollIntoView({ block: "center" });
  });
  await page.waitForTimeout(120);
  const initialZoom = await readWhyZoom();
  await page.mouse.wheel(0, 240);
  await page.waitForTimeout(450);
  const shortDownwardZoom = await readWhyZoom();
  await page.mouse.wheel(0, 720);
  await page.waitForTimeout(450);
  const longDownwardZoom = await readWhyZoom();
  await page.mouse.wheel(0, -720);
  await page.waitForTimeout(450);
  const upwardZoom = await readWhyZoom();
  const initialScale = scaleFromTransform(initialZoom.transform);
  const shortDownwardScale = scaleFromTransform(shortDownwardZoom.transform);
  const longDownwardScale = scaleFromTransform(longDownwardZoom.transform);
  const upwardScale = scaleFromTransform(upwardZoom.transform);

  expect(initialZoom.motion).toBe("motion");
  expect(initialScale).toBeGreaterThanOrEqual(1.065);
  expect(initialScale).toBeLessThanOrEqual(1.075);
  expect(shortDownwardScale).toBeLessThan(initialScale - 0.008);
  expect(longDownwardScale).toBeLessThan(initialScale - 0.025);
  expect(longDownwardScale).toBeGreaterThanOrEqual(1.009);
  expect(longDownwardScale).toBeLessThan(shortDownwardScale - 0.02);
  expect(upwardScale).toBeGreaterThanOrEqual(1.009);
  expect(upwardScale).toBeLessThanOrEqual(1.161);
  expect(upwardScale).toBeGreaterThan(longDownwardScale + 0.025);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await page.locator(".home-why-visual__zoom").waitFor({ state: "attached" });
  await page.evaluate(() => {
    document.querySelector(".home-section--why")?.scrollIntoView({ block: "center" });
  });
  await page.waitForTimeout(120);
  const reducedStart = await readWhyZoom();
  await page.mouse.wheel(0, 720);
  await page.waitForTimeout(300);
  const reducedAfter = await readWhyZoom();
  expect(reducedStart.motion).toBe("static");
  expect(reducedAfter.motion).toBe("static");
  expect(Math.abs(scaleFromTransform(reducedAfter.transform) - scaleFromTransform(reducedStart.transform)))
    .toBeLessThan(0.002);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.locator(".home-plug-media__frame").waitFor({ state: "attached" });
  const mobile = await page.evaluate(() => {
    const clean = (text: string | null | undefined) =>
      text?.replace(/\s+/g, " ").trim() ?? "";
    const core = document.querySelector<HTMLElement>("#core-three");
    const coreIntro = core?.querySelector<HTMLElement>(".home-section__intro--core");
    const coreEyebrow = coreIntro?.querySelector<HTMLElement>(".hero__eyebrow");
    const coreDescription = coreIntro?.querySelector<HTMLElement>("p:not(.hero__eyebrow)");
    const coreProducts = core?.querySelector<HTMLElement>(".home-core-products");
    const coreCards = Array.from(core?.querySelectorAll<HTMLElement>(".product-card") ?? []);
    const why = document.querySelector<HTMLElement>(".home-section--why");
    const whyPrinciples = why?.querySelector<HTMLElement>(".home-why-principles");
    const whyList = why?.querySelector<HTMLElement>(".home-why-list");
    const whyVisual = why?.querySelector<HTMLElement>(".home-why-visual");
    const whyTitle = why?.querySelector<HTMLElement>("#why-three-heading");
    const whyZoom = why?.querySelector<HTMLElement>(".home-why-visual__zoom");
    const whyImage = why?.querySelector<HTMLElement>(".home-why-visual__image");
    const plugSection = document.querySelector<HTMLElement>(".home-section--core-support");
    const plugMedia = plugSection?.querySelector<HTMLElement>(".home-plug-media");
    const plugPanel = plugSection?.querySelector<HTMLElement>(".home-plug-panel");
    const plugCaption = plugSection?.querySelector<HTMLElement>(".home-plug-media__caption");
    const plugTitle = plugSection?.querySelector<HTMLElement>("#plug-play-heading");
    const plugBody = plugSection?.querySelector<HTMLElement>(".home-plug-panel__body");
    const plugBodyParagraph = plugBody?.querySelector<HTMLElement>("p");
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
      coreCardBoxes: coreCards.map(box),
      coreEyebrowText: clean(coreEyebrow?.textContent),
      coreEyebrowAlign: coreEyebrow ? getComputedStyle(coreEyebrow).textAlign : "",
      coreEyebrowFontWeight: coreEyebrow ? getComputedStyle(coreEyebrow).fontWeight : "",
      coreDescriptionText: clean(coreDescription?.textContent),
      coreProductGridColumns: coreProducts ? getComputedStyle(coreProducts).gridTemplateColumns : "",
      coreProgressCount: core?.querySelectorAll(".home-core-progress").length ?? 0,
      coreProgressShellCount: core?.querySelectorAll(".home-core-progress-shell").length ?? 0,
      coreRailCount: core?.querySelectorAll(".home-core-progress__rail").length ?? 0,
      coreNodeCount: core?.querySelectorAll(".home-core-progress__node-item").length ?? 0,
      coreMiniDescriptionCount:
        core?.querySelectorAll(".home-core-progress__mini-description").length ?? 0,
      coreActiveDataCount: core?.querySelectorAll("[data-core-active]").length ?? 0,
      coreStepDataCount: core?.querySelectorAll("[data-core-step]").length ?? 0,
      whyBox: box(why),
      whyBackground: why ? getComputedStyle(why).backgroundColor : "",
      whyBorderTopWidth: why ? getComputedStyle(why).borderTopWidth : "",
      whyBorderBottomWidth: why ? getComputedStyle(why).borderBottomWidth : "",
      whyPrinciplesBackground: whyPrinciples ? getComputedStyle(whyPrinciples).backgroundColor : "",
      whyPrinciplesBox: box(whyPrinciples),
      whyListBox: box(whyList),
      whyVisualBox: box(whyVisual),
      whyTitleBox: box(whyTitle),
      whyTitleText: whyTitle?.textContent?.replace(/\s+/g, " ").trim() ?? "",
      whyTitleAlign: whyTitle ? getComputedStyle(whyTitle).textAlign : "",
      whyStatementLineBoxes: Array.from(why?.querySelectorAll(".home-why-list li") ?? []).map((node) => {
        const rect = node.getBoundingClientRect();
        return {
          bottom: Math.round(rect.bottom),
          top: Math.round(rect.top),
        };
      }),
      whyStatementStyle: why?.querySelector(".home-why-list li")
        ? {
            color: getComputedStyle(why.querySelector(".home-why-list li") as HTMLElement)
              .color,
            fontFamily: getComputedStyle(why.querySelector(".home-why-list li") as HTMLElement)
              .fontFamily,
            fontSize: getComputedStyle(why.querySelector(".home-why-list li") as HTMLElement)
              .fontSize,
            fontWeight: getComputedStyle(why.querySelector(".home-why-list li") as HTMLElement)
              .fontWeight,
            letterSpacing: getComputedStyle(why.querySelector(".home-why-list li") as HTMLElement)
              .letterSpacing,
            lineHeight: getComputedStyle(why.querySelector(".home-why-list li") as HTMLElement)
              .lineHeight,
          }
        : null,
      whyVisualOverlayCount: whyVisual?.querySelectorAll(".home-why-visual__title").length ?? 0,
      whyZoomMotion: whyZoom?.getAttribute("data-scroll-zoom-motion") ?? "",
      whyImageTransform: whyImage ? getComputedStyle(whyImage).transform : "",
      pageGutter: getComputedStyle(document.documentElement).getPropertyValue("--page-gutter").trim(),
      plugSectionBox: box(plugSection),
      plugMediaBox: box(plugMedia),
      plugPanelBox: box(plugPanel),
      plugPanelAlign: plugPanel ? getComputedStyle(plugPanel).textAlign : "",
      plugPanelBackground: plugPanel ? getComputedStyle(plugPanel).backgroundColor : "",
      plugCaptionWhiteSpace: plugCaption ? getComputedStyle(plugCaption).whiteSpace : "",
      plugTitleAlign: plugTitle ? getComputedStyle(plugTitle).textAlign : "",
      plugBodyAlign: plugBody ? getComputedStyle(plugBody).textAlign : "",
      plugBodyParagraphStyle: plugBodyParagraph
        ? {
            color: getComputedStyle(plugBodyParagraph).color,
            fontFamily: getComputedStyle(plugBodyParagraph).fontFamily,
            fontSize: getComputedStyle(plugBodyParagraph).fontSize,
            fontWeight: getComputedStyle(plugBodyParagraph).fontWeight,
            letterSpacing: getComputedStyle(plugBodyParagraph).letterSpacing,
            lineHeight: getComputedStyle(plugBodyParagraph).lineHeight,
          }
        : null,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });

  expect(mobile.coreEyebrowText).toBe("The Core");
  expect(["left", "start"]).toContain(mobile.coreEyebrowAlign);
  expect(mobile.coreEyebrowFontWeight).toBe("900");
  expect(mobile.coreDescriptionText).toBe("Simple by design. For all skin types.");
  expect(mobile.coreProgressCount).toBe(0);
  expect(mobile.coreProgressShellCount).toBe(0);
  expect(mobile.coreRailCount).toBe(0);
  expect(mobile.coreNodeCount).toBe(0);
  expect(mobile.coreMiniDescriptionCount).toBe(0);
  expect(mobile.coreActiveDataCount).toBe(0);
  expect(mobile.coreStepDataCount).toBe(0);
  expect(mobile.coreProductGridColumns.split(" ")).toHaveLength(1);
  expect(mobile.coreCardBoxes).toHaveLength(3);
  expect(mobile.coreCardBoxes[1]?.top).toBeGreaterThan(mobile.coreCardBoxes[0]?.bottom ?? 0);
  expect(mobile.coreCardBoxes[2]?.top).toBeGreaterThan(mobile.coreCardBoxes[1]?.bottom ?? 0);
  expect(mobile.whyBackground).toBe(mobile.bodyBackground);
  expect(mobile.whyBorderTopWidth).toBe("0px");
  expect(mobile.whyBorderBottomWidth).toBe("0px");
  expect(mobile.whyPrinciplesBackground).toBe(mobile.bodyBackground);
  expect(mobile.whyBox?.height).toBeGreaterThanOrEqual(mobile.viewportHeight);
  expect(mobile.whyBox?.height).toBeLessThanOrEqual(mobile.viewportHeight * 1.3);
  expect(mobile.whyListBox?.height).toBeGreaterThanOrEqual(150);
  expect(mobile.whyListBox?.height).toBeLessThanOrEqual(230);
  expect(mobile.whyTitleText).toMatch(/^simple is not basic\.?$/i);
  expect(mobile.whyTitleAlign).toBe("left");
  expect(mobile.whyStatementStyle).toEqual(mobile.plugBodyParagraphStyle);
  const mobileWhyStatementGaps = mobile.whyStatementLineBoxes.slice(1).map((line, index) =>
    line.top - mobile.whyStatementLineBoxes[index].bottom,
  );
  expect(mobileWhyStatementGaps).toHaveLength(2);
  expect(Math.abs(mobileWhyStatementGaps[0] - mobileWhyStatementGaps[1])).toBeLessThanOrEqual(1);
  expect(mobile.whyVisualOverlayCount).toBe(0);
  expect(Number.parseFloat(mobile.pageGutter)).toBe(18);
  expect(Math.abs((mobile.whyTitleBox?.left ?? 0) - Number.parseFloat(mobile.pageGutter)))
    .toBeLessThanOrEqual(1);
  expect(Math.abs((mobile.whyListBox?.left ?? 0) - Number.parseFloat(mobile.pageGutter)))
    .toBeLessThanOrEqual(1);
  expect(mobile.whyTitleBox?.top ?? 0).toBeGreaterThanOrEqual(mobile.whyPrinciplesBox?.top ?? 0);
  expect(mobile.whyTitleBox?.bottom ?? 0).toBeLessThan(mobile.whyListBox?.top ?? 0);
  expect(mobile.whyVisualBox?.top).toBeGreaterThanOrEqual(mobile.whyPrinciplesBox?.bottom ?? 0);
  expect(mobile.whyZoomMotion).toBe("static");
  expect(scaleFromTransform(mobile.whyImageTransform)).toBeGreaterThanOrEqual(1.069);
  expect(scaleFromTransform(mobile.whyImageTransform)).toBeLessThanOrEqual(1.071);
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
    const sectionByHeading = (headings: string[]) =>
      Array.from(document.querySelectorAll("section")).find(
        (section) => headings.includes(clean(section.querySelector("h2")?.textContent)),
      );
    const core = document.querySelector("#core-three");
    const beyond = sectionByHeading([
      "Beyond The Core",
      "Add only what solves a real problem.",
      "Add only what you need.",
      "Add what you need.",
      "For when the core is stable.",
    ]);
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
