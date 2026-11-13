import { expect, it, vi } from "vitest";
import { parseMarketingTemplateContract, readMarketingTemplateContract } from "@/lib/marketing/contract";
import { handleMarketingRequest } from "@/lib/marketing/requests";
import { lifecycleTemplateSources } from "@/lib/marketing/lifecycle-template-sources";
import { marketingTemplateFingerprint, renderMarketingMessage } from "@/lib/marketing/templates";
const id="eeeeeeee-0000-4000-8000-000000000001", entry={id,sha256:"a".repeat(64)};
const purposes=["marketing_confirmation","welcome_initial","welcome_education","lifecycle_welcome","lifecycle_cart","lifecycle_browse","lifecycle_review_winback"];
const contract={version:"lifecycle_v2",siteOrigin:"https://helixskin.vercel.app",from:"Helix <onboarding@resend.dev>",replyTo:"support@example.test",postalAddress:"Synthetic address",topicId:id,templates:Object.fromEntries(purposes.map(p=>[p,entry]))};
it("requires explicit v2 approval and rejects review permissions on v1",()=>{
 expect(parseMarketingTemplateContract(contract).version).toBe("lifecycle_v2");
 expect(()=>parseMarketingTemplateContract({...contract,version:"lifecycle_v1"})).toThrow();
 expect(()=>parseMarketingTemplateContract({...contract,templates:{...contract.templates,lifecycle_review_winback:undefined}})).toThrow();
 expect(()=>readMarketingTemplateContract({HELIX_EMAIL_LIFECYCLE_REVIEWS_CONTRACT:JSON.stringify({...contract,version:"lifecycle_v1"})},"lifecycle_reviews")).toThrow();
});
it("requires a new enrollment gate and stores distinct immutable wording",async()=>{
 const storage={request:vi.fn().mockResolvedValue({status:"accepted"}),confirm:vi.fn().mockResolvedValue({status:"confirmed"}),withdraw:vi.fn()};
 const env={HELIX_MARKETING_ENABLED:"true",HELIX_LIFECYCLE_ENABLED:"true",HELIX_EMAIL_ENVIRONMENT:"sandbox",HELIX_EMAIL_MODE:"restricted",HELIX_EMAIL_OWNER_RECIPIENT:"owner@example.test",HELIX_EMAIL_LIFECYCLE_REVIEWS_CONTRACT:JSON.stringify(contract),HELIX_LIFECYCLE_REVIEWS_ENABLED:"false"};
 const req=()=>new Request("https://helixskin.vercel.app/api/marketing/subscription",{method:"POST",headers:{origin:"https://helixskin.vercel.app"},body:JSON.stringify({email:"owner@example.test",consent:true,scope:"lifecycle_reviews",source:"welcome_popup"})});
 expect((await handleMarketingRequest(req(),"subscription",{storage,env})).status).toBe(503);expect(storage.request).not.toHaveBeenCalled();
 env.HELIX_LIFECYCLE_REVIEWS_ENABLED="true";
 expect((await handleMarketingRequest(req(),"subscription",{storage,env})).status).toBe(202);
 expect(storage.request).toHaveBeenCalledWith(expect.objectContaining({wordingVersion:"2026-11-13-lifecycle-v2",templateContract:contract}));
});
it("renders independent review and shopping links with unconditional 10% terms",async()=>{
 const native={id,current_version_id:id,status:"published",has_unpublished_versions:false,from:null,reply_to:null,...lifecycleTemplateSources.lifecycle_review_winback};
 const receipt={schemaVersion:1,subscriberId:id,generation:2,revision:2,preferenceToken:"P".repeat(43),templateContract:{...contract,templates:{...contract.templates,lifecycle_review_winback:{id,sha256:marketingTemplateFingerprint(native)}}},lifecycle:{kind:"review_winback",sourceKey:"order:test",dueAt:"2026-12-01T00:00:00Z",offerId:id,offerExpiresAt:"2026-12-15T00:00:00Z",productSlug:null,productName:null}};
 const message=await renderMarketingMessage("lifecycle_review_winback",receipt,"re_synthetic",async()=>native);
 expect(message.text).toContain("https://helixskin.vercel.app/account/reviews");expect(message.text).toContain("https://helixskin.vercel.app/cart");
 expect(message.text).toContain("10%");expect(message.text).toContain("whether or not you leave a review");expect(message.text).toContain("All honest feedback is welcome.");expect(message.text).toContain("scope=lifecycle_reviews");
 const bad={...native,text:native.text.replace(/\{\{\{HELIX_REVIEW_URL\}\}\}/g,"")};
 receipt.templateContract.templates.lifecycle_review_winback={id,sha256:marketingTemplateFingerprint(bad)};
 await expect(renderMarketingMessage("lifecycle_review_winback",receipt,"re_synthetic",async()=>bad)).rejects.toThrow();
});
it("passes explicit displayed v2 scope to storage but missing scope remains welcome",async()=>{
 const storage={request:vi.fn(),confirm:vi.fn().mockResolvedValue({status:"invalid"}),withdraw:vi.fn()};
 const token="T".repeat(43);
 const req=(scope?:string)=>new Request("https://helixskin.vercel.app/api/marketing/confirm",{method:"POST",headers:{origin:"https://helixskin.vercel.app"},body:JSON.stringify({token,scope})});
 expect((await handleMarketingRequest(req("lifecycle_reviews"),"confirm",{storage,env:{}})).status).toBe(400);
 expect(storage.confirm).toHaveBeenLastCalledWith(token,expect.any(String),"lifecycle_reviews");
 expect((await handleMarketingRequest(req(),"confirm",{storage,env:{}})).status).toBe(400);
 expect(storage.confirm).toHaveBeenLastCalledWith(token,expect.any(String),"welcome");
});
