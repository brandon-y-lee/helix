import { expect, test } from "@playwright/test";

test("homepage hero CTAs remain usable on desktop and mobile", async ({
  page,
}) => {
  await page.goto("/");
  const hero = page.locator(".home-video-hero");
  await expect(
    hero.getByRole("heading", {
      level: 1,
      name: "Your skin starts with three steps.",
    }),
  ).toBeVisible();
  await expect(hero.getByRole("link", { name: "SEE THE SYSTEM" })).toHaveAttribute(
    "href",
    "/system",
  );

  await page.setViewportSize({ width: 390, height: 844 });
  const shopCore = hero.getByRole("link", { name: "SHOP THE CORE" });
  await expect(shopCore).toBeVisible();
  await shopCore.click();
  await expect(page).toHaveURL(/\/#core-three$/);
  await expect(
    page.getByRole("region", { name: "The Core", exact: true }),
  ).toBeInViewport();
});

test("homepage videos play when visible and defer offscreen media", async ({
  page,
}) => {
  await page.goto("/");

  const hero = page.getByRole("region", {
    name: "Your skin starts with three steps.",
  });
  const heroMedia = hero.locator("[data-motion-state]");
  const heroVideo = hero.locator("video");

  await expect(heroMedia).toHaveAttribute("data-motion-state", "motion");
  await expect(page.locator("video")).toHaveCount(1);

  const startTime = await heroVideo.evaluate(
    (element) => (element as HTMLVideoElement).currentTime,
  );
  await expect
    .poll(
      () =>
        heroVideo.evaluate((element, initialTime) => {
          const video = element as HTMLVideoElement;
          return !video.paused && Math.abs(video.currentTime - initialTime) > 0.1;
        }, startTime),
      { timeout: 10_000 },
    )
    .toBe(true);

  const plugSection = page.getByRole("region", { name: "Plug and Play" });
  await plugSection.scrollIntoViewIfNeeded();
  await expect(plugSection.locator("[data-motion-state]")).toHaveAttribute(
    "data-motion-state",
    "motion",
  );
  await expect(page.locator("video")).toHaveCount(2);

  const finalSection = page.getByRole("region", {
    name: "It’s time to invest in your skin",
  });
  await finalSection.scrollIntoViewIfNeeded();
  await expect(finalSection.locator("[data-motion-state]")).toHaveAttribute(
    "data-motion-state",
    "motion",
  );
  await expect(page.locator("video")).toHaveCount(3);
});
