import {expect,it} from 'vitest';
import {lifecycleTemplateSources} from '@/lib/marketing/lifecycle-template-sources';
import {marketingTemplateFingerprint,renderMarketingMessage} from '@/lib/marketing/templates';
import {MARKETING_PURPOSES} from '@/lib/marketing/contract';
const id='eeeeeeee-0000-4000-8000-000000000001';
async function render(expires:string, mode:'new'|'legacy'|'mixed'|'missing'='new'){
 const source={...lifecycleTemplateSources.lifecycle_welcome};
 if(mode==='legacy')for(const key of ['html','text'] as const)source[key]=source[key].replaceAll('HELIX_OFFER_EXPIRES_LABEL','HELIX_OFFER_EXPIRES_AT');
 if(mode==='mixed')source.text=source.text.replaceAll('HELIX_OFFER_EXPIRES_LABEL','HELIX_OFFER_EXPIRES_AT');
 if(mode==='missing')source.text=source.text.replaceAll('{{{HELIX_OFFER_EXPIRES_LABEL}}}','');
 const native={id,current_version_id:id,status:'published',has_unpublished_versions:false,from:null,reply_to:null,...source};
 const entry={id,sha256:marketingTemplateFingerprint(native)};
 return renderMarketingMessage('lifecycle_welcome',{schemaVersion:1,subscriberId:id,generation:1,revision:1,preferenceToken:'P'.repeat(43),templateContract:{version:'lifecycle_v2',siteOrigin:'https://example.test',from:'Helix <preview@example.test>',replyTo:'preview@example.test',postalAddress:'Synthetic address',topicId:id,templates:Object.fromEntries(MARKETING_PURPOSES.map(p=>[p,entry]))},lifecycle:{kind:'welcome',sourceKey:'synthetic',dueAt:'2026-01-01T00:00:00Z',offerId:id,offerExpiresAt:expires,productSlug:null,productName:null}},'unused',async()=>native);
}
it('renders the exact deadline in readable Pacific time, including rollover and seasonal timezone',async()=>{
 for(const [instant,label] of [['2026-12-15T00:00:00Z','December 14, 2026 at 4:00 PM Pacific Standard Time'],['2026-07-15T00:00:00Z','July 14, 2026 at 5:00 PM Pacific Daylight Time'],['2026-12-15T00:00:12.123Z','December 14, 2026 at 4:00:12.123 PM Pacific Standard Time']]){
  const result=await render(instant);expect(result.text).toContain(label);expect(result.html).toContain(label);expect(result.text).not.toContain(instant);
 }
});
it('preserves legacy ISO expiry and terms',async()=>{
 const result=await render('2026-12-15T00:00:00Z','legacy');
 expect(result.text).toContain('Expires 2026-12-15T00:00:00.000Z. First purchase only.');
 expect(result.text).not.toContain('Pacific');
});
it('rejects mismatched or missing expiry presentation',async()=>{
 for(const mode of ['mixed','missing'] as const)await expect(render('2026-12-15T00:00:00Z',mode)).rejects.toThrow();
});
