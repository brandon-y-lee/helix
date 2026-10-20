import type { Page } from "@playwright/test";
import { expect, test } from "./storefront-fixture";
import { expectNoMainOverflow } from "./layout-assertions";

const viewports = [{ width: 1440, height: 900 }, { width: 390, height: 844 }];

// The page uses an in-memory adapter. Blocking is an additional safety net;
// any attempted API request or write fails the zero-network assertions.
async function blockApplicationCalls(page: Page) {
  const blocked: string[] = [];
  await page.route("**/*", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/admin" || path.startsWith("/admin/") || path.startsWith("/api/")
      || !["GET", "HEAD"].includes(request.method())) {
      blocked.push(`${request.method()} ${path}`);
      return route.abort("blockedbyclient");
    }
    return route.fallback();
  });
  return blocked;
}

async function loadDemoOrder(page: Page, scenario = "default") {
  await page.goto(`/helix-verification/admin/demo-orders?scenario=${scenario}`);
  await expect(page.getByRole("heading", { name: "Demo orders", exact: true })).toBeVisible();
  await expect(page.locator('a[href="/admin"], a[href^="/admin/"]')).toHaveCount(0);
  const number = page.getByLabel("Order Number", { exact: true });
  await number.fill("SAMPLE-001");
  await number.press("Enter");
  await expect(page.getByRole("heading", { name: "Order SAMPLE-001", exact: true })).toBeFocused();
}

async function expectNoPageOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
}

for (const viewport of viewports) {
  test(`customer split shipment history is clearly simulated at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const blocked = await blockApplicationCalls(page);
    await page.goto("/helix-verification/customer/order?state=populated");
    const tracking = page.getByRole("region", { name: "Simulated tracking", exact: true });
    await expect(tracking).toContainText("Demo only. No goods will ship. Carrier events are simulated.");
    const first = tracking.getByRole("region", { name: "Simulated shipment 1", exact: true });
    const second = tracking.getByRole("region", { name: "Simulated shipment 2", exact: true });
    await expect(first).toContainText("Delivered");
    await expect(second).toContainText("Exception");
    await expect(first.getByRole("list", { name: "Shipment 1 events" }).getByRole("listitem")).toHaveCount(3);
    await expect(second.getByRole("list", { name: "Shipment 2 events" }).getByRole("listitem")).toHaveCount(2);
    await expect(tracking.getByText("Sample skincare product · 50 ml · Qty 1", { exact: true })).toHaveCount(2);
    await expect(tracking).not.toContainText(/123 Example Street|Sample Recipient|sample-shipment|commandId|resolutionReason|operator/i);
    await expect(tracking.getByRole("link")).toHaveCount(0);
    await expectNoMainOverflow(page, viewport.width);

    await page.goto("/helix-verification/customer/order?state=pending");
    await expect(page.getByRole("heading", { name: "Awaiting payment confirmation", exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "Simulated tracking", exact: true })).toHaveCount(0);
    await expectNoMainOverflow(page, viewport.width);
    expect(blocked).toEqual([]);
  });
}

test("demo tracking supports keyboard dispatch at 390px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const blocked = await blockApplicationCalls(page);
  await loadDemoOrder(page);
  await expect(page.getByText("Simulate tracking for a verified sandbox purchase. No real charge occurred. No goods will ship.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Simulate dispatch", exact: true })).toBeDisabled();

  const quantity = page.getByRole("spinbutton", { name: "Sample skincare product · 50 ml quantity" });
  await quantity.fill("1");
  await quantity.press("Tab");
  await expect(page.getByRole("button", { name: "Simulate dispatch", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toContainText("Simulated event recorded. Email delivery is separate");
  await expect(page.getByRole("heading", { name: "Order SAMPLE-001", exact: true })).toBeFocused();
  await expect(page.getByRole("region", { name: "Simulated shipment 1", exact: true })).toContainText("Qty 1");
  await expect(page.getByText("1 remaining of 2", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Update simulated tracking · Shipment 1" })).toBeVisible();

  await expectNoPageOverflow(page);
  expect(blocked).toEqual([]);
});

test("uncertain simulation locks edits and safely recovers one recorded shipment", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const blocked = await blockApplicationCalls(page);
  await loadDemoOrder(page, "uncertain");
  await page.getByRole("spinbutton").fill("1");
  await page.getByRole("button", { name: "Simulate dispatch", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Recording simulated event…");
  await expect(page.getByLabel("Order Number", { exact: true })).toBeDisabled();
  await expect(page.getByRole("spinbutton")).toBeDisabled();
  await expect(page.getByRole("main").getByRole("alert")).toBeFocused();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("The event outcome could not be confirmed.");
  await expect(page.getByRole("button", { name: "Simulate dispatch", exact: true })).toBeDisabled();
  await page.getByRole("main").getByRole("alert").press("Tab");
  await expect(page.getByRole("button", { name: "Retry same event", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toContainText("already recorded. No duplicate event was created.");
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Order SAMPLE-001", exact: true })).toBeFocused();
  await expectNoPageOverflow(page);
  await expect(page.getByRole("region", { name: /^Simulated shipment \d+$/ })).toHaveCount(1);
  expect(blocked).toEqual([]);
});

test("lookup failure has clear recovery without application calls", async ({ page }) => {
  const blocked = await blockApplicationCalls(page);
  await page.goto("/helix-verification/admin/demo-orders?scenario=lookup-error");
  await page.getByLabel("Order Number", { exact: true }).fill("SAMPLE-001");
  await page.getByRole("button", { name: "Find demo Order", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toBeFocused();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("The demo Order could not be loaded. Try again.");
  await expect(page.getByRole("heading", { name: "New simulated shipment", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Find demo Order", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Order SAMPLE-001", exact: true })).toBeFocused();
  await expectNoPageOverflow(page);
  expect(blocked).toEqual([]);
});
