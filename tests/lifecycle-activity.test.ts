import { describe, expect, it, vi } from "vitest";
import { handleLifecycleActivity } from "@/lib/marketing/activity";
const env = { HELIX_LIFECYCLE_ENABLED:"true",HELIX_EMAIL_ENVIRONMENT:"sandbox",HELIX_EMAIL_MODE:"restricted" };
function req(body: unknown, origin="https://helixskin.vercel.app") { return new Request("https://helixskin.vercel.app/api/marketing/activity",{method:"POST",headers:{origin},body:JSON.stringify(body)}); }
function deps(){return {env:{...env},getUser:vi.fn().mockResolvedValue({id:"verified-account",email:"synthetic@example.test",email_confirmed_at:"2026-11-01"}),recordVisit:vi.fn().mockResolvedValue(undefined)};}
describe("authenticated lifecycle activity boundary",()=>{
 it("passes only server-authenticated identity and bounded product slug",async()=>{const d=deps();expect((await handleLifecycleActivity(req({productSlug:"treat"}),d)).status).toBe(204);expect(d.recordVisit).toHaveBeenCalledWith("verified-account","treat");});
 it("does not persist anonymous, unverified or disabled browsing",async()=>{for(const identity of [null,{id:"u",email:"x@example.test"}]){const d=deps();d.getUser.mockResolvedValue(identity);expect((await handleLifecycleActivity(req({productSlug:"treat"}),d)).status).toBe(204);expect(d.recordVisit).not.toHaveBeenCalled();}const d=deps();d.env.HELIX_LIFECYCLE_ENABLED="false";await handleLifecycleActivity(req({productSlug:"treat"}),d);expect(d.getUser).not.toHaveBeenCalled();});
 it("rejects cross-origin, oversize and client ownership claims",async()=>{const d=deps();expect((await handleLifecycleActivity(req({productSlug:"treat"},"https://other.test"),d)).status).toBe(403);expect((await handleLifecycleActivity(req({productSlug:"treat",userId:"victim"}),d)).status).toBe(400);expect((await handleLifecycleActivity(req({productSlug:"x".repeat(600)}),d)).status).toBe(413);expect(d.recordVisit).not.toHaveBeenCalled();});
 it("fails closed without exposing backend errors",async()=>{const d=deps();d.recordVisit.mockRejectedValue(new Error("private database detail"));const r=await handleLifecycleActivity(req({productSlug:"treat"}),d);expect(r.status).toBe(503);expect(await r.text()).toBe("");});
});
