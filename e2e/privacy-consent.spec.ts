import { expect, test } from "./storefront-fixture";

const endpoint = "/helix-verification/privacy/mock/event";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/cart", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        count: 0,
        lines: [],
        subtotal: 0,
        currency: "USD",
      }),
    }),
  );
});
async function intercept(page: import("@playwright/test").Page) {
  const scripts: string[] = [];
  const events: string[] = [];
  const unexpected: string[] = [];
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (
      /^\/helix-verification\/privacy\/mock\/(ga|meta|web|speed)\.js$/.test(
        url.pathname,
      )
    ) {
      scripts.push(url.pathname);
      return route.fallback();
    }
    if (url.pathname.startsWith(endpoint)) {
      events.push(url.pathname + " " + request.postData());
      return route.fulfill({ status: 204 });
    }
    if (!["127.0.0.1", "localhost"].includes(url.hostname)) {
      unexpected.push(url.hostname);
      return route.abort();
    }
    return route.fallback();
  });
  return { scripts, events, unexpected };
}
const open = async (page: import("@playwright/test").Page) => {
  await page
    .locator(".site-footer")
    .getByRole("button", { name: "Your Privacy Choices", exact: true })
    .click();
  return page.getByRole("dialog", { name: "Your Privacy Choices" });
};

test("privacy choices gate scripts, persist independent analytics, and revoke loaded SDKs", async ({
  page,
}) => {
  const network = await intercept(page);
  await page.goto("/helix-verification/privacy");
  let dialog = await open(page);
  expect(network.scripts).toEqual([]);
  await dialog.getByRole("switch", { name: "Allow analytics" }).check();
  await page.keyboard.press("Escape");
  expect(network.scripts).toEqual([]);
  dialog = await open(page);
  await expect(
    dialog.getByRole("switch", { name: "Allow analytics" }),
  ).not.toBeChecked();
  await dialog.getByRole("switch", { name: "Allow analytics" }).check();
  await dialog.getByRole("button", { name: "Confirm my choices" }).click();
  await expect.poll(() => network.scripts.length).toBe(3);
  expect(network.scripts.join(" ")).not.toContain("/meta.js");
  await page.getByRole("button", { name: "Emit synthetic metric" }).click();
  await expect
    .poll(() =>
      network.events.some((event) => event.includes('"service":"speed"')),
    )
    .toBe(true);
  expect(
    (await page.context().cookies()).some((cookie) => cookie.name === "_ga"),
  ).toBe(true);
  await page.reload();
  await expect.poll(() => network.scripts.length).toBe(6);
  dialog = await open(page);
  await expect(
    dialog.getByRole("switch", { name: "Allow analytics" }),
  ).toBeChecked();
  await expect(
    dialog.getByRole("switch", { name: "Allow marketing" }),
  ).not.toBeChecked();
  await dialog.getByRole("switch", { name: "Allow analytics" }).uncheck();
  await dialog.getByRole("button", { name: "Confirm my choices" }).click();
  await expect(
    page.getByRole("heading", { name: "Privacy controls verification" }),
  ).toBeVisible();
  await expect(
    page.locator('script[data-sdkn^="@vercel/"],#helix-ga4'),
  ).toHaveCount(0);
  const count = network.events.length;
  await page.getByRole("button", { name: "Emit synthetic metric" }).click();
  expect(network.events).toHaveLength(count);
  expect(
    (await page.context().cookies()).some((cookie) => cookie.name === "_ga"),
  ).toBe(false);
  expect(network.unexpected).toEqual([]);
});

test("marketing is independent and GPC overrides prior marketing opt-in", async ({
  page,
}) => {
  const network = await intercept(page);
  await page.goto("/helix-verification/privacy");
  let dialog = await open(page);
  await dialog.getByRole("switch", { name: "Allow marketing" }).check();
  await dialog.getByRole("button", { name: "Confirm my choices" }).click();
  await expect.poll(() => network.scripts.length).toBe(1);
  expect(network.scripts[0]).toContain("/meta.js");
  await expect.poll(() => network.events.length).toBe(1);
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "globalPrivacyControl", {
      get: () => true,
      configurable: true,
    }),
  );
  await page.reload();
  dialog = await open(page);
  await expect(
    dialog.getByRole("switch", { name: "Allow marketing" }),
  ).not.toBeChecked();
  await expect(
    dialog.getByRole("switch", { name: "Allow marketing" }),
  ).toBeDisabled();
  await expect(dialog.getByText(/Global Privacy Control is on/)).toBeVisible();
  expect(network.scripts).toHaveLength(1);
  expect(
    (await page.context().cookies()).some((cookie) => cookie.name === "_fbp"),
  ).toBe(false);
  expect(network.unexpected).toEqual([]);
});

test("private navigation removes resident trackers without transmitting its URL", async ({
  page,
}) => {
  const network = await intercept(page);
  await page.goto("/helix-verification/privacy");
  const dialog = await open(page);
  await dialog.getByRole("button", { name: "Accept All", exact: true }).click();
  await expect.poll(() => network.scripts.length).toBe(4);
  await page.getByRole("button", { name: "Enter private context" }).click();
  await expect(page).toHaveURL(/\/account\/sign-in\?next=%2Faccount$/);
  await expect(
    page.locator('script[data-sdkn^="@vercel/"],#helix-ga4,#helix-meta'),
  ).toHaveCount(0);
  expect(network.events.join(" ")).not.toContain("synthetic-private");
  expect(network.unexpected).toEqual([]);
});

test("a withdrawal in one tab updates another tab and stops its loaded SDKs", async ({
  page,
  context,
}) => {
  const mainNetwork = await intercept(page);
  await page.goto("/helix-verification/privacy");
  const other = await context.newPage();
  await other.route("**/api/cart", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        count: 0,
        lines: [],
        subtotal: 0,
        currency: "USD",
      }),
    }),
  );
  const otherNetwork = await intercept(other);
  await other.goto("/helix-verification/privacy");
  let dialog = await open(page);
  await dialog.getByRole("switch", { name: "Allow analytics" }).check();
  await dialog.getByRole("button", { name: "Confirm my choices" }).click();
  await expect.poll(() => mainNetwork.scripts.length).toBe(3);
  await expect.poll(() => otherNetwork.scripts.length).toBe(3);
  dialog = await open(page);
  await dialog.getByRole("switch", { name: "Allow analytics" }).uncheck();
  await dialog.getByRole("button", { name: "Confirm my choices" }).click();
  await expect(
    other.locator('script[data-sdkn^="@vercel/"],#helix-ga4'),
  ).toHaveCount(0);
  await expect(
    other.getByRole("heading", { name: "Privacy controls verification" }),
  ).toBeVisible();
  const eventCount = otherNetwork.events.length;
  await other.getByRole("button", { name: "Emit synthetic metric" }).click();
  expect(otherNetwork.events).toHaveLength(eventCount);
  const otherDialog = await open(other);
  await expect(
    otherDialog.getByRole("switch", { name: "Allow analytics" }),
  ).not.toBeChecked();
  expect(mainNetwork.unexpected).toEqual([]);
  expect(otherNetwork.unexpected).toEqual([]);
});
