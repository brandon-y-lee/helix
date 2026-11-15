import type { CartState } from "@/lib/cart/types";
import { test, expect } from "./storefront-fixture";
for (const width of [390, 1440])
  test(`public review submission and withdrawal at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const unexpected: string[] = [];
    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const base = new URL(test.info().project.use.baseURL as string);
      // The shared shell reads its cart. Fulfill only that exact read locally;
      // mutations and all review/provider requests remain forbidden.
      if (
        url.origin === base.origin &&
        url.pathname === "/api/cart" &&
        !url.search &&
        request.method() === "GET"
      ) {
        return route.fulfill({
          json: {
            lines: [],
            count: 0,
            subtotal: 0,
            currency: "USD",
          } satisfies CartState,
        });
      }
      unexpected.push(`${request.method()} ${request.url()}`);
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
    expect(unexpected).toEqual([]);
  });
