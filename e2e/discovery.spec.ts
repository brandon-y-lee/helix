import { test, expect, type Locator } from "@playwright/test";
import {
  homeBeyondCoreDescriptions,
  homeCoreDescriptions,
  homeThreePrinciples,
} from "../lib/content/home";

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

const principleLabels = homeThreePrinciples.map((principle) => principle.label);
const principleTitleTexts = homeThreePrinciples.map((principle) =>
  principle.titleLines.join(" "),
);
const principleDescriptions = homeThreePrinciples.map((principle) => principle.description);
const coreDescriptionItems = homeCoreDescriptions.items;
const beyondDescriptionItems = homeBeyondCoreDescriptions.items;

async function expectVisiblePhasedDescription(locator: Locator, expectedText: string) {
  await expect(locator).toHaveText(expectedText);
  await expect(locator).toHaveCSS("opacity", "1");
  await expect(locator).not.toHaveAttribute("data-phase", "hidden");
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
  for (const label of principleLabels) {
    await expect(page.getByRole("button", { name: label })).toBeVisible();
  }
  await expect(
    page.getByText(principleDescriptions[0]),
  ).toBeVisible();
  await expect(
    page.getByText(
      "01 Start with structure that skin understands: cleanse first, treat second, seal last.",
    ),
  ).toHaveCount(0);
  await expect(page.locator("#home-three-principles-heading")).toHaveText(principleTitleTexts[0]);
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
    page.getByText(homeBeyondCoreDescriptions.default),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: /^(Know what each step is doing\.|Know what you are using\.)$/,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "It’s time to invest in your skin",
    }),
  ).toBeVisible();
});

