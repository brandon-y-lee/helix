import type { Page, Route } from "@playwright/test";
import { expect, test } from "./storefront-fixture";
import { expectNoMainOverflow } from "./layout-assertions";

const viewports = [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
];

type Submission = {
  method: string;
  url: string;
  body: unknown;
  origin: string | null;
  referrer: string | null;
};

async function captureMarketingRequests(
  page: Page,
  respond: (route: Route, attempt: number) => Promise<void> | void,
) {
  const submissions: Submission[] = [];
  // Exercise the public page without reading a Cart or contacting the email service.
  await page.route("**/api/cart", (route) =>
    route.fulfill({
      json: { lines: [], count: 0, subtotal: 0, currency: "USD" },
    }),
  );
  // Capture every method in the family: an unexpected GET must not escape to a provider.
  await page.route("**/api/marketing/**", async (route) => {
    const request = route.request();
    submissions.push({
      method: request.method(),
      url: request.url(),
      body: request.postData() ? request.postDataJSON() : null,
      origin: await request.headerValue("origin"),
      referrer: await request.headerValue("referer"),
    });
    await respond(route, submissions.length);
  });
  return submissions;
}

async function openPreferences(page: Page, path: string, heading: string) {
  const response = await page.goto(path);
  expect(response?.status()).toBe(200);
  expect(response?.headers()["cache-control"]).toContain("private");
  expect(response?.headers()["cache-control"]).toContain("no-store");
  expect(response?.headers()["referrer-policy"]).toBe("no-referrer");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex.*nofollow/,
  );
  const panel = page.getByRole("region", { name: heading, exact: true });
  await expect(
    panel.getByRole("heading", { level: 1, name: heading, exact: true }),
  ).toBeVisible();
  await page.waitForLoadState("networkidle");
  return panel;
}

function expectPrivateSubmission(
  page: Page,
  submission: Submission,
  path: string,
  body: unknown,
) {
  const origin = new URL(page.url()).origin;
  expect(submission).toEqual({
    method: "POST",
    url: `${origin}${path}`,
    body,
    origin,
    referrer: null,
  });
}

async function expectFitsViewport(page: Page, width: number) {
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await expectNoMainOverflow(page, width);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(width);
}

