// These are Supabase Go templates, not Resend templates: Supabase owns the token.
export function buildAuthEmailTemplates(siteOrigin: string) {
  const url = new URL(siteOrigin);
  if (url.protocol !== "https:" || url.origin !== siteOrigin || url.username || url.password || !/^[a-z0-9.-]+$/i.test(url.hostname)) {
    throw new Error("Account email requires a controlled HTTPS origin.");
  }
  const template = (title: string, copy: string, action: string, type: string) => `<!doctype html>
<html lang="en" dir="ltr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title></head>
<body style="margin:0;background:#f5f5f7;color:#111312;font:16px/1.6 Manrope,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff"><tr><td style="padding:32px 24px">
<p style="font:28px Marcellus,Georgia,serif;margin:0 0 28px">helix</p>
<h1 style="font:28px/1.3 Marcellus,Georgia,serif">${title}</h1><p>${copy}</p>
<p><a style="display:inline-block;padding:12px 20px;background:#28362f;color:#ffffff;text-decoration:underline" href="${siteOrigin}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=${type}">${action}</a></p>
<p>You will confirm this action on the next page. This link can be used once and will expire.</p>
<p>If you did not request this, you can ignore this email.</p>
</td></tr></table></td></tr></table></body></html>`;
  return {
    mailer_subjects_confirmation: "Confirm your helix email address",
    mailer_templates_confirmation_content: template("Confirm your email address", "Confirm this email address to finish creating your helix account.", "Continue to confirmation", "email"),
    mailer_subjects_recovery: "Reset your helix password",
    mailer_templates_recovery_content: template("Reset your password", "Continue to choose a new password for your helix account.", "Continue to password reset", "recovery"),
    mailer_subjects_email_change: "Confirm your helix email change",
    mailer_templates_email_change_content: template("Confirm your email change", "Confirm the requested change to your helix account email address. You may need to confirm from both your current and new email addresses.", "Continue to confirmation", "email_change"),
  };
}
