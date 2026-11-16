import { expect, it } from 'vitest';
import { lifecycleConfirmationTemplateSources } from '@/lib/marketing/lifecycle-confirmation-template-sources';
import { marketingTemplateFingerprint, renderMarketingMessage } from '@/lib/marketing/templates';
import type { MarketingReceipt, MarketingTemplateContract } from '@/lib/marketing/contract';

const id = 'eeeeeeee-0000-4000-8000-000000000001';
for (const version of ['lifecycle_v1', 'lifecycle_v2'] as const) {
  function fixture() {
    const native = { id, current_version_id: id, status: 'published', has_unpublished_versions: false,
      from: null, reply_to: null, ...lifecycleConfirmationTemplateSources[version] };
    const entry = { id, sha256: marketingTemplateFingerprint(native) };
    const contract: MarketingTemplateContract = { version, siteOrigin: 'https://helixskin.us',
      from: 'helix <hello@example.test>', replyTo: 'support@example.test', postalAddress: '100 Test & Example', topicId: id,
      templates: { marketing_confirmation: entry, welcome_initial: entry, welcome_education: entry,
        lifecycle_welcome: entry, lifecycle_cart: entry, lifecycle_browse: entry,
        ...(version === 'lifecycle_v2' ? { lifecycle_review_winback: entry } : {}) } };
    const receipt: MarketingReceipt = { schemaVersion: 1, subscriberId: id, generation: 1, revision: 1,
      confirmationToken: 'C'.repeat(43), templateContract: contract };
    return { native, receipt };
  }

  it(`renders ${version} confirmation with the actual scoped link and no marketing handoff headers`, async () => {
    const { native, receipt } = fixture();
    const scope = version === 'lifecycle_v2' ? 'lifecycle_reviews' : 'lifecycle';
    const url = `https://helixskin.us/email-preferences?confirm=${'C'.repeat(43)}&scope=${scope}`;
    const message = await renderMarketingMessage('marketing_confirmation', receipt, 're_synthetic', async () => native);
    expect(message.text).toContain(url);
    expect(message.html).toContain(url.replace('&', '&amp;'));
    expect(message.html).toContain('100 Test &amp; Example');
    expect(message.html).toContain('https://helixskin.us/brand/helix-wordmark-email.png');
    expect(message.html).toContain('bgcolor="#ffffff"');
    expect(message.html + message.text).not.toMatch(/\{\{|\}\}|HELIX_PREFERENCES_URL/);
    expect(message.topic_id).toBeUndefined();
    expect(message.headers).toBeUndefined();
    expect(message.text).toContain('signed-in product visits and cart activity');
    expect(message.text).toContain('Opening this email or following the link does not confirm your subscription.');
    expect(message.text).toContain('Ignoring this email does not grant these permissions or change an existing subscription.');
    expect(message.text).toContain('Existing email opt-outs still apply.');
    expect(message.text.includes('review invitations and next-purchase offers')).toBe(version === 'lifecycle_v2');
    expect(message.text).not.toMatch(/15%|10%|discount code/);
  });

  it(`rejects drifted ${version} publication and a matching fingerprint without its required confirmation link`, async () => {
    const { native, receipt } = fixture();
    await expect(renderMarketingMessage('marketing_confirmation', receipt, 're_synthetic', async () => ({ ...native, text: `${native.text}\nChanged` }))).rejects.toThrow();
    const missingLink = { ...native, text: native.text.replaceAll('{{{HELIX_CONFIRM_URL}}}', 'omitted') };
    receipt.templateContract.templates.marketing_confirmation = { id, sha256: marketingTemplateFingerprint(missingLink) };
    await expect(renderMarketingMessage('marketing_confirmation', receipt, 're_synthetic', async () => missingLink)).rejects.toThrow();
  });
}
