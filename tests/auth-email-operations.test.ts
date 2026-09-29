import { describe, expect, it, vi } from "vitest";
import { runAuthEmailCommand } from "@/scripts/auth-email/operations";

const env = {
  NEXT_PUBLIC_SUPABASE_URL: "https://erasogmsqpgiirovubjh.supabase.co",
  HELIX_EMAIL_ENVIRONMENT: "sandbox", HELIX_EMAIL_MODE: "restricted",
  HELIX_EMAIL_SITE_ORIGIN: "https://helixskin.vercel.app",
  HELIX_EMAIL_AUTH_FROM: "onboarding@resend.dev",
  HELIX_EMAIL_OWNER_RECIPIENT: "owner@example.test", HELIX_EMAIL_ALLOW_SIMULATORS: "true",
};
const templates = () => ({
  mailer_templates_confirmation_content: "<p>Confirm your email</p>", mailer_subjects_confirmation: "Confirm your Helix email",
  mailer_templates_recovery_content: "<p>Reset your password</p>", mailer_subjects_recovery: "Reset your Helix password",
  mailer_templates_email_change_content: "<p>Confirm your new email</p>", mailer_subjects_email_change: "Confirm your Helix email change",
});
const currentConfig = () => ({
  ...templates(), site_url: env.HELIX_EMAIL_SITE_ORIGIN, smtp_host: "smtp.resend.com", smtp_port: "465",
  smtp_user: "resend", smtp_admin_email: "onboarding@resend.dev", smtp_sender_name: "Helix",
  external_email_enabled: true, mailer_autoconfirm: false, mailer_secure_email_change_enabled: true,
  hook_send_email_enabled: false, mailer_otp_exp: 3600, smtp_max_frequency: 60, rate_limit_email_sent: 30,
  smtp_pass: "re_secret_password", hook_send_email_secrets: "hook_secret", unknown_provider_field: "private value",
});

