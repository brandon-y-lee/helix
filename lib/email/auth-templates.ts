import { emailDesign, emailStyle } from "@/lib/email/design";
// These are Supabase Go templates, not Resend templates: Supabase owns the token.
export function buildAuthEmailTemplates(siteOrigin: string) {
  const url = new URL(siteOrigin);
  if (url.protocol !== "https:" || url.origin !== siteOrigin || url.username || url.password || !/^[a-z0-9.-]+$/i.test(url.hostname)) {
    throw new Error("Account email requires a controlled HTTPS origin.");
  }
  const template = (title: string, copy: string, action: string, type: string) => `<!doctype html>
<html lang="en" dir="ltr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="${emailDesign.colorScheme}"><meta name="supported-color-schemes" content="light"><title>${title}</title></head>
<body bgcolor="${emailDesign.canvas}" style="${emailStyle(emailDesign.body)}">
<div lang="en" dir="ltr" aria-hidden="true" style="${emailStyle(emailDesign.preheader)}">${copy}</div>
<table lang="en" dir="ltr" role="presentation" bgcolor="${emailDesign.canvas}" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="${emailStyle(emailDesign.outerCell)}">
<table role="presentation" bgcolor="${emailDesign.canvas}" width="100%" cellpadding="0" cellspacing="0" style="${emailStyle(emailDesign.container)}"><tr><td style="${emailStyle(emailDesign.content)}">
<p style="${emailStyle(emailDesign.wordmark)}"><img src="${siteOrigin}${emailDesign.wordmarkPath}" alt="helix" width="${emailDesign.wordmarkWidth}" height="${emailDesign.wordmarkHeight}" style="${emailStyle(emailDesign.wordmarkImage)}"></p>
<p style="${emailStyle(emailDesign.eyebrow)}">YOUR ACCOUNT</p>
<h1 style="${emailStyle(emailDesign.heading)}">${title}</h1><p style="${emailStyle(emailDesign.paragraph)}">${copy}</p>
<p style="${emailStyle(emailDesign.action)}"><a style="${emailStyle(emailDesign.button)}" href="${siteOrigin}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=${type}">${action}</a></p>
<p style="${emailStyle(emailDesign.paragraph)}">You will confirm this action on the next page. This link can be used once and will expire.</p>
<p style="${emailStyle(emailDesign.footer)}">If you did not request this, you can ignore this email.</p>
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
