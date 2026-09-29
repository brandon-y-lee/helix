import type { Page, Route } from "@playwright/test";
import { expect, test } from "./storefront-fixture";
import { expectNoMainOverflow } from "./layout-assertions";

type Submission = {
  method: string;
  path: string;
  body: Record<string, unknown>;
  origin: string | null;
  referrer: string | null;
};

async function captureRequests(
  page: Page,
  respond: (route: Route, attempt: number) => Promise<void> | void,
) {
  const submissions: Submission[] = [];
  // All writes are intercepted; these browser checks cannot enroll anyone or send email.
  await page.route("**/api/cart", (route) =>
    route.fulfill({
      json: { lines: [], count: 0, subtotal: 0, currency: "USD" },
    }),
  );
  await page.route(
    /\/api\/(?:product-notifications\/[^/?]+|product-waitlist)(?:\?.*)?$/,
    async (route) => {
      const request = route.request();
      submissions.push({
        method: request.method(),
        path: new URL(request.url()).pathname,
        body: request.postData() ? request.postDataJSON() : {},
        origin: await request.headerValue("origin"),
        referrer: await request.headerValue("referer"),
      });
      await respond(route, submissions.length);
    },
  );
  return submissions;
}

async function openManagement(page: Page, query = "") {
  const response = await page.goto(`/product-notifications${query}`);
  expect(response?.status()).toBe(200);
  expect(response?.headers()["cache-control"]).toContain("private");
  expect(response?.headers()["cache-control"]).toContain("no-store");
  expect(response?.headers()["referrer-policy"]).toBe("no-referrer");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex.*nofollow/,
  );
  await page.waitForLoadState("networkidle");
  return page.getByRole("region", {
    name: query ? "Cancel Product notification" : "Product notifications",
    exact: true,
  });
}

