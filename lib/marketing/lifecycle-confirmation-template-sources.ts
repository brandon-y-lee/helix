/** Unpublished native draft sources only. No runtime contract references these.
 * A new published native version/fingerprint and explicit enrollment are required.
 * Existing welcome-v1 confirmations and frozen generations remain unchanged. */
const activity = 'Helix may use your signed-in product visits and cart activity for these reminders. You can unsubscribe at any time.';
const instructions = 'Opening this email or following the link does not confirm your subscription. Choose Confirm subscription on the page to finish.';
const ignored = 'If you did not request this, ignore this email. Ignoring this email does not grant these permissions or change an existing subscription. Existing email opt-outs still apply.';
const paragraph = (text: string) => `<p style="margin:0 0 20px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#353631">${text}</p>`;

function confirmation(subject: string, scope: string) {
  const html = `<!doctype html><html lang="en" dir="ltr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${subject}</title></head><body bgcolor="#ffffff" style="margin:0;background-color:#ffffff;color:#353631;font-family:Arial,Helvetica,sans-serif"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff"><tr><td align="center" bgcolor="#ffffff" style="padding:32px 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="max-width:600px"><tr><td align="center" style="padding:0 0 32px"><img src="{{{HELIX_SITE_ORIGIN}}}/brand/helix-wordmark-email.png" alt="helix" width="240" height="99" border="0" style="display:block;width:240px;max-width:100%;height:auto;color:#353631;font-family:Georgia,serif;font-size:32px"></td></tr><tr><td><h1 style="margin:0 0 24px;font-family:Georgia,serif;font-size:32px;line-height:1.2;font-weight:400;color:#353631">Confirm your subscription</h1>${paragraph(scope)}${paragraph(activity)}${paragraph(instructions)}<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0"><tr><td align="center" bgcolor="#ffffff" style="border:1px solid #73746d;border-radius:99px"><a href="{{{HELIX_CONFIRM_URL}}}" style="display:inline-block;padding:16px 24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.4;color:#353631;text-decoration:none">CONFIRM EMAIL SUBSCRIPTION</a></td></tr></table>${paragraph(ignored)}<p style="margin:32px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#62635e">helix<br>{{{HELIX_POSTAL_ADDRESS}}}</p></td></tr></table></td></tr></table></body></html>`;
  return { subject, html, text: `helix\nConfirm your subscription\n\n${scope}\n${activity}\n\n${instructions}\nConfirm email subscription: {{{HELIX_CONFIRM_URL}}}\n\n${ignored}\n\nhelix\n{{{HELIX_POSTAL_ADDRESS}}}` };
}

export const lifecycleConfirmationTemplateSources = {
  lifecycle_v1: confirmation('Confirm your helix emails',
    'Confirm that you want helix welcome offers, cart and product reminders, and skincare education emails.'),
  lifecycle_v2: confirmation('Confirm your helix follow-up emails',
    'Confirm that you want helix welcome offers, cart and product reminders, skincare education, post-purchase follow-ups, review invitations and next-purchase offers.'),
} as const;
