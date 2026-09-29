import type { Page } from "@playwright/test";
import { expect, test } from "./storefront-fixture";

const viewports = [{ width: 1440, height: 900 }, { width: 390, height: 844 }];
const fixtureRoot = "/helix-verification/admin/support";
const longFilename = `product-${"photo".repeat(22)}.jpg`;

// The component adapters are inert. This extra boundary fails on any leaked
// application/provider request, including image resources and Link prefetch.
async function containSupportFixture(page: Page) {
  const blocked: string[] = [];
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const base = new URL(test.info().project.use.baseURL as string);
    if (url.origin !== base.origin || url.pathname === "/admin" || url.pathname.startsWith("/admin/")
      || url.pathname.startsWith("/api/") || !["GET", "HEAD"].includes(request.method())) {
      blocked.push(`${request.method()} ${url.origin}${url.pathname}`);
      return route.abort("blockedbyclient");
    }
    return route.fallback();
  });
  return blocked;
}

async function expectContained(page: Page, blocked: string[]) {
  await expect(page.locator('a[href="/admin"], a[href^="/admin/"]')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  expect(blocked).toEqual([]);
}

async function submitInquiry(page: Page, scenario: "photos" | "upload-retry") {
  await page.goto(`${fixtureRoot}/intake?scenario=${scenario}`);
  await page.getByLabel("Name", { exact: true }).fill("Sample Customer");
  await page.getByLabel("Email", { exact: true }).fill("sample@example.test");
  await page.getByLabel("Subject", { exact: true }).fill("Product photo question");
  await page.getByLabel("Message", { exact: true }).fill("Please review the condition of my product.");
  await page.getByLabel("Photos (optional)").setInputFiles([
    { name: longFilename, mimeType: "image/jpeg", buffer: Buffer.from("inert synthetic photo bytes") },
    ...(scenario === "photos" ? [{ name: "unsupported-content.jpg", mimeType: "image/jpeg", buffer: Buffer.from("inert rejected photo bytes") }] : []),
  ]);
  const submit = page.getByRole("button", { name: "Submit inquiry", exact: true });
  await submit.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Inquiry received", exact: true })).toBeFocused();
  await expect(page.getByText(/Your message is saved for the Helix support team/)).toBeVisible();
}

for (const viewport of viewports) {
  test(`support intake keeps photo processing and rejection truthful at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const blocked = await containSupportFixture(page);
    await submitInquiry(page, "photos");
    await expect(page.getByText("Processing — not yet available to support", { exact: true })).toHaveCount(2);
    await expectContained(page, blocked);
    const check = page.getByRole("button", { name: "Check photo status", exact: true });
    await check.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText("Added privately for support", { exact: true })).toBeVisible();
    await expect(page.getByText("Not added — this photo could not be accepted", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Inquiry received", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Submit inquiry", exact: true })).toHaveCount(0);
    await expectContained(page, blocked);
  });

  test(`support upload failure supports a manual retry at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const blocked = await containSupportFixture(page);
    await submitInquiry(page, "upload-retry");
    await expect(page.getByText("Upload could not be confirmed", { exact: true })).toBeVisible();
    const retry = page.getByRole("button", { name: `Retry ${longFilename}`, exact: true });
    await retry.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText("Processing — not yet available to support", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Check photo status", exact: true }).click();
    await expect(page.getByText("Added privately for support", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Submit inquiry", exact: true })).toHaveCount(0);
    await expectContained(page, blocked);
  });

  test(`private photos and pending context remain bounded at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const blocked = await containSupportFixture(page);
    await page.goto(`${fixtureRoot}?scenario=photos`);
    await expect(page.getByRole("heading", { name: "Product photo question", exact: true, level: 1 })).toBeVisible();
    await expect(page.getByText("Photo 2: Processing", { exact: true })).toBeVisible();
    await expect(page.getByText("Photo 3: Not accepted", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Approve and queue reply", exact: true })).toBeDisabled();
    await expect(page.getByRole("img", { name: /^Customer attachment / })).toHaveCount(0);
    const open = page.getByRole("button", { name: "View private photo 1", exact: true });
    await open.focus();
    await page.keyboard.press("Enter");
    const photo = page.getByRole("img", { name: "Customer attachment 1", exact: true });
    await expect(photo).toBeVisible();
    await expect(photo).toHaveAttribute("src", /^blob:/);
    await expect.poll(() => photo.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
    await page.getByRole("button", { name: "Close photo 1", exact: true }).click();
    await expect(open).toBeFocused();
    await expect(photo).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Saved reply for approval" })).toContainText("Attachments: None. Customer photos stay private in the conversation.");

    if (viewport.width === 390) {
      const menu = page.getByRole("button", { name: "Menu", exact: true });
      await menu.click();
      const dialog = page.getByRole("dialog", { name: "Admin menu", exact: true });
      await expect(dialog).toBeVisible();
      await page.keyboard.press("Tab");
      expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(menu).toBeFocused();
    }
    await expectContained(page, blocked);
  });

  test(`new inbound context invalidates reply approval at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const blocked = await containSupportFixture(page);
    await page.goto(`${fixtureRoot}?scenario=new-context`);
    const approve = page.getByRole("button", { name: "Approve and queue reply", exact: true });
    await expect(approve).toBeEnabled();
    await approve.click();
    await expect(page.getByRole("alert")).toContainText("Review the latest conversation and save your draft again before approving.");
    await expect(page.getByText("The pump is damaged. Please consider this before replying.", { exact: true })).toBeVisible();
    await expect(approve).toBeDisabled();
    await page.getByLabel("Reply", { exact: true }).fill("Thank you. I have reviewed the additional pump damage details.");
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(approve).toBeEnabled();
    await approve.click();
    await expect(page.getByRole("status")).toContainText("Reply approved and queued. Delivery is shown separately");
    await expect(approve).toBeDisabled();
    await expectContained(page, blocked);
  });

  test(`generated support drafts preserve unsaved edits and require explicit approval at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const blocked = await containSupportFixture(page);
    await page.goto(`${fixtureRoot}?scenario=ai-draft`);
    const subject = page.getByLabel("Reply subject", { exact: true });
    const reply = page.getByLabel("Reply", { exact: true });
    const approve = page.getByRole("button", { name: "Approve and queue reply", exact: true });
    await subject.fill("My unsaved subject");
    await reply.fill("My unsaved reply before generation.");
    const generate = page.getByRole("button", { name: "Generate draft", exact: true });
    await generate.focus();
    await page.keyboard.press("Enter");
    await expect(reply).toBeEnabled();
    await reply.fill("My unsaved reply during generation.");
    await page.getByRole("button", { name: "Check draft status", exact: true }).click();
    await expect(page.getByRole("region", { name: "Draft assistance", exact: true })).toContainText("Additional human review is needed.");
    await expect(subject).toHaveValue("My unsaved subject");
    await expect(reply).toHaveValue("My unsaved reply during generation.");
    await expect(approve).toBeDisabled();
    const saved = page.getByRole("region", { name: "Saved reply for approval", exact: true });
    const generatedBody = "Thank you for your question. Please share which product you are asking about so we can review the details.";
    await expect(saved).toContainText(generatedBody);
    await expect(saved).toContainText("Helix does not provide medical advice.");
    await expect(saved).not.toContainText("Already approved.");
    await expectContained(page, blocked);
    const load = saved.getByRole("button", { name: "Load generated draft into editor", exact: true });
    await load.focus();
    await page.keyboard.press("Enter");
    await expect(reply).toHaveValue(generatedBody);
    await expect(approve).toBeEnabled();
    await approve.click();
    await expect(page.getByRole("status").filter({ hasText: "Reply approved and queued." })).toBeVisible();
    await expect(approve).toBeDisabled();
    await expectContained(page, blocked);
  });
}

test("support refresh failure keeps reply edits and permits manual recovery", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const blocked = await containSupportFixture(page);
  await page.goto(`${fixtureRoot}?scenario=refresh-error`);
  const reply = page.getByLabel("Reply", { exact: true });
  await reply.fill("My unsaved reply stays here.");
  const refresh = page.getByRole("button", { name: "Refresh inquiry", exact: true });
  await refresh.click();
  await expect(page.getByRole("alert")).toHaveText("The latest inquiry could not be loaded. Please try refreshing again.");
  await expect(reply).toHaveValue("My unsaved reply stays here.");
  await expect(page.getByRole("button", { name: "Approve and queue reply", exact: true })).toBeDisabled();
  await refresh.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toHaveText("Conversation refreshed. Your unsaved edits have been kept.");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(reply).toHaveValue("My unsaved reply stays here.");
  await expectContained(page, blocked);
});

test("explicit incoming review keeps the participant and renders hostile text inertly", async ({ page }) => {
  const blocked = await containSupportFixture(page);
  await page.goto(`${fixtureRoot}?scenario=quarantine`);
  const incoming = page.getByRole("region", { name: "Incoming email for review", exact: true });
  await expect(incoming).toContainText('<img src="https://unsafe.example/tracker">');
  await expect(incoming.locator("img")).toHaveCount(0);
  await expect(page.getByLabel("Recipient", { exact: true })).toHaveValue("sample@example.test");
  const reply = page.getByLabel("Reply", { exact: true });
  await reply.fill("My reviewed reply draft.");
  await incoming.getByRole("button", { name: "Add to this conversation", exact: true }).click();
  await expect(incoming).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("Incoming email added");
  await expect(reply).toHaveValue("My reviewed reply draft.");
  await expect(page.getByLabel("Recipient", { exact: true })).toHaveValue("sample@example.test");
  await expect(page.getByRole("button", { name: "Approve and queue reply", exact: true })).toBeDisabled();
  await expectContained(page, blocked);
});
