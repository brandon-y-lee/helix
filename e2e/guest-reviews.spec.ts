import { test, expect } from "./storefront-fixture";
for (const width of [390, 1440])
  test(`private guest review and navigation at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const unexpected: string[] = [];
    await page.route("**/api/**", (route) => {
      unexpected.push(route.request().url());
      return route.abort();
    });
    await page.goto(
      "/helix-verification/guest-reviews#token=" + "a".repeat(43),
    );
    await expect(
      page.getByRole("heading", { name: "Sample serum" }),
    ).toBeVisible();
    expect(new URL(page.url()).hash).toBe("");
    await page.getByLabel("Public display name").fill("Sample guest");
    await page.getByLabel("Your rating").selectOption("1");
    await page.getByLabel("Title", { exact: true }).fill("Not for me");
    await page
      .getByLabel("Your experience")
      .fill("An honest synthetic negative review.");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Submit review" }).click();
    await expect(
      page.getByText("Submitted for moderation.", { exact: false }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Withdraw review" }).click();
    await expect(
      page.getByText("Your review is no longer public."),
    ).toBeVisible();
    await page.goto(
      "/helix-verification/guest-reviews#token=" + "b".repeat(43),
    );
    await expect(
      page.getByText("This review link is invalid or expired.", {
        exact: false,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Submit review" }),
    ).toHaveCount(0);
    await page.goto(
      "/helix-verification/guest-reviews#token=" + "a".repeat(43),
    );
    await expect(
      page.getByRole("heading", { name: "Sample serum" }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByText("Reopen the original review link from your email.", {
        exact: false,
      }),
    ).toBeVisible();
    expect(
      await page.evaluate(() =>
        Object.values(localStorage).some((x) =>
          String(x).includes("a".repeat(43)),
        ),
      ),
    ).toBe(false);
    expect(unexpected).toEqual([]);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
  });