async function expectFits(page: Page, width: number) {
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await expectNoMainOverflow(page, width);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(width);
}

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
]) {
  test(`Product enrollment keeps consent independent and retries the same request at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const submissions = await captureRequests(page, (route, attempt) =>
      route.fulfill({
        status: attempt === 1 ? 503 : 200,
        json:
          attempt === 1
            ? {
                ok: false,
                error: {
                  message:
                    "The waitlist is temporarily unavailable. Try again.",
                },
              }
            : { ok: true },
      }),
    );
    await page.goto("/helix-verification/product-notifications");
    const trigger = page.getByRole("button", {
      name: "Join the waitlist",
      exact: true,
    });
    await trigger.click();
    const dialog = page.getByRole("dialog", {
      name: "Join the Verification Serum waitlist",
    });
    const email = dialog.getByRole("textbox", { name: "Email address" });
    const consent = dialog.getByRole("checkbox");
    await expect(email).toBeFocused();
    await expect(consent).not.toBeChecked();
    await expect(dialog).toContainText("expires 12 months after enrollment");
    await expect(
      dialog.getByRole("link", { name: "Manage Product notifications" }),
    ).toHaveAttribute("href", "/product-notifications");
    await email.fill("delivered@resend.dev");
    const submit = dialog.getByRole("button", {
      name: "Join the waitlist",
      exact: true,
    });
    await submit.click();
    await expect(dialog.getByRole("alert")).toContainText(
      "temporarily unavailable",
    );
    await expect(email).toHaveValue("delivered@resend.dev");
    await submit.click();
    await expect(dialog.getByRole("status")).toHaveText(
      "Your Product notification request for Verification Serum was received.",
    );
    expect(submissions).toHaveLength(2);
    expect(submissions[0].body).toEqual({
      productId: "123e4567-e89b-42d3-a456-426614174141",
      email: "delivered@resend.dev",
      marketingConsent: false,
      requestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
    });
    expect(submissions[1].body).toEqual(submissions[0].body);
    await consent.check();
    await submit.click();
    await expect(dialog.getByRole("status")).toContainText(
      "check your inbox to confirm marketing emails separately",
    );
    expect(submissions).toHaveLength(3);
    expect(submissions[2].body.marketingConsent).toBe(true);
    expect(submissions[2].body.requestId).not.toBe(
      submissions[1].body.requestId,
    );
    await expectFits(page, viewport.width);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test(`Recovery is private, explicit, and retryable at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    let pending!: Route;
    const submissions = await captureRequests(page, (route, attempt) => {
      if (attempt === 1) {
        pending = route;
        return;
      }
      return route.fulfill({ status: 202, json: { ok: true } });
    });
    const panel = await openManagement(page);
    expect(submissions).toEqual([]);
    const email = panel.getByRole("textbox", { name: "Email address" });
    await email.fill("delivered@resend.dev");
    await panel
      .getByRole("button", { name: "Email cancellation links" })
      .click();
    await expect(
      panel.getByRole("button", { name: "Requesting links…" }),
    ).toBeDisabled();
    await expect(email).toBeDisabled();
    await expect.poll(() => submissions.length).toBe(1);
    expect(submissions[0]).toEqual({
      method: "POST",
      path: "/api/product-notifications/recovery",
      body: {
        email: "delivered@resend.dev",
        requestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      },
      origin: new URL(page.url()).origin,
      referrer: null,
    });
    await pending.fulfill({
      status: 503,
      json: { ok: false, error: { message: "Private provider detail" } },
    });
    await expect(panel.getByRole("alert")).toContainText(
      "temporarily unavailable",
    );
    await expect(panel).not.toContainText("Private provider detail");
    await expect(email).toHaveValue("delivered@resend.dev");
    await panel
      .getByRole("button", { name: "Email cancellation links" })
      .click();
    await expect(panel.getByRole("status")).toHaveText(
      "If this address is eligible, check your inbox for private cancellation links.",
    );
    await expect(panel.getByRole("status")).toBeFocused();
    expect(submissions).toHaveLength(2);
    expect(submissions[1].body).toEqual(submissions[0].body);
    await expect(panel).toContainText("request links again after one minute");
    await expectFits(page, viewport.width);
  });

  test(`Opening or scanning a private link cannot cancel a Product notification at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const token = "a".repeat(43);
    const submissions = await captureRequests(page, (route, attempt) =>
      route.fulfill({
        status: attempt === 1 ? 400 : 200,
        json:
          attempt === 1
            ? { ok: false, error: { message: token } }
            : { ok: true },
      }),
    );
    const panel = await openManagement(page, `?cancel=${token}`);
    const scan = await page.request.head(
      `/product-notifications?cancel=${token}`,
    );
    expect(scan.status()).toBe(200);
    expect(scan.headers()["cache-control"]).toContain("no-store");
    expect(submissions).toEqual([]);
    await expect(panel.getByRole("textbox")).toHaveCount(0);
    await expect(panel).not.toContainText(token);
    await expect(panel).toContainText(
      "Your marketing preferences are unchanged",
    );
    const cancel = panel.getByRole("button", {
      name: "Cancel Product notification",
      exact: true,
    });
    await cancel.focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(cancel).toBeFocused();
    await expect(cancel).toHaveCSS("outline-style", "solid");
    await page.keyboard.press("Enter");
    await expect(panel.getByRole("alert")).toContainText(
      "invalid or has expired",
    );
    await expect(panel).not.toContainText(token);
    expect(submissions).toEqual([
      {
        method: "POST",
        path: "/api/product-notifications/cancel",
        body: { token },
        origin: new URL(page.url()).origin,
        referrer: null,
      },
    ]);
    await cancel.click();
    await expect(panel.getByRole("status")).toHaveText(
      "Your cancellation request has been processed.",
    );
    await expect(panel.getByRole("status")).toBeFocused();
    await expect(cancel).toHaveCount(0);
    await expect(panel).toContainText(
      "A message already on its way may still arrive",
    );
    expect(submissions).toHaveLength(2);
    await expectFits(page, viewport.width);
  });
}