describe("Auth email operational boundary", () => {
  it("plans the restricted SMTP/templates without provider credentials or network calls", async () => {
    const fetcher = vi.fn();
    const result = await runAuthEmailCommand(["plan"], env, templates, fetcher);
    expect(fetcher).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      command: "plan", project: "erasogmsqpgiirovubjh", activationReady: false,
      target: { smtp_host: "smtp.resend.com", smtp_port: "465", smtp_user: "resend", smtp_admin_email: "onboarding@resend.dev" },
    });
    expect(Object.keys(result.templateHashes)).toEqual(expect.arrayContaining([
      "mailer_templates_confirmation_content", "mailer_templates_recovery_content", "mailer_templates_email_change_content",
    ]));
    expect(result.operationalProofRequired).toContain("provider_recipient_restriction");
    expect(JSON.stringify(result)).not.toContain(env.HELIX_EMAIL_OWNER_RECIPIENT);
  });

  it("verifies with one fixed-origin GET and reports configuration separately from activation evidence", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(currentConfig())));
    const result = await runAuthEmailCommand(["verify"], { ...env, SUPABASE_ACCESS_TOKEN: "private-management-token" }, templates, fetcher);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledWith("https://api.supabase.com/v1/projects/erasogmsqpgiirovubjh/config/auth", expect.objectContaining({
      method: "GET", redirect: "error", cache: "no-store", headers: { Authorization: "Bearer private-management-token" },
    }));
    expect(result).toMatchObject({ command: "verify", activationReady: false, configurationMatches: true, changedFields: [], findings: [] });
    expect(result.operationalProofRequired).toEqual(expect.arrayContaining([
      "provider_recipient_restriction", "auth_link_tracking_disabled", "secure_email_change_recipient_restriction", "recoverable_prior_smtp_credentials",
    ]));
    expect(JSON.stringify(result)).not.toMatch(/re_secret_password|hook_secret|private-management-token|private value|owner@example/);
  });

  it("flags conflicting delivery hooks and weakened Auth settings without proposing to change them", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ...currentConfig(), hook_send_email_enabled: true, external_email_enabled: false,
      mailer_autoconfirm: true, mailer_secure_email_change_enabled: false,
    })));
    const result = await runAuthEmailCommand(["verify"], { ...env, SUPABASE_ACCESS_TOKEN: "private" }, templates, fetcher);
    expect(result.configurationMatches).toBe(false);
    expect(result.findings).toEqual(expect.arrayContaining([
      "conflicting_send_email_hook", "email_auth_not_enabled", "email_confirmation_not_enabled", "secure_email_change_not_enabled",
    ]));
    expect(result.target).not.toHaveProperty("hook_send_email_enabled");
    expect(result.target).not.toHaveProperty("mailer_autoconfirm");
    expect(fetcher.mock.calls.every(([, request]) => request.method === "GET")).toBe(true);
  });

  it("rejects drift in preserved expiry settings before later activation can reuse an old observation", async () => {
    const fetcher = vi.fn().mockImplementation(async () => new Response(JSON.stringify(currentConfig())));
    const credentials = { ...env, SUPABASE_ACCESS_TOKEN: "private" };
    const baseline = await runAuthEmailCommand(["verify"], credentials, templates, fetcher);
    expect(baseline.observedFingerprint).toMatch(/^[a-f0-9]{64}$/);
    const args = ["verify", "--expected-fingerprint", baseline.observedFingerprint!];
    expect(await runAuthEmailCommand(args, credentials, templates, fetcher)).toMatchObject({ configurationMatches: true });
    fetcher.mockImplementation(async () => new Response(JSON.stringify({ ...currentConfig(), mailer_otp_exp: 7200 })));
    await expect(runAuthEmailCommand(args, credentials, templates, fetcher)).rejects.toThrow("changed");
    expect(fetcher.mock.calls.every(([, request]) => request.method === "GET")).toBe(true);
  });

  it.each([
    { NEXT_PUBLIC_SUPABASE_URL: "https://another-project.supabase.co" },
    { HELIX_EMAIL_ENVIRONMENT: "production" },
    { HELIX_EMAIL_MODE: "unrestricted" },
    { HELIX_EMAIL_AUTH_FROM: "owner@example.test" },
    { HELIX_EMAIL_OWNER_RECIPIENT: "not-an-email" },
    { HELIX_EMAIL_SITE_ORIGIN: "https://helixskin.vercel.app/extra" },
    { HELIX_EMAIL_SITE_ORIGIN: "https://name:password@helixskin.vercel.app" },
    { HELIX_EMAIL_ALLOW_SIMULATORS: "yes" },
  ])("rejects unsupported project or recipient configuration before network access: %j", async (override) => {
    const fetcher = vi.fn();
    await expect(runAuthEmailCommand(["verify"], { ...env, ...override, SUPABASE_ACCESS_TOKEN: "private" }, templates, fetcher)).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([["apply"], ["rollback"], ["verify", "--apply"], ["verify", "--expected-fingerprint", "invalid"], ["plan", "--recipient", "another@example.test"]])(
    "has no mutation or recipient override command: %j", async (...args) => {
      const fetcher = vi.fn();
      await expect(runAuthEmailCommand(args, env, templates, fetcher)).rejects.toThrow();
      expect(fetcher).not.toHaveBeenCalled();
    }
  );

  it("does not infer a credential or hook status from missing settings", async () => {
    const fetcher = vi.fn();
    await expect(runAuthEmailCommand(["verify"], env, templates, fetcher)).rejects.toThrow("credential");
    expect(fetcher).not.toHaveBeenCalled();
    fetcher.mockResolvedValue(new Response("{}"));
    const result = await runAuthEmailCommand(["verify"], { ...env, SUPABASE_ACCESS_TOKEN: "private" }, templates, fetcher);
    expect(result.configurationMatches).toBe(false);
    expect(result.findings).toContain("send_email_hook_unverified");
    expect(result.changedFields).toContain("smtp_host");
  });

  it.each(["http", "parse", "network"])("redacts provider failure details for %s failures", async (kind) => {
    const secret = "token-private-address@example.test";
    const fetcher = vi.fn().mockImplementation(async () => {
      if (kind === "network") throw new Error(secret);
      return new Response(secret, { status: kind === "http" ? 503 : 200 });
    });
    await expect(runAuthEmailCommand(["verify"], { ...env, SUPABASE_ACCESS_TOKEN: "private" }, templates, fetcher)).rejects.toThrow(
      "Auth configuration is unavailable; no provider details were retained."
    );
  });

  it("keeps secret changes outside the public drift fingerprint and still requires private rollback evidence", async () => {
    const fetcher = vi.fn().mockImplementation(async () => new Response(JSON.stringify(currentConfig())));
    const credentials = { ...env, SUPABASE_ACCESS_TOKEN: "private" };
    const baseline = await runAuthEmailCommand(["verify"], credentials, templates, fetcher);
    fetcher.mockImplementation(async () => new Response(JSON.stringify({ ...currentConfig(), smtp_pass: "rotated-secret", hook_send_email_secrets: "rotated-hook" })));
    const next = await runAuthEmailCommand(["verify"], credentials, templates, fetcher);
    expect(next.observedFingerprint).toBe(baseline.observedFingerprint);
    expect(next.operationalProofRequired).toContain("recoverable_prior_smtp_credentials");
    expect(next.activationReady).toBe(false);
  });
});
