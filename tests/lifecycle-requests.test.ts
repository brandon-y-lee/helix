import { describe, expect, it, vi } from "vitest";
import { handleMarketingRequest } from "@/lib/marketing/requests";
import { parseMarketingTemplateContract } from "@/lib/marketing/contract";
const template = { id: "ffbbdbaa-d4fa-4ae8-865f-e01cc63e2e34", sha256: "a".repeat(64) };
const contract = { version: "lifecycle_v1", siteOrigin: "https://helixskin.vercel.app", from: "Helix <onboarding@resend.dev>",
  replyTo: "support@example.test", postalAddress: "Synthetic mailing address", topicId: "61296d74-fad4-4c74-83d3-6a3e17ab9f74",
  templates: { marketing_confirmation: template, welcome_initial: template, welcome_education: template } };
const env = { HELIX_EMAIL_ENVIRONMENT: "sandbox", HELIX_EMAIL_MODE: "restricted", HELIX_MARKETING_ENABLED: "true",
  HELIX_LIFECYCLE_ENABLED: "true", HELIX_EMAIL_OWNER_RECIPIENT: "owner@example.test", HELIX_EMAIL_MARKETING_CONTRACT: JSON.stringify({...contract,version:"welcome_v1"}),
  HELIX_EMAIL_LIFECYCLE_CONTRACT: JSON.stringify(contract) };
function request(extra: Record<string,unknown>={}) { return new Request("https://helixskin.vercel.app/api/marketing/subscription",{
  method:"POST",headers:{origin:"https://helixskin.vercel.app","content-type":"application/json"},
  body:JSON.stringify({email:"owner@example.test",consent:true,scope:"lifecycle",source:"welcome_popup",...extra}) }); }
function deps() {return {env:{...env},storage:{request:vi.fn().mockResolvedValue({status:"accepted"}),confirm:vi.fn(),withdraw:vi.fn()}};}
describe("explicit lifecycle subscription",()=>{
  it("accepts separately approved version without reinterpreting legacy contracts",()=>{
    expect(parseMarketingTemplateContract(contract).version).toBe("lifecycle_v1");
    expect(parseMarketingTemplateContract({...contract,version:"welcome_v1"}).version).toBe("welcome_v1");
  });
  it("persists exact new scope wording and popup provenance only with explicit scope",async()=>{
    const d=deps(); expect((await handleMarketingRequest(request(),"subscription",d)).status).toBe(202);
    expect(d.storage.request).toHaveBeenCalledWith(expect.objectContaining({source:"welcome_popup",wordingVersion:"2026-11-13-lifecycle-v1",templateContract:contract}));
  });
  it("fails closed when lifecycle gate or separate approval is absent",async()=>{
    const d=deps();d.env.HELIX_LIFECYCLE_ENABLED="false";
    expect((await handleMarketingRequest(request(),"subscription",d)).status).toBe(503);
    expect(d.storage.request).not.toHaveBeenCalled();
  });
  it("rejects invented scope and source rather than silently granting welcome or lifecycle",async()=>{
    const d=deps();expect((await handleMarketingRequest(request({scope:"all"}),"subscription",d)).status).toBe(400);
    expect((await handleMarketingRequest(request({source:"import"}),"subscription",d)).status).toBe(400);
    expect(d.storage.request).not.toHaveBeenCalled();
  });
});

it("posts the displayed scope to the token-bound confirmation guard",async()=>{
  const d=deps();d.storage.confirm.mockResolvedValue({status:"invalid"});
  const token="A".repeat(43);
  expect((await handleMarketingRequest(request({token,scope:"welcome"}),"confirm",d)).status).toBe(400);
  expect(d.storage.confirm).toHaveBeenLastCalledWith(token,expect.any(String),"welcome");
  expect((await handleMarketingRequest(request({token,scope:undefined}),"confirm",d)).status).toBe(400);
  expect(d.storage.confirm).toHaveBeenLastCalledWith(token,expect.any(String),"welcome");
  d.storage.confirm.mockResolvedValue({status:"confirmed"});
  expect((await handleMarketingRequest(request({token,scope:"lifecycle"}),"confirm",d)).status).toBe(200);
  expect(d.storage.confirm).toHaveBeenLastCalledWith(token,expect.any(String),"lifecycle");
});
