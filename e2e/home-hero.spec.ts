import { expect, test, type Page } from "@playwright/test";

async function allowHeroMotion(page: Page) {
  await page.addInitScript(() => {
    const nativeMatchMedia = window.matchMedia.bind(window);

    window.matchMedia = (query: string): MediaQueryList => {
      if (query !== "(prefers-reduced-motion: reduce)") {
        return nativeMatchMedia(query);
      }

      return {
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
      } as MediaQueryList;
    };
  });
  await page.emulateMedia({ reducedMotion: "no-preference" });
}

test.describe("homepage video hero", () => {
  test("renders the desktop video hero with restrained semantic copy", async ({ page }) => {
    await allowHeroMotion(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    const hero = page.locator(".home-video-hero");
    const heading = page.getByRole("heading", { level: 1, name: "Ascension awaits." });
    const cta = page.getByRole("link", { name: "EXPLORE NOW" });
    const video = hero.locator("video");

    await expect(hero).toBeVisible();
    await expect(heading).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page.locator("text=ASCEND.")).toHaveCount(0);
    await expect(page.locator(".hero--system")).toHaveCount(0);
    await expect(page.locator("text=A sharper daily system for fresh")).toHaveCount(0);
    await expect(heading).toHaveClass(/display-secondary/);
    await expect(cta).toHaveAttribute("href", "/products");
    await expect(video).toHaveCount(1);
    await expect(video).toHaveAttribute("poster", "/media/home/mei-pelle-hero-poster.webp");
    await expect(video.locator("source")).toHaveAttribute(
      "src",
      "/media/home/mei-pelle-hero.mp4",
    );

    const videoState = await video.evaluate((el) => {
      const videoEl = el as HTMLVideoElement;
      const style = window.getComputedStyle(el);
      return {
        autoplay: videoEl.autoplay,
        controls: videoEl.controls,
        loop: videoEl.loop,
        muted: videoEl.muted,
        objectFit: style.objectFit,
        objectPosition: style.objectPosition,
        playsInline: videoEl.playsInline,
      };
    });

    expect(videoState).toMatchObject({
      autoplay: true,
      controls: false,
      loop: true,
      muted: true,
      objectFit: "cover",
      playsInline: true,
    });
    expect(videoState.objectPosition).toContain("58%");

    const headingStyle = await heading.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return {
        className: el.className,
        fontFamily: style.fontFamily,
        fontSize: Number.parseFloat(style.fontSize),
        letterSpacing: style.letterSpacing,
        lineHeight: style.lineHeight,
        textTransform: style.textTransform,
      };
    });

    expect(headingStyle.className).toContain("display-secondary");
    expect(headingStyle.fontFamily).toMatch(/Marcellus/i);
    expect(headingStyle.fontSize).toBeGreaterThan(40);
    expect(headingStyle.fontSize).toBeLessThan(90);
    expect(headingStyle.letterSpacing).toBe("normal");
    expect(headingStyle.textTransform).toBe("none");

    const heroBox = await hero.boundingBox();
    const headingBox = await heading.boundingBox();
    const ctaBox = await cta.boundingBox();
    const firstSectionBox = await page.locator(".home-section").first().boundingBox();

    expect(heroBox?.width).toBeGreaterThan(1400);
    expect(heroBox?.height).toBeGreaterThan(780);
    expect(headingBox?.x).toBeLessThan(90);
    expect(ctaBox?.x).toBeLessThan(90);
    expect(ctaBox?.y).toBeGreaterThan((heroBox?.y ?? 0) + (heroBox?.height ?? 0) * 0.7);
    expect(firstSectionBox?.y).toBeGreaterThanOrEqual(
      (heroBox?.y ?? 0) + (heroBox?.height ?? 0),
    );

    const noHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    );
    expect(noHorizontalOverflow).toBe(true);
  });

  test("keeps the hero content visible on mobile", async ({ page }) => {
    await allowHeroMotion(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    const hero = page.locator(".home-video-hero");
    const heading = page.getByRole("heading", { level: 1, name: "Ascension awaits." });
    const cta = page.getByRole("link", { name: "EXPLORE NOW" });

    await expect(hero).toBeVisible();
    await expect(heading).toBeVisible();
    await expect(cta).toBeVisible();

    const heroBox = await hero.boundingBox();
    const headingBox = await heading.boundingBox();
    const ctaBox = await cta.boundingBox();

    expect(heroBox?.width).toBeGreaterThan(380);
    expect(heroBox?.height).toBeGreaterThan(550);
    expect(headingBox?.x).toBeLessThan(32);
    expect(headingBox?.width).toBeLessThan((heroBox?.width ?? 0) - 32);
    expect(headingBox?.height).toBeLessThan((heroBox?.height ?? 0) * 0.22);
    expect(ctaBox?.x).toBeLessThan(32);
    expect(ctaBox?.y).toBeGreaterThan((heroBox?.y ?? 0) + (heroBox?.height ?? 0) * 0.68);

    const noHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    );
    expect(noHorizontalOverflow).toBe(true);
  });

  test("uses the poster instead of video when reduced motion is requested", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");

    const hero = page.locator(".home-video-hero");
    const media = hero.locator(".home-video-hero__media");

    await expect(page.getByRole("heading", { level: 1, name: "Ascension awaits." })).toBeVisible();
    await expect(page.getByRole("link", { name: "EXPLORE NOW" })).toBeVisible();
    await expect(hero.locator("video")).toHaveCount(0);
    await expect(hero.locator(".home-video-hero__poster")).toBeVisible();
    await expect(media).toHaveAttribute("data-motion-state", "static");
  });

  test("sends the primary hero call-to-action to the collection route", async ({ page }) => {
    await allowHeroMotion(page);
    await page.goto("/");
    await page.getByRole("link", { name: "EXPLORE NOW" }).click();
    await expect(page).toHaveURL(/\/products$/);
  });
});
