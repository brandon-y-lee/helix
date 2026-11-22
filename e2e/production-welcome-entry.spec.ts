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

test("canonical preferences submit only the existing welcome consent", async ({ page, baseURL }) => {
  const network = await localStorefront(page, baseURL, { enabled: true, production: true });
  await page.goto(canonical + "/email-preferences");
  expect(network.writes).toEqual([]);
  await requestWelcome(page.getByRole("main"), "Request confirmation", page);
  await expect.poll(() => network.writes).toEqual([
    { path: subscription, body: { email: address, consent: true }, referrer: null },
  ]);
  expect(network.unexpected).toEqual([]);
});

test("canonical paused and malformed readiness never enter the legacy intake", async ({ page, baseURL }) => {
  const network = await localStorefront(page, baseURL, { ready: true, scope: "lifecycle_reviews" });
  await page.goto(canonical + "/email-preferences");
  await expect(page.getByRole("main")).toContainText(/paused/i);
  await expect(page.getByRole("main").getByRole("button", { name: "Request confirmation" })).toBeDisabled();
  await expect.poll(network.reads).toBeGreaterThan(0);
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

test("held production keeps the existing welcome enrollment closed", async ({ page, baseURL }) => {
  const network = await localStorefront(page, baseURL, { enabled: false, production: true }, held);
  await page.goto(held + "/email-preferences");
  const main = page.getByRole("main");
  await expect(main).toContainText(/paused/i);
  await expect(main.getByRole("checkbox")).toBeDisabled();
  await expect(main).toContainText(PRODUCTION_MARKETING_WORDING);
  expect(network.writes).toEqual([]);
  expect(network.unexpected).toEqual([]);
});