test("homepage section eyebrows share the Core section treatment", async ({ page }) => {
  await page.goto("/");

  const styles = await page.evaluate(() => {
    const labels = [
      "The Core",
      "Beyond The Core",
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
  const beyond = styles["Beyond The Core"];
  expect(beyond).not.toBeNull();
  expect(beyond).toEqual(core);
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

test("homepage Core and Beyond cards phase section descriptions", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  const core = page.getByRole("region", { name: "The Core", exact: true });
  const coreDescription = core.locator(".home-phased-description");
  await expect(coreDescription).toHaveCount(1);
  await expectVisiblePhasedDescription(coreDescription, homeCoreDescriptions.default);
  const coreDefaultBox = await coreDescription.boundingBox();

  await core.getByRole("link", { name: "CLEANSE" }).hover();
  await expectVisiblePhasedDescription(coreDescription, coreDescriptionItems.cleanse);
  const coreHoverBox = await coreDescription.boundingBox();
  expect(Math.abs((coreHoverBox?.height ?? 0) - (coreDefaultBox?.height ?? 0)))
    .toBeLessThanOrEqual(4);

  await page.mouse.move(4, 4);
  await expectVisiblePhasedDescription(coreDescription, homeCoreDescriptions.default);

  await core.getByRole("link", { name: "TREAT" }).focus();
  await expectVisiblePhasedDescription(coreDescription, coreDescriptionItems.treat);
  await page.getByRole("link", { name: "Explore The Core" }).focus();
  await expectVisiblePhasedDescription(coreDescription, homeCoreDescriptions.default);

  await core.getByRole("button", { name: "Open quick buy for SEAL" }).focus();
  await expectVisiblePhasedDescription(coreDescription, coreDescriptionItems.seal);
  await page.getByRole("link", { name: "Explore The Core" }).focus();
  await expectVisiblePhasedDescription(coreDescription, homeCoreDescriptions.default);

  const beyond = page.getByRole("region", { name: "Beyond The Core", exact: true });
  const beyondDescription = beyond.locator(".home-phased-description");
  await expect(beyondDescription).toHaveCount(1);
  await expectVisiblePhasedDescription(beyondDescription, homeBeyondCoreDescriptions.default);
  const coreEyebrowWeight = await core.locator(".hero__eyebrow").evaluate((element) =>
    getComputedStyle(element).fontWeight,
  );
  const beyondEyebrowWeight = await beyond.locator(".hero__eyebrow").evaluate((element) =>
    getComputedStyle(element).fontWeight,
  );
  expect(beyondEyebrowWeight).toBe(coreEyebrowWeight);

  await beyond.getByRole("link", { name: "REFINE", exact: true }).hover();
  await expectVisiblePhasedDescription(beyondDescription, beyondDescriptionItems.refine);
  await page.mouse.move(4, 4);
  await expectVisiblePhasedDescription(beyondDescription, homeBeyondCoreDescriptions.default);

  await beyond.getByRole("link", { name: "FRAME", exact: true }).focus();
  await expectVisiblePhasedDescription(beyondDescription, beyondDescriptionItems.frame);
  await page.getByRole("link", { name: "Explore The Core" }).focus();
  await expectVisiblePhasedDescription(beyondDescription, homeBeyondCoreDescriptions.default);

  await expect(
    beyond.getByRole("link", { name: "View PROTECT System step, coming soon" }),
  ).toHaveCount(0);
  await expect(beyond.locator(".home-addon-card--protect")).toHaveCount(0);

  await beyond.getByRole("button", { name: "Open quick buy for LIFT" }).focus();
  await expectVisiblePhasedDescription(beyondDescription, beyondDescriptionItems.lift);
  await page.getByRole("link", { name: "Explore The Core" }).focus();
  await expectVisiblePhasedDescription(beyondDescription, homeBeyondCoreDescriptions.default);

  expect(await core.locator(".home-core-progress, .home-core-progress-shell").count()).toBe(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expectVisiblePhasedDescription(
    page.locator("#core-three .home-phased-description"),
    homeCoreDescriptions.default,
  );
  await expectVisiblePhasedDescription(
    page.locator(".home-section--beyond .home-phased-description"),
    homeBeyondCoreDescriptions.default,
  );
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
});

test("homepage Core images and Beyond carousel use finite responsive navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  const core = page.getByRole("region", { name: "The Core", exact: true });
  const coreImageState = await core.evaluate((section) => {
    const images = Array.from(
      section.querySelectorAll<HTMLElement>("[data-product-card-default-image='true']"),
    ).map((node) => decodeURIComponent(node.querySelector("img")?.getAttribute("src") ?? ""));
    const frames = Array.from(
      section.querySelectorAll<HTMLElement>("[data-product-card-default-image='true']"),
    ).map((node) => ({
      presentation: node.getAttribute("data-product-card-image-presentation"),
      objectFit: getComputedStyle(node.querySelector("img") as HTMLElement).objectFit,
    }));
    const hoverLayers = Array.from(
      section.querySelectorAll<HTMLElement>(".product-card__image--hover"),
    ).map((node) => node.getAttribute("data-media-kind"));
    return { frames, images, hoverLayers };
  });
  expect(coreImageState.images).toHaveLength(3);
  expect(coreImageState.images[0]).toContain("/media/home/cleanse-core-card.webp");
  expect(coreImageState.images[1]).toContain("/media/home/treat-core-card.webp");
  expect(coreImageState.images[2]).toContain("/media/home/seal-core-card.webp");
  expect(coreImageState.images.join(" ")).not.toMatch(
    /cleanse-home-card|treat-home-card|seal-home-card/,
  );
  expect(coreImageState.frames).toEqual([
    { presentation: "full-frame", objectFit: "cover" },
    { presentation: "full-frame", objectFit: "cover" },
    { presentation: "full-frame", objectFit: "cover" },
  ]);
  expect(coreImageState.hoverLayers).toEqual(["placeholder", "placeholder", "placeholder"]);

  const readFirstCoreVisualState = () =>
    core.evaluate((section) => {
      const firstCard = section.querySelector<HTMLElement>(".product-card");
      const defaultLayer = firstCard?.querySelector<HTMLElement>(".product-card__image--asset");
      const hoverLayer = firstCard?.querySelector<HTMLElement>(".product-card__image--hover");
      return {
        state: firstCard?.getAttribute("data-visual-state"),
        defaultOpacity: defaultLayer ? getComputedStyle(defaultLayer).opacity : "",
        hoverOpacity: hoverLayer ? getComputedStyle(hoverLayer).opacity : "",
      };
    });

  await core.getByRole("link", { name: "CLEANSE", exact: true }).hover();
  await expect
    .poll(async () => Number.parseFloat((await readFirstCoreVisualState()).hoverOpacity))
    .toBeGreaterThan(0.9);
  const coreHoverState = await readFirstCoreVisualState();
  expect(coreHoverState.state).toBe("preview");
  expect(Number.parseFloat(coreHoverState.defaultOpacity)).toBeLessThan(0.2);

  await page.mouse.move(4, 4);
  await expect
    .poll(async () => Number.parseFloat((await readFirstCoreVisualState()).defaultOpacity))
    .toBeGreaterThan(0.9);
  const coreExitState = await readFirstCoreVisualState();
  expect(coreExitState.state).toBe("default");

  const beyond = page.getByRole("region", { name: "Beyond The Core", exact: true });
  const carousel = beyond.locator(".home-beyond-carousel");
  const track = beyond.locator(".home-beyond-carousel__track");
  await expect(carousel).toHaveAttribute("data-carousel-ready", "true");
  await expect(carousel).toHaveAttribute("data-active-index", "0");
  await expect(carousel).toHaveAttribute("data-can-scroll-prev", "false");
  await expect(carousel).toHaveAttribute("data-can-scroll-next", "false");
  await expect(beyond.getByRole("button", { name: "Previous product" })).toHaveCount(0);
  await expect(beyond.getByRole("button", { name: "Next product" })).toHaveCount(0);

  const desktopProductOrder = await track.evaluate((node) =>
    Array.from(node.querySelectorAll<HTMLElement>(".product-card__name")).map(
      (name) => name.textContent?.trim() ?? "",
    ),
  );
  expect(desktopProductOrder).toEqual(["REFINE", "FRAME", "LIFT"]);
  const geometry = await beyond.evaluate((section) => {
    const viewport = section.querySelector<HTMLElement>(".home-beyond-carousel__viewport");
    const cards = Array.from(
      section.querySelectorAll<HTMLElement>(".home-beyond-carousel__card"),
    );
    const viewportRect = viewport?.getBoundingClientRect();
    const rects = cards.map((card) => {
      const rect = card.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        width: rect.width,
      };
    });
    return {
      viewportLeft: viewportRect?.left ?? 0,
      viewportRight: viewportRect?.right ?? 0,
      cardCount: cards.length,
      visibleCount: rects.filter(
        (rect) =>
          rect.left >= (viewportRect?.left ?? 0) - 1 &&
          rect.right <= (viewportRect?.right ?? 0) + 1,
      ).length,
      rects,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  expect(geometry.cardCount).toBe(3);
  expect(geometry.visibleCount).toBe(3);
  expect(geometry.overflow).toBeLessThanOrEqual(0);
  for (const rect of geometry.rects) {
    expect(rect.width).toBeGreaterThan(360);
    expect(rect.left).toBeGreaterThanOrEqual(geometry.viewportLeft - 1);
    expect(rect.right).toBeLessThanOrEqual(geometry.viewportRight + 1);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const mobileBeyond = page.getByRole("region", { name: "Beyond The Core", exact: true });
  const mobileCarousel = mobileBeyond.locator(".home-beyond-carousel");
  const mobileTrack = mobileBeyond.locator(".home-beyond-carousel__track");
  await expect(mobileCarousel).toHaveAttribute("data-carousel-ready", "true");
  await expect(mobileCarousel).toHaveAttribute("data-active-index", "0");
  await expect(mobileCarousel).toHaveAttribute("data-can-scroll-prev", "false");
  await expect(mobileCarousel).toHaveAttribute("data-can-scroll-next", "true");
  await expect(mobileBeyond.getByRole("button", { name: "Previous product" })).toHaveCount(0);
  const mobileNext = mobileBeyond.getByRole("button", { name: "Next product" });
  await expect(mobileNext).toBeVisible();
  await expect(mobileNext).toHaveAttribute(
    "aria-controls",
    (await mobileTrack.getAttribute("id")) ?? "",
  );

  const readFiniteState = () =>
    mobileBeyond.evaluate((section) => {
      const carouselNode = section.querySelector<HTMLElement>(".home-beyond-carousel");
      const trackNode = section.querySelector<HTMLElement>(".home-beyond-carousel__track");
      const controls = Array.from(
        section.querySelectorAll<HTMLElement>(".home-beyond-carousel__control"),
      ).map((button) => {
        const rect = button.getBoundingClientRect();
        const style = getComputedStyle(button);
        return {
          label: button.getAttribute("aria-label"),
          visible:
            rect.width > 0 &&
            rect.height > 0 &&
            style.display !== "none" &&
            style.visibility !== "hidden",
          left: rect.left,
          right: rect.right,
          width: rect.width,
          pointerEvents: style.pointerEvents,
        };
      });
      return {
        activeIndex: carouselNode?.getAttribute("data-active-index"),
        canScrollPrev: carouselNode?.getAttribute("data-can-scroll-prev"),
        canScrollNext: carouselNode?.getAttribute("data-can-scroll-next"),
        transform: getComputedStyle(trackNode ?? document.documentElement).transform,
        controls,
        activeElementLabel:
          document.activeElement instanceof HTMLElement
            ? document.activeElement.getAttribute("aria-label")
            : null,
        overflow:
          document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });

  const initialMobileState = await readFiniteState();
  expect(initialMobileState.controls.map((control) => control.label)).toEqual([
    "Next product",
  ]);
  expect(initialMobileState.controls[0].right).toBeLessThanOrEqual(390 - 12);
  expect(initialMobileState.overflow).toBe(0);

  const readControlStyle = () => mobileNext.evaluate((button) => {
    const style = getComputedStyle(button);
    return {
      backgroundColor: style.backgroundColor,
      borderColor: style.borderColor,
      color: style.color,
    };
  });
  const defaultControlStyle = await readControlStyle();
  await mobileNext.hover();
  await expect
    .poll(async () => (await readControlStyle()).backgroundColor)
    .not.toBe(defaultControlStyle.backgroundColor);
  await expect
    .poll(async () => (await readControlStyle()).borderColor)
    .not.toBe(defaultControlStyle.borderColor);
  await expect
    .poll(async () => (await readControlStyle()).color)
    .not.toBe(defaultControlStyle.color);

  await mobileNext.click();
  await expect(mobileCarousel).toHaveAttribute("data-active-index", "1");
  await expect(mobileCarousel).toHaveAttribute("data-can-scroll-prev", "true");
  await expect(mobileCarousel).toHaveAttribute("data-can-scroll-next", "true");
  await expect(mobileBeyond.getByRole("button", { name: "Previous product" })).toBeVisible();
  await expect(mobileBeyond.getByRole("button", { name: "Next product" })).toBeVisible();
  await expect
    .poll(async () => (await readFiniteState()).transform)
    .not.toBe(initialMobileState.transform);

  await page.waitForTimeout(280);
  const nextBeforeFinal = mobileBeyond.getByRole("button", { name: "Next product" });
  await nextBeforeFinal.focus();
  await page.keyboard.press("Enter");
  await expect(mobileCarousel).toHaveAttribute("data-active-index", "2");
  await expect(mobileCarousel).toHaveAttribute("data-can-scroll-prev", "true");
  await expect(mobileCarousel).toHaveAttribute("data-can-scroll-next", "false");
  await expect(mobileBeyond.getByRole("button", { name: "Next product" })).toHaveCount(0);
  const previousAtEnd = mobileBeyond.getByRole("button", { name: "Previous product" });
  await expect(previousAtEnd).toBeVisible();
  await expect
    .poll(async () => (await readFiniteState()).activeElementLabel)
    .toBe("Previous product");
  await expect(mobileBeyond.getByText("LIFT leads Beyond The Core.")).toHaveCount(1);

  const beforeDragUrl = page.url();
  const viewportBox = await mobileBeyond.locator(".home-beyond-carousel__viewport").boundingBox();
  expect(viewportBox).not.toBeNull();
  if (viewportBox) {
    await page.mouse.move(
      viewportBox.x + viewportBox.width * 0.24,
      viewportBox.y + Math.min(220, viewportBox.height * 0.36),
    );
    await expect(mobileBeyond.locator(".home-beyond-swipe-indicator")).toHaveCSS("opacity", "1");

    const startX = viewportBox.x + viewportBox.width * 0.42;
    const y = viewportBox.y + Math.min(260, viewportBox.height * 0.42);
    await page.mouse.move(startX, y);
    await page.mouse.down();
    await page.mouse.move(startX - 120, y, { steps: 6 });
    await page.mouse.up();
  }
  expect(page.url()).toBe(beforeDragUrl);
  await expect(mobileCarousel).toHaveAttribute("data-active-index", "2");
  await expect(mobileBeyond.getByRole("button", { name: "Next product" })).toHaveCount(0);

  await page.waitForTimeout(280);
  await previousAtEnd.click();
  await expect(mobileCarousel).toHaveAttribute("data-active-index", "1");
  await page.waitForTimeout(280);
  const previousAtMiddle = mobileBeyond.getByRole("button", { name: "Previous product" });
  await previousAtMiddle.focus();
  await page.keyboard.press("Enter");
  await expect(mobileCarousel).toHaveAttribute("data-active-index", "0");
  await expect(mobileCarousel).toHaveAttribute("data-can-scroll-prev", "false");
  await expect(mobileCarousel).toHaveAttribute("data-can-scroll-next", "true");
  await expect(mobileBeyond.getByRole("button", { name: "Previous product" })).toHaveCount(0);
  await expect
    .poll(async () => (await readFiniteState()).activeElementLabel)
    .toBe("Next product");

  const startBox = await mobileBeyond.locator(".home-beyond-carousel__viewport").boundingBox();
  expect(startBox).not.toBeNull();
  if (startBox) {
    const startX = startBox.x + startBox.width * 0.42;
    const y = startBox.y + Math.min(260, startBox.height * 0.42);
    await page.mouse.move(startX, y);
    await page.mouse.down();
    await page.mouse.move(startX + 120, y, { steps: 6 });
    await page.mouse.up();
  }
  await expect(mobileCarousel).toHaveAttribute("data-active-index", "0");

  const nextBeforeResize = mobileBeyond.getByRole("button", { name: "Next product" });
  await nextBeforeResize.focus();
  await expect
    .poll(async () => (await readFiniteState()).activeElementLabel)
    .toBe("Next product");

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(mobileCarousel).toHaveAttribute("data-can-scroll-prev", "false");
  await expect(mobileCarousel).toHaveAttribute("data-can-scroll-next", "false");
  await expect(mobileBeyond.locator(".home-beyond-carousel__control")).toHaveCount(0);
  await expect
    .poll(async () => (await readFiniteState()).activeElementLabel)
    .toBe("Beyond The Core products");

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(mobileCarousel).toHaveAttribute("data-can-scroll-prev", "false");
  await expect(mobileCarousel).toHaveAttribute("data-can-scroll-next", "true");
  await expect(mobileBeyond.getByRole("button", { name: "Next product" })).toBeVisible();
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

  await expect(finalSection.getByRole("heading", { name: "It’s time to invest in your skin" }))
    .toBeVisible();
  await expect(media).toHaveAttribute("data-motion-state", "static");
  const poster = finalSection.locator(".home-final-media__poster");
  await expect(poster).toBeVisible();
  await expect(poster).toHaveCSS("opacity", "1");
  await expect(poster).toHaveCSS("filter", "none");
  await expect(media).toHaveCSS("opacity", "1");
  await expect(media).toHaveCSS("filter", "none");
  const overlay = await media.evaluate((element) => {
    const style = getComputedStyle(element, "::after");
    return {
      backgroundImage: style.backgroundImage,
      filter: style.filter,
      opacity: style.opacity,
    };
  });
  expect(overlay.filter).toBe("none");
  expect(overlay.opacity).toBe("1");
  expect(overlay.backgroundImage).toContain("rgba(10, 12, 11");
  expect(overlay.backgroundImage).not.toContain("0.92");
  expect(overlay.backgroundImage).not.toContain("0.78");
  await expect(finalSection.locator("video")).toHaveCount(0);
});

test("homepage core narrative uses taller why and asymmetric plug video sections", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await page.locator(".home-plug-media__frame").waitFor({ state: "attached" });
  await page.locator(".home-three-principles-visual__zoom").waitFor({ state: "attached" });
  await expect(page.locator(".home-three-principles-visual__zoom")).toHaveAttribute(
    "data-scroll-zoom-motion",
    "motion",
  );

  const desktop = await page.evaluate(() => {
    const clean = (text: string | null | undefined) =>
      text?.replace(/\s+/g, " ").trim() ?? "";
    const sections = Array.from(document.querySelectorAll<HTMLElement>("main > section"));
    const headings = Array.from(document.querySelectorAll<HTMLElement>("h2"));
    const heroTitle = document.querySelector<HTMLElement>(".home-video-hero__title");
    const heroDisplayLine = document.querySelector<HTMLElement>(".home-video-hero__display-line");
    const heroPrimaryCta = document.querySelector<HTMLAnchorElement>(".home-video-hero__cta");
    const core = document.querySelector<HTMLElement>("#core-three");
    const why = document.querySelector<HTMLElement>(".home-section--principles");
    const plugSection = document.querySelector<HTMLElement>(".home-section--core-support");
    const coreIntro = core?.querySelector<HTMLElement>(".home-section__intro--core");
    const coreEyebrow = coreIntro?.querySelector<HTMLElement>(".hero__eyebrow");
    const coreDescription = coreIntro?.querySelector<HTMLElement>("p:not(.hero__eyebrow)");
    const coreProducts = core?.querySelector<HTMLElement>(".home-core-products");
    const whyPrinciples = why?.querySelector<HTMLElement>(".home-three-principles-panel");
    const whyList = why?.querySelector<HTMLElement>(".home-three-principles");
    const whyVisual = why?.querySelector<HTMLElement>(".home-three-principles-visual");
    const whyTitle = why?.querySelector<HTMLElement>("#home-three-principles-heading");
    const whyZoom = why?.querySelector<HTMLElement>(".home-three-principles-visual__zoom");
    const whyImage = why?.querySelector<HTMLImageElement>(".home-three-principles-visual img");
    const principleDescription = why?.querySelector<HTMLElement>(
      ".home-three-principles__description",
    );
    const principleLabels = why?.querySelector<HTMLElement>(".home-three-principles__labels");
    const principleButtons = Array.from(
      why?.querySelectorAll<HTMLButtonElement>(".home-three-principles__label") ?? [],
    );
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
    const finalPrimaryCta = final?.querySelector<HTMLAnchorElement>(".home-final__cta--primary");
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
    const heroTextStyle = (element: HTMLElement | null | undefined) => {
      if (!element) return null;
      const style = getComputedStyle(element);
      return {
        ...textStyle(element),
        textAlign: style.textAlign,
        textShadow: style.textShadow,
      };
    };
    const buttonStyle = (element: HTMLElement | null | undefined) => {
      if (!element) return null;
      const style = getComputedStyle(element);
      return {
        backgroundColor: style.backgroundColor,
        borderColor: style.borderColor,
        borderRadius: style.borderRadius,
        color: style.color,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        letterSpacing: style.letterSpacing,
        lineHeight: style.lineHeight,
        minHeight: style.minHeight,
        padding: style.padding,
        textTransform: style.textTransform,
      };
    };
    const mediaStyle = (element: HTMLElement | null | undefined, pseudo?: string) => {
      if (!element) return null;
      const style = getComputedStyle(element, pseudo);
      return {
        backgroundImage: style.backgroundImage,
        filter: style.filter,
        mixBlendMode: style.mixBlendMode,
        opacity: style.opacity,
      };
    };

    return {
      heroTitleStyle: heroTextStyle(heroTitle),
      heroDisplayLineStyle: heroTextStyle(heroDisplayLine),
      heroPrimaryCtaStyle: buttonStyle(heroPrimaryCta),
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
      finalDescriptionStyle: heroTextStyle(finalDescription),
      finalDescriptionText: clean(finalDescription?.textContent),
      finalDescriptionActionsGap: finalDescription && finalActions
        ? Math.round(finalActions.getBoundingClientRect().top - finalDescription.getBoundingClientRect().bottom)
        : null,
      finalEyebrowCount: finalSection?.querySelectorAll(".hero__eyebrow").length ?? 0,
      finalMediaBox: box(finalMedia),
      finalMediaStyle: mediaStyle(finalMedia),
      finalMediaAfterStyle: mediaStyle(finalMedia, "::after"),
      finalMotionState: finalMedia?.getAttribute("data-motion-state") ?? "",
      finalPosterSrc: finalPoster?.currentSrc || finalPoster?.src || "",
      finalPosterStyle: mediaStyle(finalPoster),
      finalCtaCount: final?.querySelectorAll("a").length ?? 0,
      finalPrimaryCtaHref: finalPrimaryCta?.getAttribute("href") ?? "",
      finalPrimaryCtaText: clean(finalPrimaryCta?.textContent),
      finalPrimaryCtaStyle: buttonStyle(finalPrimaryCta),
      finalSectionBox: box(finalSection),
      finalTitleStyle: heroTextStyle(finalTitle),
      finalVideoReadyStyle: (() => {
        if (!finalMedia || !finalVideo) return null;
        const previousReady = finalMedia.getAttribute("data-video-ready");
        const previousTransition = finalVideo.style.transition;
        finalVideo.style.transition = "none";
        finalMedia.setAttribute("data-video-ready", "true");
        const readyStyle = mediaStyle(finalVideo);
        finalMedia.setAttribute("data-video-ready", previousReady ?? "false");
        finalVideo.style.transition = previousTransition;
        return readyStyle;
      })(),
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
      whyVisualOverlayCount: whyVisual?.querySelectorAll(".home-three-principles-visual__title").length ?? 0,
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
      oldWhyListCount: why?.querySelectorAll(".home-why-list").length ?? 0,
      oldWhyStatementCount: Array.from(why?.querySelectorAll<HTMLElement>("li, p") ?? [])
        .filter((node) =>
          [
            "01 Start with structure that skin understands: cleanse first, treat second, seal last.",
            "02 Use high-performing, innovative ingredients at efficacious levels in your essential layers.",
            "03 Most routines fail because they ask for too much too soon. Three steps build consistency.",
          ].includes(clean(node.textContent)),
        ).length,
      principleDescriptionBox: box(principleDescription),
      principleDescriptionText: clean(principleDescription?.textContent),
      principleDescriptionStyle: textStyle(principleDescription),
      principleGroupRole: principleLabels?.getAttribute("role") ?? "",
      principleGroupLabel: principleLabels?.getAttribute("aria-label") ?? "",
      principleAnchorCount: why?.querySelectorAll(".home-three-principles a").length ?? 0,
      principleLabels: principleButtons.map((button) => clean(button.textContent)),
      principlePressedStates: principleButtons.map((button) => button.getAttribute("aria-pressed")),
      principleButtonTypes: principleButtons.map((button) => button.getAttribute("type")),
      principleButtonHrefs: principleButtons.map((button) => button.getAttribute("href")),
      principleButtonCursors: principleButtons.map((button) => getComputedStyle(button).cursor),
      principleButtonLineBoxes: principleButtons.map((node) => {
        const rect = node.getBoundingClientRect();
        return {
          bottom: Math.round(rect.bottom),
          height: Math.round(rect.height),
          top: Math.round(rect.top),
        };
      }),
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
  expect(desktop.coreDescriptionText).toBe(homeCoreDescriptions.default);
  expect(Number.parseFloat(desktop.coreDescriptionStyle?.fontSize ?? "0"))
    .toBeGreaterThan(Number.parseFloat(desktop.plugBodyParagraphStyle?.fontSize ?? "0"));
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
  expect(Number.parseFloat(desktop.beyondDescriptionStyle?.fontSize ?? "0"))
    .toBeGreaterThan(Number.parseFloat(desktop.plugBodyParagraphStyle?.fontSize ?? "0"));
  expect(desktop.ingredientsDescriptionStyle).toEqual(desktop.plugBodyParagraphStyle);
  expect(desktop.ingredientsTitleStyle).toEqual(desktop.plugTitleStyle);
  expect(desktop.finalTitleStyle?.color).toBe(desktop.heroTitleStyle?.color);
  expect(desktop.finalTitleStyle?.fontFamily).toBe(desktop.heroTitleStyle?.fontFamily);
  expect(desktop.finalTitleStyle?.fontWeight).toBe(desktop.heroTitleStyle?.fontWeight);
  expect(desktop.finalTitleStyle?.textShadow).toBe(desktop.heroTitleStyle?.textShadow);
  expect(desktop.finalDescriptionStyle?.color).toBe(desktop.heroDisplayLineStyle?.color);
  expect(Number.parseInt(desktop.finalDescriptionStyle?.fontWeight ?? "0", 10))
    .toBeLessThan(Number.parseInt(desktop.heroDisplayLineStyle?.fontWeight ?? "0", 10));
  expect(Number.parseFloat(desktop.finalDescriptionStyle?.fontSize ?? "0"))
    .toBeLessThan(Number.parseFloat(desktop.heroDisplayLineStyle?.fontSize ?? "0"));
  expect(
    Number.parseFloat(desktop.finalDescriptionStyle?.lineHeight ?? "0") /
      Number.parseFloat(desktop.finalDescriptionStyle?.fontSize ?? "1"),
  ).toBeGreaterThanOrEqual(1.4);
  expect(["0px", "normal"]).toContain(desktop.finalDescriptionStyle?.letterSpacing);
  expect(desktop.finalDescriptionStyle?.textAlign).toBe("center");
  expect(desktop.finalDescriptionStyle?.textShadow).toBe(desktop.heroDisplayLineStyle?.textShadow);
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
  expect(desktop.finalSectionBox?.height).toBeGreaterThanOrEqual(desktop.viewportHeight * 0.68);
  expect(
    Math.abs(
      ((desktop.finalBox?.left ?? 0) + (desktop.finalBox?.width ?? 0) / 2) -
      ((desktop.finalSectionBox?.left ?? 0) + (desktop.finalSectionBox?.width ?? 0) / 2),
    ),
  ).toBeLessThanOrEqual(2);
  expect(
    Math.abs(
      ((desktop.finalBox?.top ?? 0) + (desktop.finalBox?.height ?? 0) / 2) -
      ((desktop.finalSectionBox?.top ?? 0) + (desktop.finalSectionBox?.height ?? 0) / 2),
    ),
  ).toBeLessThanOrEqual(2);
  expect(desktop.finalTitleStyle?.textAlign).toBe("center");
  expect(desktop.finalDescriptionText).toBe(
    "Three steps, one order, repeatable morning or night.",
  );
  expect(desktop.finalDescriptionActionsGap).toBeGreaterThanOrEqual(2);
  expect(desktop.finalDescriptionActionsGap).toBeLessThanOrEqual(32);
  expect(desktop.finalMediaBox?.width).toBe(desktop.finalSectionBox?.width);
  expect(desktop.finalMediaBox?.height).toBe(desktop.finalSectionBox?.height);
  expect(desktop.finalMediaStyle?.opacity).toBe("1");
  expect(desktop.finalMediaStyle?.filter).toBe("none");
  expect(desktop.finalPosterStyle?.opacity).toBe("1");
  expect(desktop.finalPosterStyle?.filter).toBe("none");
  expect(desktop.finalMediaAfterStyle?.backgroundImage).toContain("rgba(10, 12, 11");
  expect(desktop.finalMediaAfterStyle?.backgroundImage).not.toContain("0.92");
  expect(desktop.finalMediaAfterStyle?.backgroundImage).not.toContain("0.78");
  expect(desktop.finalCtaCount).toBe(1);
  expect(desktop.finalPrimaryCtaHref).toBe("#core-three");
  expect(desktop.finalPrimaryCtaText).toBe("Shop The Core");
  expect(desktop.finalPrimaryCtaStyle).toEqual(desktop.heroPrimaryCtaStyle);
  const finalPosterSrc = decodeURIComponent(desktop.finalPosterSrc);
  expect(finalPosterSrc).toContain("/media/home/final-cta-poster.webp");
  expect(finalPosterSrc).not.toContain("/mnt/data");
  expect(["pending", "motion", "static", "failed"]).toContain(desktop.finalMotionState);
  if (desktop.finalVideoSources.length > 0) {
    expect(desktop.finalVideoPoster).toBe("/media/home/final-cta-poster.webp");
    expect(desktop.finalVideoPreload).toBe("metadata");
    expect(desktop.finalVideoReadyStyle?.opacity).toBe("1");
    expect(desktop.finalVideoReadyStyle?.filter).toBe("none");
    expect(desktop.finalVideoReadyStyle?.mixBlendMode).toBe("normal");
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
  expect(desktop.whyClass).toContain("home-section--principles");
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
  expect(desktop.oldWhyListCount).toBe(0);
  expect(desktop.oldWhyStatementCount).toBe(0);
  expect(desktop.principleLabels).toEqual(principleLabels);
  expect(desktop.principlePressedStates).toEqual(["true", "false", "false"]);
  expect(desktop.principleButtonTypes).toEqual(["button", "button", "button"]);
  expect(desktop.principleButtonHrefs).toEqual([null, null, null]);
  expect(desktop.principleButtonCursors).toEqual(["pointer", "pointer", "pointer"]);
  expect(desktop.principleGroupRole).toBe("group");
  expect(desktop.principleGroupLabel).toBe("Mei Pelle principles");
  expect(desktop.principleAnchorCount).toBe(0);
  expect(desktop.principleDescriptionText).toBe(principleDescriptions[0]);
  expect(desktop.principleDescriptionStyle?.fontFamily).toMatch(/Marcellus/i);
  expect(Number.parseFloat(desktop.principleDescriptionStyle?.fontSize ?? "0"))
    .toBeGreaterThan(Number.parseFloat(desktop.plugBodyParagraphStyle?.fontSize ?? "0") * 1.6);
  expect(Number.parseFloat(desktop.principleDescriptionStyle?.fontSize ?? "0"))
    .toBeLessThan(Number.parseFloat(desktop.plugTitleFontSize) * 0.5);
  expect(desktop.principleDescriptionBox?.height).toBeGreaterThan(90);
  expect(desktop.whyListBox?.height).toBeGreaterThanOrEqual(desktop.viewportHeight * 0.8);
  const principleButtonGaps = desktop.principleButtonLineBoxes.slice(1).map((line, index) =>
    line.top - desktop.principleButtonLineBoxes[index].bottom,
  );
  expect(principleButtonGaps).toEqual([0, 0]);
  for (const line of desktop.principleButtonLineBoxes) {
    expect(line.height).toBeGreaterThanOrEqual(56);
  }
  expect((desktop.principleDescriptionBox?.top ?? 0) - (desktop.whyTitleBox?.bottom ?? 0))
    .toBeGreaterThan(desktop.viewportHeight * 0.08);
  const desktopLabelsBottomGap =
    (desktop.whyPrinciplesBox?.bottom ?? 0) - (desktop.principleButtonLineBoxes.at(-1)?.bottom ?? 0);
  expect(desktopLabelsBottomGap).toBeGreaterThanOrEqual(40);
  expect(desktopLabelsBottomGap).toBeLessThanOrEqual(130);
  expect(desktop.whyVisualBox?.left).toBeGreaterThanOrEqual(desktop.whyPrinciplesBox?.right ?? 0);
  expect(desktop.whyVisualBox?.right).toBe(desktop.whyBox?.right);
  expect(desktop.whyVisualAfterContent).toBe("none");
  expect(desktop.whyVisualOverlayCount).toBe(0);
  expect(desktop.whyTitleText).toBe(principleTitleTexts[0]);
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
  expect(desktop.whyTitleParentClass).toContain("home-three-principles");
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
  expect(desktop.whyTitleBox?.bottom ?? 0).toBeLessThan(desktop.principleDescriptionBox?.top ?? 0);
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
      const image = document.querySelector<HTMLElement>(".home-three-principles-visual__image");
      const zoom = document.querySelector<HTMLElement>(".home-three-principles-visual__zoom");
      const imageStyle = image ? getComputedStyle(image) : null;
      return {
        motion: zoom?.getAttribute("data-scroll-zoom-motion") ?? "",
        scaleVariable: zoom
          ? getComputedStyle(zoom).getPropertyValue("--home-principles-image-scale").trim()
          : "",
        transform: imageStyle?.transform ?? "",
      };
    });

  await page.evaluate(() => {
    document.querySelector(".home-section--principles")?.scrollIntoView({ block: "center" });
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
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect
    .poll(() =>
      page.evaluate(
        () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      ),
    )
    .toBe(true);
  await page.locator(".home-three-principles-visual__zoom").waitFor({ state: "attached" });
  await page.evaluate(() => {
    document.querySelector(".home-section--principles")?.scrollIntoView({ block: "center" });
  });
  await page.waitForTimeout(120);
  await expect
    .poll(async () => (await readWhyZoom()).motion)
    .toBe("static");
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
    const why = document.querySelector<HTMLElement>(".home-section--principles");
    const whyPrinciples = why?.querySelector<HTMLElement>(".home-three-principles-panel");
    const whyList = why?.querySelector<HTMLElement>(".home-three-principles");
    const whyVisual = why?.querySelector<HTMLElement>(".home-three-principles-visual");
    const whyTitle = why?.querySelector<HTMLElement>("#home-three-principles-heading");
    const whyZoom = why?.querySelector<HTMLElement>(".home-three-principles-visual__zoom");
    const whyImage = why?.querySelector<HTMLElement>(".home-three-principles-visual__image");
    const principleDescription = why?.querySelector<HTMLElement>(
      ".home-three-principles__description",
    );
    const principleButtons = Array.from(
      why?.querySelectorAll<HTMLButtonElement>(".home-three-principles__label") ?? [],
    );
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
      oldWhyListCount: why?.querySelectorAll(".home-why-list").length ?? 0,
      principleDescriptionText: clean(principleDescription?.textContent),
      principleDescriptionBox: box(principleDescription),
      principleLabels: principleButtons.map((button) => clean(button.textContent)),
      principlePressedStates: principleButtons.map((button) => button.getAttribute("aria-pressed")),
      principleButtonCursors: principleButtons.map((button) => getComputedStyle(button).cursor),
      principleButtonLineBoxes: principleButtons.map((node) => {
        const rect = node.getBoundingClientRect();
        return {
          bottom: Math.round(rect.bottom),
          height: Math.round(rect.height),
          top: Math.round(rect.top),
        };
      }),
      whyVisualOverlayCount: whyVisual?.querySelectorAll(".home-three-principles-visual__title").length ?? 0,
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
  expect(mobile.coreDescriptionText).toBe(homeCoreDescriptions.default);
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
  expect(mobile.whyBox?.height).toBeLessThanOrEqual(mobile.viewportHeight * 1.65);
  expect(mobile.oldWhyListCount).toBe(0);
  expect(mobile.principleLabels).toEqual(principleLabels);
  expect(mobile.principlePressedStates).toEqual(["true", "false", "false"]);
  expect(mobile.principleButtonCursors).toEqual(["pointer", "pointer", "pointer"]);
  expect(mobile.principleDescriptionText).toBe(principleDescriptions[0]);
  expect(mobile.principleDescriptionBox?.height).toBeGreaterThan(60);
  expect(mobile.whyListBox?.height).toBeGreaterThanOrEqual(360);
  expect(mobile.whyListBox?.height).toBeLessThanOrEqual(680);
  for (const line of mobile.principleButtonLineBoxes) {
    expect(line.height).toBeGreaterThanOrEqual(54);
  }
  expect(mobile.whyTitleText).toBe(principleTitleTexts[0]);
  expect(mobile.whyTitleAlign).toBe("left");
  const mobilePrincipleButtonGaps = mobile.principleButtonLineBoxes.slice(1).map((line, index) =>
    line.top - mobile.principleButtonLineBoxes[index].bottom,
  );
  expect(mobilePrincipleButtonGaps).toEqual([0, 0]);
  expect(mobile.whyVisualOverlayCount).toBe(0);
  expect(Number.parseFloat(mobile.pageGutter)).toBe(18);
  expect(Math.abs((mobile.whyTitleBox?.left ?? 0) - Number.parseFloat(mobile.pageGutter)))
    .toBeLessThanOrEqual(1);
  expect(Math.abs((mobile.whyListBox?.left ?? 0) - Number.parseFloat(mobile.pageGutter)))
    .toBeLessThanOrEqual(1);
  expect(mobile.whyTitleBox?.top ?? 0).toBeGreaterThanOrEqual(mobile.whyPrinciplesBox?.top ?? 0);
  expect(mobile.whyTitleBox?.bottom ?? 0).toBeLessThan(mobile.principleDescriptionBox?.top ?? 0);
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
      addOnProducts: Array.from(beyond?.querySelectorAll(".product-card__name") ?? []).map((node) =>
        clean(node.textContent),
      ),
      protectCardCount: beyond?.querySelectorAll(".home-addon-card--protect").length ?? 0,
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
  expect(merchandising.addOnLinks).not.toContain("/system#system-protect");
  expect(merchandising.addOnProducts).toEqual(["REFINE", "FRAME", "LIFT"]);
  expect(merchandising.protectCardCount).toBe(0);
});

test("homepage principles switcher updates copy without navigation", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.evaluate(() => {
    document.querySelector(".home-section--principles")?.scrollIntoView({ block: "center" });
  });

  const section = page.locator(".home-section--principles");
  const firstPrinciple = section.getByRole("button", { name: principleLabels[0] });
  const secondPrinciple = section.getByRole("button", { name: principleLabels[1] });
  const thirdPrinciple = section.getByRole("button", { name: principleLabels[2] });

  await expect(section.locator(".home-three-principles")).toBeVisible();
  await expect(section.locator(".home-three-principles a")).toHaveCount(0);
  await expect(firstPrinciple).toHaveAttribute("aria-pressed", "true");
  await expect(secondPrinciple).toHaveAttribute("aria-pressed", "false");
  await expect(thirdPrinciple).toHaveAttribute("aria-pressed", "false");
  await expect(section.locator("#home-three-principles-heading")).toHaveText(principleTitleTexts[0]);
  await expect(section.getByText(principleDescriptions[0])).toBeVisible();
  await expect(firstPrinciple).toHaveCSS("cursor", "pointer");

  await secondPrinciple.hover();
  await expect(secondPrinciple).toHaveAttribute("aria-pressed", "true");
  await expect(section.locator("#home-three-principles-heading")).toHaveText(principleTitleTexts[1]);
  await expect(section.getByText(principleDescriptions[1])).toBeVisible();

  const beforeClickUrl = page.url();
  const beforeClickScrollY = await page.evaluate(() => window.scrollY);
  await thirdPrinciple.click();
  await expect(page).toHaveURL(beforeClickUrl);
  await expect(thirdPrinciple).toHaveAttribute("aria-pressed", "true");
  await expect(section.locator("#home-three-principles-heading")).toHaveText(principleTitleTexts[2]);
  await expect(section.getByText(principleDescriptions[2])).toBeVisible();
  const afterClickScrollY = await page.evaluate(() => window.scrollY);
  expect(Math.abs(afterClickScrollY - beforeClickScrollY)).toBeLessThanOrEqual(2);

  await firstPrinciple.focus();
  await expect(firstPrinciple).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("ArrowDown");
  await expect(secondPrinciple).toHaveAttribute("aria-pressed", "true");
  await expect(section.locator("#home-three-principles-heading")).toHaveText(principleTitleTexts[1]);
  await expect(section.locator(".home-three-principles-visual__zoom")).toBeVisible();

  await expect(
    page.getByText(
      "01 Start with structure that skin understands: cleanse first, treat second, seal last.",
    ),
  ).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  const mobileSection = page.locator(".home-section--principles");
  const mobileButtons = mobileSection.locator(".home-three-principles__label");
  await expect(mobileButtons).toHaveCount(3);
  const mobileButtonHeights = await mobileButtons.evaluateAll((buttons) =>
    buttons.map((button) => Math.round(button.getBoundingClientRect().height)),
  );
  for (const height of mobileButtonHeights) {
    expect(height).toBeGreaterThanOrEqual(54);
  }
  const mobileOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(mobileOverflow).toBeLessThanOrEqual(0);
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

test("PDP discovery rail renders Core-first related products and navigates", async ({
  page,
}) => {
  await page.goto("/products/treat-03-pdrn-5-ampoule");
  await expect(
    page.getByRole("heading", { name: "BUILD AROUND THIS STEP" }),
  ).toBeVisible();

  const related = page.locator(".pdp-discovery-card strong").first();
  const name = (await related.textContent())?.trim() ?? "";
  expect(name.length).toBeGreaterThan(0);
  await expect(page.locator(".pdp-discovery-card__routine").first()).toHaveText(
    /The Core|Beyond The Core/,
  );
  await related.click();

  await expect(page).toHaveURL(/\/products\/[\w-]+$/);
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
});
