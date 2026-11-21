import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./storefront-fixture";
import { PRODUCTION_MARKETING_WORDING } from "../lib/production-marketing/contract";

const canonical = "https://www.helixskin.us";
const held = "https://helix-a1b2c3d4e-brandons-projects-5060bad5.vercel.app";
const subscription = "/api/marketing/production/subscription";
const address = "welcome-proof@example.invalid";

// Exercise the real page under the public browser origin. Only the loopback
// artifact supplies page/assets. Every API response and email address is synthetic.
async function localStorefront(page: Page, baseURL: string | undefined, readiness: unknown, origin = canonical) {
  const local = new URL(baseURL ?? "");
  if (!["127.0.0.1", "localhost"].includes(local.hostname) || local.protocol !== "http:") {
    throw new Error("Welcome browser proof requires a loopback storefront.");
  }
  const writes: { path: string; body: unknown; referrer: string | null }[] = [];
  const unexpected: string[] = [];
  let reads = 0;
  await page.context().routeWebSocket("**/*", socket => socket.close());
  await page.context().route("**/*", async route => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname === subscription && !url.search && req.method() === "GET") {
      reads++;
      return route.fulfill({ json: readiness, headers: { "Cache-Control": "private, no-store" } });
    }
    if ([subscription, "/api/marketing/confirm"].includes(url.pathname) && !url.search && req.method() === "POST") {
      writes.push({ path: url.pathname, body: req.postDataJSON(), referrer: await req.headerValue("referer") });
      return route.fulfill({ status: url.pathname === subscription ? 202 : 200, json: { ok: true } });
    }
    if (url.pathname === "/api/cart" && req.method() === "GET") {
      return route.fulfill({ json: { count: 0, lines: [], subtotal: 0, currency: "USD" } });
    }
    if (url.pathname.startsWith("/api/") || !["GET", "HEAD"].includes(req.method())) {
      unexpected.push(req.method() + " " + url.pathname);
      return route.abort();
    }
    if (req.resourceType() === "media" || url.pathname === "/_next/image") return route.abort();
    const dest = new URL(local);
    dest.pathname = url.pathname;
    dest.search = url.search;
    const response = await route.fetch({ url: dest.href, maxRedirects: 0 });
    return route.fulfill({ response });
  });
  return { writes, unexpected, reads: () => reads };
}

async function requestWelcome(scope: Locator, buttonName: string, page: Page) {
  const checkbox = scope.getByRole("checkbox", { name: new RegExp(PRODUCTION_MARKETING_WORDING.slice(0, 30)) });
  await expect(checkbox).toBeEnabled();
  await expect(checkbox).not.toBeChecked();
  await expect(scope).toContainText(PRODUCTION_MARKETING_WORDING);
  await expect(scope).not.toContainText(/15%|cart (and|or) product reminders|welcome offer|welcome series/i);
  await scope.getByRole("textbox", { name: "Email address" }).fill(address);
  await checkbox.focus();
  await page.keyboard.press("Space");
  const button = scope.getByRole("button", { name: buttonName, exact: true });
  await button.focus();
  await page.keyboard.press("Enter");
}

for (const width of [390, 1440]) {
  test(`canonical footer, popup and preferences submit only welcome consent at ${width}px`, async ({ page, baseURL }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const network = await localStorefront(page, baseURL, { enabled: true, production: true });
    await page.clock.install();
    await page.goto(canonical + "/");
    const footer = page.getByRole("contentinfo");
    await expect(footer.getByRole("checkbox")).toBeEnabled();
    expect(network.writes).toEqual([]);
    await footer.locator("section").filter({ has: page.getByRole("form", { name: "Email signup" }) })
      .screenshot({ path: testInfo.outputPath(`welcome-footer-${width}.png`) });
    await page.clock.fastForward(13000);
    const dialog = page.getByRole("dialog");
    await dialog.screenshot({ path: testInfo.outputPath(`welcome-popup-${width}.png`) });
    await requestWelcome(dialog, "Request confirmation", page);
    await expect.poll(() => network.writes.length).toBe(1);
    await page.keyboard.press("Escape");
    await requestWelcome(footer, "Sign up", page);
    await expect.poll(() => network.writes.length).toBe(2);
    await page.goto(canonical + "/email-preferences");
    await requestWelcome(page.getByRole("main"), "Request confirmation", page);
    await expect.poll(() => network.writes.length).toBe(3);
    expect(network.writes).toEqual(Array(3).fill({ path: subscription, body: { email: address, consent: true }, referrer: null }));
    expect(network.unexpected).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  });
}

test("canonical paused and malformed readiness never enter the legacy intake", async ({ page, baseURL }) => {
  const network = await localStorefront(page, baseURL, { ready: true, scope: "lifecycle_reviews" });
  await page.clock.install();
  await page.goto(canonical + "/");
  const footer = page.getByRole("contentinfo");
  await expect(footer).toContainText(/paused/i);
  await expect(footer.getByRole("checkbox")).toBeDisabled();
  await expect.poll(network.reads).toBeGreaterThan(0);
  await page.clock.fastForward(13000);
  await expect.poll(network.reads).toBeGreaterThanOrEqual(2);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goto(canonical + "/email-preferences");
  await expect(page.getByRole("main")).toContainText(/paused/i);
  await expect(page.getByRole("main").getByRole("button", { name: "Request confirmation" })).toBeDisabled();
  expect(network.writes).toEqual([]);
  expect(network.unexpected).toEqual([]);
});

test("previously issued canonical query link still needs a human action on its original confirmation route", async ({ page, baseURL }) => {
  const network = await localStorefront(page, baseURL, { enabled: false });
  const token = "synthetic-legacy-confirmation";
  await page.goto(canonical + "/email-preferences?scope=lifecycle&confirm=" + token);
  const confirm = page.getByRole("main").getByRole("button", { name: "Confirm subscription" });
  await expect(confirm).toBeEnabled();
  expect(network.writes).toEqual([]);
  await confirm.focus();
  await page.keyboard.press("Enter");
  await expect.poll(() => network.writes).toEqual([
    { path: "/api/marketing/confirm", body: { token, scope: "lifecycle" }, referrer: null },
  ]);
  expect(network.unexpected).toEqual([]);
});

test("held production deployment shows all three paused welcome entries without legacy intake", async ({ page, baseURL }) => {
  const network = await localStorefront(page, baseURL, { enabled: false, production: true }, held);
  await page.clock.install();
  await page.goto(held + "/");
  const footer = page.getByRole("contentinfo");
  await expect(footer).toContainText(/paused/i);
  await expect(footer).toContainText(PRODUCTION_MARKETING_WORDING);
  await expect(footer.getByRole("button", { name: "Sign up" })).toBeDisabled();
  await expect(footer.getByRole("checkbox")).not.toBeChecked();
  await expect.poll(network.reads).toBeGreaterThan(0);
  await page.clock.fastForward(13000);
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(/paused/i);
  await expect(dialog).toContainText(PRODUCTION_MARKETING_WORDING);
  await expect(dialog.getByRole("button", { name: "Request confirmation" })).toBeDisabled();
  await expect(dialog.getByRole("textbox")).toBeDisabled();
  await page.keyboard.press("Escape");
  await page.goto(held + "/email-preferences");
  const main = page.getByRole("main");
  await expect(main).toContainText(/paused/i);
  await expect(main.getByRole("checkbox")).toBeDisabled();
  await expect(main).toContainText(PRODUCTION_MARKETING_WORDING);
  expect(network.writes).toEqual([]);
  expect(network.unexpected).toEqual([]);
});
