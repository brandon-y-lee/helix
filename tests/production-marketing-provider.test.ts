import { afterEach, expect, it, vi } from "vitest";
import { productionMarketingProvider } from "@/lib/production-marketing/delivery-provider";
import { productionMarketingTemplateHash } from "@/lib/production-marketing/templates";
const contract={version:"production_welcome_delivery_v1",from:"news@helixskin.us",replyTo:"support@helixskin.us",topicId:"11111111-1111-4111-8111-111111111111",postalAddress:"Synthetic test only",templateHash:productionMarketingTemplateHash};
const env={VERCEL:"1",VERCEL_ENV:"production",VERCEL_PROJECT_ID:"p",VERCEL_DEPLOYMENT_ID:"d",VERCEL_PROJECT_PRODUCTION_URL:"helixskin.us",
  HELIX_PRODUCTION_MARKETING_SITE_ORIGIN:"https://www.helixskin.us",HELIX_PRODUCTION_MARKETING_VERCEL_PROJECT_ID:"p",HELIX_PRODUCTION_MARKETING_DEPLOYMENT_ID:"d",
  HELIX_PRODUCTION_MARKETING_SUPABASE_URL:"https://erasogmsqpgiirovubjh.supabase.co",HELIX_PRODUCTION_MARKETING_SERVICE_KEY:"synthetic-db",
  HELIX_PRODUCTION_MARKETING_DISPATCH_ENABLED:"true",HELIX_PRODUCTION_MARKETING_PROVIDER_KEY:"synthetic-send",HELIX_PRODUCTION_MARKETING_PREFERENCE_KEY:"synthetic-read",
  HELIX_PRODUCTION_MARKETING_DELIVERY_CONTRACT:JSON.stringify(contract)};
afterEach(()=>vi.unstubAllGlobals());
it("sends exact frozen bytes to the fixed provider endpoint with the dedicated key and bounded deadline",async()=>{
  const id="22222222-2222-4222-8222-222222222222",body='{"synthetic":"frozen"}',key="production-marketing/one";
  const fetcher=vi.fn().mockResolvedValue(Response.json({id}));vi.stubGlobal("fetch",fetcher);
  expect(await productionMarketingProvider.send(body,key,new Date(Date.now()+60000).toISOString(),env)).toEqual({kind:"accepted",id});
  expect(fetcher).toHaveBeenCalledWith("https://api.resend.com/emails",expect.objectContaining({method:"POST",body,redirect:"error",cache:"no-store",headers:{Authorization:"Bearer synthetic-send","Content-Type":"application/json","Idempotency-Key":key},signal:expect.any(AbortSignal)}));
});
it("holds ambiguous responses and expiry without leaking errors or starting another provider call",async()=>{
  const fetcher=vi.fn().mockRejectedValue(new Error("PRIVATE address and token"));vi.stubGlobal("fetch",fetcher);
  expect(await productionMarketingProvider.send("{}","key",new Date(Date.now()+60000).toISOString(),env)).toEqual({kind:"uncertain"});
  expect(fetcher).toHaveBeenCalledTimes(1);fetcher.mockClear();
  expect(await productionMarketingProvider.send("{}","key",new Date(Date.now()-1).toISOString(),env)).toEqual({kind:"uncertain"});expect(fetcher).not.toHaveBeenCalled();
});
it("reads only native contact/topic permission using the separate read capability and never creates or changes contacts",async()=>{
  const contactId="33333333-3333-4333-8333-333333333333";
  const fetcher=vi.fn().mockResolvedValueOnce(Response.json({id:contactId,email:"visitor@example.invalid",unsubscribed:false}))
    .mockResolvedValueOnce(Response.json({data:[{id:contract.topicId,subscription:"opt_in"}],has_more:false}));vi.stubGlobal("fetch",fetcher);
  expect(await productionMarketingProvider.permission("visitor@example.invalid",contract.topicId,env)).toBe(true);
  expect(fetcher).toHaveBeenCalledTimes(2);
  for(const call of fetcher.mock.calls) {expect(call[1].headers.Authorization).toBe("Bearer synthetic-read");expect(call[1].method??"GET").toBe("GET");}
  fetcher.mockReset().mockResolvedValue(Response.json({id:contactId,email:"visitor@example.invalid",unsubscribed:true}));
  expect(await productionMarketingProvider.permission("visitor@example.invalid",contract.topicId,env)).toBe(false);expect(fetcher).toHaveBeenCalledTimes(1);
  fetcher.mockReset().mockResolvedValue(new Response("",{status:404}));
  expect(await productionMarketingProvider.permission("visitor@example.invalid",contract.topicId,env)).toBe(false);expect(fetcher).toHaveBeenCalledTimes(1);
});
