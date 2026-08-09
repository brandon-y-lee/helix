import { expect, test } from "./storefront-fixture";

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
