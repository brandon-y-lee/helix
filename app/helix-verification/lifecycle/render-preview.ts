import 'server-only';
import { lifecycleTemplateSources } from '@/lib/marketing/lifecycle-template-sources';
import { marketingTemplateFingerprint, renderMarketingMessage } from '@/lib/marketing/templates';
import { MARKETING_PURPOSES, type LifecyclePurpose } from '@/lib/marketing/contract';

/** Actual renderer, synthetic immutable receipts/native source, no provider I/O. */
export async function renderLifecyclePreviews() {
 const id='eeeeeeee-0000-4000-8000-000000000001';
 return Promise.all(Object.entries(lifecycleTemplateSources).map(async([purpose,source])=>{
  const native={id,current_version_id:id,status:'published',has_unpublished_versions:false,from:null,reply_to:null,...source};
  const entry={id,sha256:marketingTemplateFingerprint(native)};
  const kind=purpose.replace('lifecycle_','');
  const message=await renderMarketingMessage(purpose as LifecyclePurpose,{
   schemaVersion:1,subscriberId:id,generation:1,revision:1,preferenceToken:'P'.repeat(43),
   templateContract:{version:'lifecycle_v2',siteOrigin:'https://preview.example.test',from:'Helix <preview@example.test>',replyTo:'preview@example.test',postalAddress:'Synthetic preview address — not a mailing address',topicId:id,templates:Object.fromEntries(MARKETING_PURPOSES.map(p=>[p,entry]))},
   lifecycle:{kind,sourceKey:'synthetic-preview',dueAt:'2026-12-01T00:00:00Z',offerId:kind==='browse'?null:id,offerExpiresAt:kind==='browse'?null:'2026-12-15T00:00:00Z',productSlug:'super-serum',productName:'Super Serum'},
  },'synthetic-unused',async()=>native);
  // Map only these public brand assets to the local preview server. Navigation stays inert.
  const previewHtml=message.html
   .replaceAll('https://preview.example.test/brand/helix-wordmark-email.png','/brand/helix-wordmark-email.png')
   .replaceAll('https://preview.example.test/fonts/marcellus-latin.woff2','/fonts/marcellus-latin.woff2');
  // Neutralize only preview navigation; production source and renderer stay intact.
  return {purpose,subject:message.subject,text:message.text.replace(/https:\/\/preview\.example\.test\/\S+/g,'[non-operative preview link]'),html:previewHtml.replace(/href="[^"]*"/g,'aria-disabled="true" role="link" tabindex="-1"')};
 }));
}
