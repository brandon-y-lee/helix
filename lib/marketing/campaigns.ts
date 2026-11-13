import 'server-only';
import { assertEmailEnvironment,emailRecipientAllowed,type EmailEnvironment } from '@/lib/email/config';
export type CampaignCandidate={subscriberId:string;kind:'welcome'|'cart'|'browse';sourceKey:string;email:string};
export type CampaignDependencies={env:EmailEnvironment;list():Promise<CampaignCandidate[]>;grant(input:{kind:'welcome'|'cart';email:string;sourceKey:string}):Promise<string|null>;offer(id:string,email:string):Promise<unknown|null>;admit(candidate:CampaignCandidate,offerId:string|null):Promise<boolean>;cleanup():Promise<unknown>};
export async function runLifecycleCampaigns(d:CampaignDependencies){
 const result={admitted:0,deferred:0};
 if(d.env.HELIX_LIFECYCLE_CAMPAIGNS_ENABLED!=='true') return result;
 assertEmailEnvironment(d.env);
 await d.cleanup();
 // One candidate bounds provider work and hosted deadlines. SQL orders welcome/cart/browse.
 const candidates=await d.list();
 if(!Array.isArray(candidates)||candidates.length>1) throw new Error('Invalid campaign work.');
 for(const c of candidates){
   if(!['welcome','cart','browse'].includes(c.kind)||!emailRecipientAllowed(c.email,d.env)){result.deferred++;continue;}
   let id:string|null=null;
   if(c.kind!=='browse'){
     id=await d.grant({kind:c.kind,email:c.email,sourceKey:c.sourceKey});
     if(!id||!await d.offer(id,c.email)){result.deferred++;continue;}
   }
   if(await d.admit(c,id)) result.admitted++;else result.deferred++;
 }
 return result;
}