for (const viewport of viewports) {
  test(`subscription requires consent and safely retries an unavailable request at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    let pendingRequest!: Route;
    const submissions = await captureMarketingRequests(
      page,
      (route, attempt) => {
        if (attempt === 1) {
          pendingRequest = route;
          return;
        }
        return route.fulfill({ status: 202, json: { ok: true } });
      },
    );
    const panel = await openPreferences(
      page,
      "/email-preferences",
      "Stay in the know",
    );
    const email = panel.getByRole("textbox", {
      name: "Email address",
      exact: true,
    });
    const consent = panel.getByRole("checkbox", {
      name: /^I want to receive helix marketing emails/,
    });
    const subscribe = panel.getByRole("button", {
      name: "Subscribe",
      exact: true,
    });
    await expect(consent).not.toBeChecked();
    expect(submissions).toEqual([]);

    await email.fill("delivered@resend.dev");
    await subscribe.click();
    await expect(consent).toBeFocused();
    expect(submissions).toEqual([]);
    await page.keyboard.press("Space");
    await expect(consent).toBeChecked();
    await page.keyboard.press("Tab");
    await expect(
      panel.getByRole("link", { name: "Privacy Policy" }),
    ).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(subscribe).toBeFocused();
    await expect(subscribe).toHaveCSS("outline-style", "solid");
    await page.keyboard.press("Enter");
    await expect(
      panel.getByRole("button", { name: "Submitting…", exact: true }),
    ).toBeDisabled();
    await expect(email).toBeDisabled();
    await expect(consent).toBeDisabled();
    await page.keyboard.press("Enter");
    await expect.poll(() => submissions.length).toBe(1);
    expectPrivateSubmission(
      page,
      submissions[0],
      "/api/marketing/subscription",
      {
        email: "delivered@resend.dev",
        consent: true,
      },
    );
    await expectFitsViewport(page, viewport.width);

    await pendingRequest.fulfill({
      status: 503,
      json: { ok: false, error: "Private provider detail" },
    });
    await expect(panel.getByRole("alert")).toHaveText(
      "Email preferences are temporarily unavailable. Please try again.",
    );
    await expect(panel).not.toContainText("Private provider detail");
    await expect(email).toHaveValue("delivered@resend.dev");
    await expect(consent).toBeChecked();
    await expect(subscribe).toBeEnabled();
    await expectFitsViewport(page, viewport.width);

    await subscribe.click();
    await expect(panel.getByRole("status")).toHaveText(
      "If this address is eligible, check your inbox to confirm.",
    );
    await expect(panel.getByRole("status")).toBeFocused();
    expect(submissions).toHaveLength(2);
    expectPrivateSubmission(
      page,
      submissions[1],
      "/api/marketing/subscription",
      {
        email: "delivered@resend.dev",
        consent: true,
      },
    );
    await expectFitsViewport(page, viewport.width);
  });

  test(`confirmation requires an explicit token-safe action and recovers from an invalid link response at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const token = "synthetic-confirmation-token";
    const submissions = await captureMarketingRequests(page, (route, attempt) =>
      route.fulfill({
        status: attempt === 1 ? 400 : 200,
        json: attempt === 1 ? { ok: false, error: token } : { ok: true },
      }),
    );
    const panel = await openPreferences(
      page,
      `/email-preferences?confirm=${token}`,
      "Confirm your subscription",
    );
    const confirm = panel.getByRole("button", {
      name: "Confirm subscription",
      exact: true,
    });
    expect(submissions).toEqual([]);
    await expect(panel.getByRole("textbox")).toHaveCount(0);
    await expect(panel).not.toContainText(token);
    await expectFitsViewport(page, viewport.width);

    await confirm.focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(confirm).toBeFocused();
    await expect(confirm).toHaveCSS("outline-style", "solid");
    await page.keyboard.press("Enter");
    await expect(panel.getByRole("alert")).toHaveText(
      "This email link is invalid or has expired. Please use the link in your most recent helix email.",
    );
    await expect(panel).not.toContainText(token);
    await expect(confirm).toBeEnabled();
    expect(submissions).toHaveLength(1);
    expectPrivateSubmission(page, submissions[0], "/api/marketing/confirm", {
      token,
    });

    await confirm.click();
    await expect(panel.getByRole("status")).toHaveText(
      "Your subscription is confirmed. Existing email opt-outs still apply.",
    );
    await expect(panel.getByRole("status")).toBeFocused();
    await expect(confirm).toHaveCount(0);
    expect(submissions).toHaveLength(2);
    expectPrivateSubmission(page, submissions[1], "/api/marketing/confirm", {
      token,
    });
    await expectFitsViewport(page, viewport.width);
  });

  test(`withdrawal keeps both scopes explicit and prevents duplicate actions while pending at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const token = "synthetic-withdrawal-token";
    let pendingRequest!: Route;
    const submissions = await captureMarketingRequests(
      page,
      (route, attempt) => {
        if (attempt === 1) {
          pendingRequest = route;
          return;
        }
        return route.fulfill({ status: 200, json: { ok: true } });
      },
    );
    const panel = await openPreferences(
      page,
      `/email-preferences?unsubscribe=${token}`,
      "Email preferences",
    );
    const stopWelcome = panel.getByRole("button", {
      name: "Stop welcome emails",
      exact: true,
    });
    const stopMarketing = panel.getByRole("button", {
      name: "Unsubscribe from marketing",
      exact: true,
    });
    expect(submissions).toEqual([]);
    await expect(panel.getByRole("textbox")).toHaveCount(0);
    await expect(panel).not.toContainText(token);
    await expect(panel).toContainText(
      "Order, account, and support emails are unaffected.",
    );

    await stopWelcome.focus();
    await page.keyboard.press("Enter");
    await expect(stopWelcome).toBeDisabled();
    await expect(stopMarketing).toBeDisabled();
    await expect(panel.getByRole("status")).toHaveText(
      "Updating your email preferences…",
    );
    await page.keyboard.press("Enter");
    await expect.poll(() => submissions.length).toBe(1);
    expectPrivateSubmission(
      page,
      submissions[0],
      "/api/marketing/preferences",
      { token, scope: "welcome" },
    );
    await expectFitsViewport(page, viewport.width);

    await pendingRequest.fulfill({
      status: 503,
      json: { ok: false, error: token },
    });
    await expect(panel.getByRole("alert")).toHaveText(
      "Email preferences are temporarily unavailable. Please try again.",
    );
    await expect(panel).not.toContainText(token);
    await expect(stopWelcome).toBeEnabled();
    await expect(stopMarketing).toBeEnabled();
    await stopWelcome.click();
    await expect(panel.getByRole("status")).toHaveText(
      "Welcome emails have been stopped.",
    );
    await expect(panel.getByRole("status")).toBeFocused();
    await expect(stopWelcome).toHaveCount(0);
    await expect(stopMarketing).toBeEnabled();
    expect(submissions).toHaveLength(2);
    expectPrivateSubmission(
      page,
      submissions[1],
      "/api/marketing/preferences",
      { token, scope: "welcome" },
    );

    await stopMarketing.click();
    await expect(panel.getByRole("status")).toHaveText(
      "You have unsubscribed from marketing emails.",
    );
    await expect(panel.getByRole("status")).toBeFocused();
    await expect(panel.getByRole("button")).toHaveCount(0);
    expect(submissions).toHaveLength(3);
    expectPrivateSubmission(
      page,
      submissions[2],
      "/api/marketing/preferences",
      { token, scope: "all" },
    );
    await expectFitsViewport(page, viewport.width);
  });
}
