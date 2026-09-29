import { expect, test } from "./storefront-fixture";

test("account email confirmation preserves the browser Origin without leaking the token in its referrer", async ({ page }) => {
  // Intercept the explicit submission before it reaches Supabase. No account or email is created.
  await page.route("**/auth/confirm", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({ status: 200, contentType: "text/plain", body: "Synthetic confirmation submission captured." });
    } else await route.fallback();
  });
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    const response = await page.goto("/auth/confirm?token_hash=synthetic-token&type=email");
    expect(response?.headers()["referrer-policy"]).toBe("strict-origin");
    await expect(page.getByRole("heading", { name: "Confirm your request" })).toBeVisible();
    const origin = new URL(page.url()).origin;
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Confirm email" })).toBeFocused();
    const submission = page.waitForRequest((request) => request.method() === "POST" && new URL(request.url()).pathname === "/auth/confirm");
    await page.keyboard.press("Enter");
    const request = await submission;
    expect(await request.headerValue("origin")).toBe(origin);
    expect(await request.headerValue("referer")).toBe(`${origin}/`);
    expect(request.url()).not.toContain("token");
    expect(request.postData()).toContain("token_hash=synthetic-token");
    await expect(page.getByText("Synthetic confirmation submission captured.")).toBeVisible();
  }
});
