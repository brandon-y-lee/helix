import type { Locator } from "@playwright/test";
import { SERUM_EFFECTS_PRODUCT_ID } from "@/lib/content/serum-effects";
import { expect, test } from "./storefront-fixture";

const effectNames = [
  "Hydration",
  "Barrier protection",
  "Brightening & clarity",
  "Anti-aging & firmness",
];

async function propertyGeometry(card: Locator) {
  return card.evaluate((element) => {
    const track = element.parentElement;
    if (!track) throw new Error("The property slide has no scroll container.");
    const cardBox = element.getBoundingClientRect();
    const trackBox = track.getBoundingClientRect();
    return {
      aligned: Math.abs(cardBox.left - trackBox.left) <= 1,
      contained:
        cardBox.left >= trackBox.left - 1 &&
        cardBox.right <= trackBox.right + 1 &&
        cardBox.top >= trackBox.top - 1 &&
        cardBox.bottom <= trackBox.bottom + 1,
      inViewport:
        cardBox.left >= -1 && cardBox.right <= window.innerWidth + 1 &&
        cardBox.top >= -1 && cardBox.bottom <= window.innerHeight + 1,
      scrollLeft: track.scrollLeft,
      width: track.clientWidth,
    };
  });
}

async function verticalBounds(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("Expected a rendered effects section element.");
  return { top: box.y, bottom: box.y + box.height };
}

test("serum effects keep the selected property in view across desktop and mobile", async ({
  page,
  storefront,
}) => {
  const product = storefront.snapshot.products.find(
    (candidate) => candidate.id === SERUM_EFFECTS_PRODUCT_ID,
  );
  if (!product) {
    throw new Error(
      "The canonical Storefront snapshot is missing the serum effects Product.",
    );
  }

  await page.setViewportSize({ width: 1056, height: 787 });
  await page.goto(product.path);
  const section = page.getByRole("region", {
    name: /Four effects\.\s*One formula\./,
    exact: true,
  });
  await section.scrollIntoViewIfNeeded();

  await test.step("neutral hero has no effect-specific property content", async () => {
    await expect(
      section.getByRole("img", { name: "Serum effects hero image placeholder" }),
    ).toBeVisible();
    await expect(section.getByRole("region", { name: / properties$/ })).toHaveCount(0);
    for (const name of effectNames) {
      await expect(section.getByRole("button", { name, exact: true })).toHaveAttribute(
        "aria-expanded",
        "false",
      );
    }
  });

  await test.step("desktop next property scrolls to the complete second card", async () => {
    await section.getByRole("button", { name: "Hydration", exact: true }).click();
    const carousel = section.getByRole("region", { name: "Hydration properties" });
    await expect(carousel.getByRole("heading", { name: "Water binding" })).toBeVisible();
    await expect(carousel.getByRole("button", { name: "Previous property" })).toBeDisabled();
    await carousel.getByRole("button", { name: "Next property" }).click();

    const secondCard = carousel.getByRole("article", { name: "2 of 2" });
    await expect(secondCard.getByRole("heading", { name: "Stress protection" })).toBeVisible();
    await expect(
      secondCard.getByText("An osmolyte selected to complement hydration and help skin cope with environmental stress."),
    ).toBeVisible();
    // A semantic state change alone cannot catch an incorrectly calculated scroll offset.
    await expect.poll(async () => {
      const geometry = await propertyGeometry(secondCard);
      return geometry.aligned && geometry.contained && geometry.inViewport &&
        Math.abs(geometry.scrollLeft - geometry.width) <= 1;
    }).toBe(true);
    await expect(carousel.getByRole("button", { name: "Next property" })).toBeDisabled();

    await section.getByRole("button", { name: "Collapse effect description" }).click();
    await expect(section.getByRole("region", { name: / properties$/ })).toHaveCount(0);
    await expect(section.getByRole("button", { name: "Hydration", exact: true })).toBeFocused();
    await expect(
      section.getByRole("img", { name: "Serum effects hero image placeholder" }),
    ).toBeVisible();
  });

  await test.step("mobile places image, expanded property, and effect control in order without page overflow", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await section.scrollIntoViewIfNeeded();
    const hydration = section.getByRole("button", { name: "Hydration", exact: true });
    await hydration.click();
    const image = section.getByRole("img", { name: "Hydration model image placeholder" });
    const carousel = section.getByRole("region", { name: "Hydration properties" });
    await expect(carousel.getByRole("heading", { name: "Water binding" })).toBeVisible();
    await expect(hydration).toHaveAttribute("aria-expanded", "true");

    await expect.poll(async () => {
      const imageBox = await verticalBounds(image);
      const propertyBox = await verticalBounds(carousel);
      const effectBox = await verticalBounds(hydration);
      return imageBox.bottom <= propertyBox.top + 1 &&
        propertyBox.bottom <= effectBox.top + 1;
    }).toBe(true);
    const widths = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      page: document.documentElement.scrollWidth,
    }));
    expect(widths.viewport).toBe(390);
    expect(widths.page).toBeLessThanOrEqual(widths.viewport + 1);
  });
});
