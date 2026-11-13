import {expect,it} from 'vitest';
import { lifecycleTemplateSources } from '@/lib/marketing/lifecycle-template-sources';
import {marketingTemplateFingerprint,renderMarketingMessage} from '@/lib/marketing/templates';
import type {MarketingReceipt,LifecyclePurpose} from '@/lib/marketing/contract';
const id='eeeeeeee-0000-4000-8000-000000000001';
for(const kind of ['welcome','cart','browse'] as const){
 it(`renders approved ${kind} terms and denies missing mandatory variables`,async()=>{
 const purpose=`lifecycle_${kind}` as LifecyclePurpose;
 const native={id,current_version_id:id,status:'published',has_unpublished_versions:false,from:null,reply_to:null,...lifecycleTemplateSources[purpose]};
 const entry={id,sha256:marketingTemplateFingerprint(native)};
 const receipt:MarketingReceipt={schemaVersion:1,subscriberId:id,generation:1,revision:1,preferenceToken:'P'.repeat(43),
 templateContract:{version:'lifecycle_v1',siteOrigin:'https://helixskin.vercel.app',from:'Helix <onboarding@resend.dev>',replyTo:'support@example.test',postalAddress:'Synthetic address',topicId:id,
 templates:{marketing_confirmation:entry,welcome_initial:entry,welcome_education:entry,lifecycle_welcome:entry,lifecycle_cart:entry,lifecycle_browse:entry}},
 lifecycle:{kind,sourceKey:'synthetic',dueAt:'2026-11-13T00:00:00Z',offerId:kind==='browse'?null:id,offerExpiresAt:kind==='browse'?null:'2026-11-27T00:00:00Z',productSlug:'serum',productName:'Super <Serum>'}};
 const message=await renderMarketingMessage(purpose,receipt,'re_test',async()=>native);
 expect(message.headers?.['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
 if(kind==='browse'){expect(message.text).not.toMatch(/discount|%|offer|scarcity|last chance/i);expect(message.html).toContain('Super &lt;Serum&gt;');}
 else{expect(message.text).toContain(kind==='welcome'?'15%':'10%');expect(message.text).toContain('verified account');expect(message.text).toContain('One use, no stacking');expect(message.text).toContain('Excludes shipping and tax');}
 const bad={...native,text:native.text.replace(/\{\{\{HELIX_(OFFER_TERMS|PRODUCT_URL)\}\}\}/g,'omitted')};
 receipt.templateContract.templates[purpose]={id,sha256:marketingTemplateFingerprint(bad)};
 await expect(renderMarketingMessage(purpose,receipt,'re_test',async()=>bad)).rejects.toThrow();
 });
}
