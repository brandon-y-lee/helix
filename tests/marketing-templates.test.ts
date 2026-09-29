import { expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { renderMarketingMessage, marketingTemplateFingerprint } from "@/lib/marketing/templates";
import type { MarketingReceipt } from "@/lib/marketing/contract";

const id = "93a3ecbc-2a25-48a7-8fe9-5a7bd40f2e34";
const version = "13a3ecbc-2a25-48a7-8fe9-5a7bd40f2e34";
const native = { id, current_version_id: version, status: "published", has_unpublished_versions: false,
  from: null, reply_to: null, subject: "Welcome to helix",
  html: '<html lang="en"><body><h1>Welcome</h1><a href="{{{HELIX_PREFERENCES_URL}}}">Unsubscribe</a><p>{{{HELIX_POSTAL_ADDRESS}}}</p></body></html>',
  text: 'Welcome\nUnsubscribe: {{{HELIX_PREFERENCES_URL}}}\n{{{HELIX_POSTAL_ADDRESS}}}' };
const hash = createHash("sha256").update(JSON.stringify({ id, version, subject: native.subject, html: native.html,
  text: native.text, from: null, replyTo: null })).digest("hex");
const receipt: MarketingReceipt = { schemaVersion: 1, subscriberId: "513b8721-ce66-4b3e-a44b-1c8881b556dc", generation: 1, revision: 2,
  preferenceToken: "P".repeat(43), templateContract: { version: "welcome_v1", siteOrigin: "https://helixskin.vercel.app",
    from: "Helix <onboarding@resend.dev>", replyTo: "support@example.test", postalAddress: "Synthetic business mailing address",
    topicId: "61296d74-fad4-4c74-83d3-6a3e17ab9f74", templates: { marketing_confirmation: { id, sha256: hash },
      welcome_initial: { id, sha256: hash }, welcome_education: { id, sha256: hash } } } };
it("renders an exact reviewed native version into a complete immutable welcome envelope", async () => {
  const read = vi.fn().mockResolvedValue(native);
  const rendered = await renderMarketingMessage("welcome_initial", receipt, "re_synthetic", read);
  expect(read).toHaveBeenCalledWith(id, "re_synthetic");
  expect(rendered.subject).toBe("Welcome to helix");
  expect(rendered.html).toContain('href="https://helixskin.vercel.app/email-preferences?unsubscribe=' + "P".repeat(43));
  expect(rendered.text).toContain("Synthetic business mailing address");
  expect(rendered.headers).toEqual({
    "List-Unsubscribe": '<https://helixskin.vercel.app/api/marketing/unsubscribe?token=' + "P".repeat(43) + '>',
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  });
  expect(rendered.topic_id).toBe(receipt.templateContract.topicId);
  expect(rendered).not.toHaveProperty("template");
});
it.each([
  { ...native, html: native.html.replace("Welcome", "Unexpected campaign") },
  { ...native, status: "draft" },
  { ...native, has_unpublished_versions: true },
  { ...native, current_version_id: "23a3ecbc-2a25-48a7-8fe9-5a7bd40f2e34" },
])("rejects drift from the exact native version approved for this subscription generation", async (changed) => {
  await expect(renderMarketingMessage("welcome_initial", receipt, "re_synthetic", async () => changed)).rejects.toThrow("operator attention");
});
it("cannot reuse a promotional template for address confirmation", async () => {
  await expect(renderMarketingMessage("marketing_confirmation", { ...receipt, confirmationToken: "C".repeat(43) }, "re_synthetic", async () => native)).rejects.toThrow();
});
it("escapes configured mailing identity in HTML without losing its plain-text form", async () => {
  const rendered = await renderMarketingMessage("welcome_initial", { ...receipt,
    templateContract: { ...receipt.templateContract, postalAddress: "Synthetic A & B address" } }, "re_synthetic", async () => native);
  expect(rendered.html).toContain("Synthetic A &amp; B address");
  expect(rendered.text).toContain("Synthetic A & B address");
});

it("requires actual link and mailing-address variables rather than lookalike literal text", async () => {
  const changed = { ...native, html: "HELIX_PREFERENCES_URL HELIX_POSTAL_ADDRESS", text: "HELIX_PREFERENCES_URL HELIX_POSTAL_ADDRESS" };
  const updated = { ...receipt, templateContract: { ...receipt.templateContract, templates: { ...receipt.templateContract.templates,
    welcome_initial: { id, sha256: marketingTemplateFingerprint(changed) } } } };
  await expect(renderMarketingMessage("welcome_initial", updated, "re_synthetic", async () => changed)).rejects.toThrow();
});
