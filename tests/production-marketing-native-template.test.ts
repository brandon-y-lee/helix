import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { productionMarketingTemplateHash } from "@/lib/production-marketing/templates";
import { nativeWelcomeTemplate } from "@/lib/production-marketing/template-content";

it("preserves the frozen legacy contract and publishes only provider-owned preferences in the native welcome", () => {
  expect(productionMarketingTemplateHash).toBe("71b1ad6fb7f22589b89a70cb4a2e88eb8356079f376e48f868e09b4d16aa73b1");
  const { content, contentSha256 } = nativeWelcomeTemplate();
  expect(content.subject).toBe("Welcome to Helix");
  for (const body of [content.html, content.text]) {
    expect(body).toContain("2747 Haste Street, Berkeley, CA 94704");
    expect(body).toContain("{{{RESEND_UNSUBSCRIBE_URL}}}");
    expect(body).not.toMatch(/#token=|unsubscribe\?token=|attempt_id|confirmationToken|preferenceToken/);
  }
  expect(content.html).toContain('href="{{{RESEND_UNSUBSCRIBE_URL}}}"');
  expect(contentSha256).toBe(createHash("sha256").update(JSON.stringify(content)).digest("hex"));
});
