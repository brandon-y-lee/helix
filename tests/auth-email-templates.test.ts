import { describe, expect, it } from "vitest";
import { buildAuthEmailTemplates } from "@/lib/email/auth-templates";

describe("Supabase-owned account email templates", () => {
  it("provides accessible branded verification and recovery links using only provider tokens", () => {
    const templates = buildAuthEmailTemplates("https://helixskin.vercel.app");
    expect(templates.mailer_subjects_confirmation).toBe("Confirm your helix email address");
    expect(templates.mailer_templates_confirmation_content).toContain('https://helixskin.vercel.app/auth/confirm?token_hash={{ .TokenHash }}&amp;type=email');
    expect(templates.mailer_templates_recovery_content).toContain('&amp;type=recovery');
    expect(templates.mailer_templates_email_change_content).toContain('&amp;type=email_change');
    for (const [key, html] of Object.entries(templates)) {
      if (!key.endsWith("_content")) continue;
      expect(html).toContain('<html lang="en"');
      expect(html).toContain('<h1');
      expect(html).not.toMatch(/<script|<img|\.Data|\.Email|unsubscribe|discount/i);
    }
  });
  it("switches the reviewed domain without deriving an email identity or accepting URL injection", () => {
    expect(buildAuthEmailTemplates("https://accounts.example.test").mailer_templates_recovery_content).toContain("https://accounts.example.test/auth/confirm");
    for (const origin of ["http://example.test", "https://example.test/path", "https://user:pass@example.test", "https://example.test?bad=1", 'https://foo"bar.test', "https://foo&apos;bar.test"]) {
      expect(() => buildAuthEmailTemplates(origin)).toThrow();
    }
  });
});
