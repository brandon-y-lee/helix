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

test("homepage hero uses a static poster for reduced motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  const media = page.locator(".home-video-hero__media");
  await expect(media).toHaveAttribute("data-motion-state", "static");
  await expect(media.locator("video")).toHaveCount(0);
  await expect(media.locator(".home-video-hero__poster")).toBeVisible();
});
