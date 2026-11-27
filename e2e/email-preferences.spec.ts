import { expect, test } from "./storefront-fixture";

const demoToken = "T".repeat(43);

test("retired email pages and APIs have no enrollment or delivery entry points", async ({ request }) => {
  for (const path of ["/email-preferences", "/marketing/production", "/marketing/production/confirm", "/marketing/production/preferences"]) {
    for (const suffix of ["", "?confirm=" + demoToken, "?unsubscribe=" + demoToken, "#token=" + demoToken]) {
      const response = await request.get(path + suffix);
      expect(response.status(), path + suffix).toBe(404);
      expect(response.headers()["referrer-policy"]).toBe("no-referrer");
    }
  }
  for (const path of ["subscription", "confirm", "preferences", "unsubscribe"]) {
    expect((await request.post("/api/marketing/production/" + path, { data: { token: demoToken } })).status()).toBe(404);
  }
  expect((await request.post("/api/internal/marketing/production/dispatch")).status()).toBe(404);
  expect((await request.get("/marketing/consent")).status()).toBe(404);
  expect((await request.get("/marketing/consent?confirm=" + demoToken)).status()).toBe(404);
  expect((await request.get("/marketing/consent?scope=welcome&confirm=" + demoToken)).status()).toBe(404);
});

test("independent confirmation works through a keyboard action with no token referrer", async ({ page }) => {
  const submissions: unknown[] = [];
  await page.route("**/api/marketing/confirm", async route => {
    const request = route.request();
    submissions.push([request.method(), request.postDataJSON(), await request.headerValue("referer")]);
    await route.fulfill({ json: { ok: true } });
  });
  const response = await page.goto("/marketing/consent?scope=lifecycle&confirm=" + demoToken);
  expect(response?.headers()["cache-control"]).toContain("no-store");
  expect(response?.headers()["referrer-policy"]).toBe("no-referrer");
  const confirm = page.getByRole("button", { name: "Confirm subscription" });
  await expect(confirm).toBeEnabled();
  expect(submissions).toEqual([]);
  await confirm.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toHaveText(/subscription is confirmed/i);
  expect(submissions).toEqual([["POST", { token: demoToken, scope: "lifecycle" }, null]]);
});
