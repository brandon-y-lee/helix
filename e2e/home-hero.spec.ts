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
  test("renders the desktop video hero with the Core Three positioning", async ({ page }) => {
    await allowHeroMotion(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    const hero = page.locator(".home-video-hero");
    const heading = page.getByRole("heading", {
      level: 1,
      name: "It all starts with three steps.",
    });
    const cta = page.getByRole("link", { name: "SHOP THE CORE THREE" }).first();
    const secondary = page.getByRole("link", { name: "SEE THE METHOD" }).first();
    const video = hero.locator("video");

    await expect(hero).toBeVisible();
    await expect(heading).toBeVisible();
    await expect(page.getByText("Cleanse. Treat. Seal.")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page.locator(".hero--system")).toHaveCount(0);
    await expect(page.locator("text=A sharper daily system for fresh")).toHaveCount(0);
    await expect(heading).toHaveClass(/display-secondary/);
    await expect(cta).toHaveAttribute("href", "#core-three");
    await expect(secondary).toHaveAttribute("href", "/method");
    await expect(video).toHaveCount(1);
    await expect(video).toHaveAttribute("poster", "/media/home/mei-pelle-hero-poster.webp");
    await expect(video.locator('source[type="video/webm"]')).toHaveAttribute(
      "src",
      "/media/home/mei-pelle-hero.webm",
    );
    await expect(video.locator('source[type="video/mp4"]')).toHaveAttribute(
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
    const viewportHeight = await page.evaluate(() => window.innerHeight);

    expect(heroBox?.width).toBeGreaterThan(1400);
    expect(Math.abs((heroBox?.height ?? 0) - viewportHeight)).toBeLessThanOrEqual(1);
    expect(heroBox?.y).toBe(0);
    expect(headingBox?.x).toBeLessThan(90);
    expect(ctaBox?.x).toBeLessThan(90);
    expect(ctaBox?.y).toBeGreaterThan((heroBox?.y ?? 0) + (heroBox?.height ?? 0) * 0.62);
    expect(firstSectionBox?.y).toBeGreaterThanOrEqual(
      viewportHeight - 1,
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
    const heading = page.getByRole("heading", {
      level: 1,
      name: "It all starts with three steps.",
    });
    const cta = page.getByRole("link", { name: "SHOP THE CORE THREE" }).first();
    const secondary = page.getByRole("link", { name: "SEE THE METHOD" }).first();

    await expect(hero).toBeVisible();
    await expect(heading).toBeVisible();
    await expect(cta).toBeVisible();
    await expect(secondary).toBeVisible();

    const heroBox = await hero.boundingBox();
    const headingBox = await heading.boundingBox();
    const ctaBox = await cta.boundingBox();
    const viewportHeight = await page.evaluate(() => window.innerHeight);

    expect(heroBox?.width).toBeGreaterThan(380);
    expect(Math.abs((heroBox?.height ?? 0) - viewportHeight)).toBeLessThanOrEqual(1);
    expect(heroBox?.y).toBe(0);
    expect(headingBox?.x).toBeLessThan(32);
    expect(headingBox?.width).toBeLessThan((heroBox?.width ?? 0) - 32);
    expect(headingBox?.height).toBeLessThan((heroBox?.height ?? 0) * 0.36);
    expect(ctaBox?.x).toBeLessThan(32);
    expect(ctaBox?.y).toBeGreaterThan((heroBox?.y ?? 0) + (heroBox?.height ?? 0) * 0.56);

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

    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "It all starts with three steps.",
      }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "SHOP THE CORE THREE" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "SEE THE METHOD" }).first()).toBeVisible();
    await expect(hero.locator("video")).toHaveCount(0);
    await expect(hero.locator(".home-video-hero__poster")).toBeVisible();
    await expect(media).toHaveAttribute("data-motion-state", "static");
  });

  test("sends the primary hero call-to-action to the Core Three section", async ({ page }) => {
    await allowHeroMotion(page);
    await page.goto("/");
    await page.locator(".home-video-hero__cta").click();
    await expect(page).toHaveURL(/\/#core-three$/);
    await expect(page.getByRole("heading", { name: "RESET, RECODE, SEAL." })).toBeVisible();
  });
});
