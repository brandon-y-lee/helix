import 'server-only';
import {createHash} from 'node:crypto';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { grantLifecycleOffer,readLifecycleOfferForDelivery,verifyConfiguredOfferCoupon } from '@/lib/offers/server';
import { readMarketingTemplateContract,LIFECYCLE_PURPOSES,UUID } from './contract';
import { readEmailConfig } from '@/lib/email/config';
import { renderMarketingMessage } from './templates';
import type { CampaignCandidate,CampaignDependencies } from './campaigns';
async function rpc(name:string,args:Record<string,unknown>={}){
 const {data,error}=await createSupabaseAdminClient().rpc(name,args).abortSignal(AbortSignal.timeout(3000));
 if(error) throw new Error('Lifecycle service unavailable.');return data;
}
export function lifecycleCampaignDependencies():CampaignDependencies{return {
 env:process.env,grant:grantLifecycleOffer,offer:readLifecycleOfferForDelivery,
 async list(){const data=await rpc('list_lifecycle_campaigns',{p_limit:1});
 if(!Array.isArray(data)||data.length>1||data.some(c=>!c||!UUID.test(c.subscriberId)||!['welcome','cart','browse'].includes(c.kind)||typeof c.email!=='string'||typeof c.sourceKey!=='string'||c.sourceKey.length>300))throw new Error('Invalid campaign work.');return data as CampaignCandidate[];},
 async admit(c,id){return await rpc('admit_lifecycle_campaign',{p_subscriber_id:c.subscriberId,p_kind:c.kind,p_source_key:c.sourceKey,p_offer_id:id})===true;},
 cleanup(){return rpc('cleanup_lifecycle_activity',{p_limit:100});}
};}
async function checkLifecyclePopupReady():Promise<boolean>{
 try{
   if(process.env.HELIX_LIFECYCLE_ENABLED!=='true'||process.env.HELIX_LIFECYCLE_CAMPAIGNS_ENABLED!=='true'||process.env.HELIX_MARKETING_ENABLED!=='true') return false;
   const config=readEmailConfig(process.env),contract=readMarketingTemplateContract(process.env,'lifecycle');
   if(LIFECYCLE_PURPOSES.some(p=>!contract.templates[p])||await rpc('lifecycle_campaign_readiness')!==true) return false;
   await verifyConfiguredOfferCoupon('welcome');
   // Approval must refer to an actually published, unchanged native template.
   const receipt={schemaVersion:1 as const,subscriberId:'eeeeeeee-0000-4000-8000-000000000001',generation:1,revision:1,
     confirmationToken:'C'.repeat(43),preferenceToken:'P'.repeat(43),templateContract:contract};
   await renderMarketingMessage('marketing_confirmation',receipt,config.apiKey);
   await renderMarketingMessage('lifecycle_welcome',{...receipt,lifecycle:{kind:'welcome',sourceKey:'readiness',dueAt:new Date().toISOString(),
     offerId:'eeeeeeee-0000-4000-8000-000000000002',offerExpiresAt:new Date(Date.now()+14*86400000).toISOString(),productSlug:null,productName:null}},config.apiKey);
   return true;
 }catch{return false;}
}

// Public readiness is shared, non-personal and bounded per server instance. Coalesce
// concurrent visitors; cache failures too, so outages cannot amplify provider reads.
let readinessCache:{key:string;expires:number;promise:Promise<boolean>}|undefined;
export async function lifecyclePopupReady():Promise<boolean>{
 if(process.env.HELIX_LIFECYCLE_ENABLED!=='true'||process.env.HELIX_LIFECYCLE_CAMPAIGNS_ENABLED!=='true'||process.env.HELIX_MARKETING_ENABLED!=='true'||process.env.HELIX_OFFERS_ENABLED!=='true')return false;
 const key=createHash('sha256').update(JSON.stringify(Object.entries(process.env).filter(([k])=>k.startsWith('HELIX_')||k.startsWith('STRIPE_')||k==='RESEND_API_KEY').sort(([a],[b])=>a.localeCompare(b)))).digest('hex');
 const now=Date.now();
 if(readinessCache?.key===key&&readinessCache.expires>now)return readinessCache.promise;
 const promise=checkLifecyclePopupReady();
 readinessCache={key,expires:now+30000,promise};
 return promise;
}
