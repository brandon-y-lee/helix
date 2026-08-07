import { expect, test } from "./storefront-fixture";

const draftId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

test("draft preview is private while the public PDP remains canonical", async ({
  page,
  storefront,
}) => {
  const product = storefront.product("purchasable");
  const previewResponse = await page.goto(
    `/admin/catalog/preview/${draftId}`,
  );

  expect(previewResponse?.request().redirectedFrom()).toBeTruthy();
  await expect(page).toHaveURL(
    new RegExp(
      `/account/sign-in\\?next=%2Fadmin%2Fcatalog%2Fpreview%2F${draftId}$`,
    ),
  );
  await expect(
    page.getByRole("heading", { name: "SIGN IN" }),
  ).toBeVisible();

  await page.goto(product.path);
  await expect(
    page.getByRole("heading", { level: 1, name: product.displayName }),
  ).toBeVisible();
  await expect(page.getByText("Draft Preview")).toHaveCount(0);
  await expect(page.getByText("Preview — purchasing disabled")).toHaveCount(0);
  await expect(
    page.locator("[data-pdp-buy-button]"),
  ).not.toHaveText("Preview — purchasing disabled");
});
