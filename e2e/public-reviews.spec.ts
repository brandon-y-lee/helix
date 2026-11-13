import { test, expect } from "./storefront-fixture";
for (const width of [390, 1440])
  test(`public review submission and withdrawal at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const writes: string[] = [];
    await page.route("**/api/**", async (route) => {
      writes.push(route.request().url());
      await route.abort();
    });
    await page.goto("/helix-verification/reviews");
    await expect(
      page.getByRole("heading", { name: "Synthetic review verification" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Submit review" }),
    ).toBeDisabled();
    await page.getByLabel("Public display name").fill("Sample customer");
    await page.getByLabel("Your rating").selectOption("1");
    await page.getByLabel("Title", { exact: true }).fill("Not a good fit");
    await page
      .getByLabel("Your experience")
      .fill("The texture was not a good fit for my routine.");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Submit review" }).click();
    await expect(
      page.getByText("Submitted for moderation.", { exact: false }),
    ).toBeVisible();
    await expect(page.getByRole("checkbox")).not.toBeChecked();
    await page.getByRole("button", { name: "Withdraw review" }).click();
    await expect(
      page.getByText("Your review is no longer public."),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
    expect(writes).toEqual([]);
  });
