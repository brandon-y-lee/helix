import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("next/navigation",()=>({usePathname:()=>"/"}));
import { EmailPreferences } from "@/components/marketing/EmailPreferences";
import EmailPreferencesPage from "@/app/email-preferences/page";
import { WelcomePopup } from "@/components/marketing/WelcomePopup";
afterEach(()=>{cleanup();localStorage.clear();vi.useRealTimers();vi.unstubAllGlobals();});
it("new opt-in explicitly describes reviews and posts new scope only after checking consent",async()=>{
 const fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify({ok:true}),{status:202}));vi.stubGlobal("fetch",fetch);
 render(<EmailPreferences reviews />);
 const consent=screen.getByRole("checkbox");expect(consent).not.toBeChecked();expect(consent.closest("label")).toHaveTextContent("post-purchase follow-ups, review invitations and next-purchase offers");
 fireEvent.change(screen.getByRole("textbox"),{target:{value:"owner@example.test"}});
 fireEvent.submit(screen.getByRole("button",{name:"Subscribe"}).closest("form")!);expect(fetch).not.toHaveBeenCalled();
 fireEvent.click(consent);await act(async()=>{fireEvent.submit(screen.getByRole("button",{name:"Subscribe"}).closest("form")!);});
 expect(fetch).toHaveBeenCalledWith("/api/marketing/subscription",expect.objectContaining({body:JSON.stringify({email:"owner@example.test",consent:true,scope:"lifecycle_reviews"})}));
});
it("v2 confirmation shows expanded wording and submits its exact scope",async()=>{
 const fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify({ok:true})));vi.stubGlobal("fetch",fetch);
 render(await EmailPreferencesPage({searchParams:Promise.resolve({confirm:"T".repeat(43),scope:"lifecycle_reviews"})}));
 expect(screen.getByText(/post-purchase follow-ups, review invitations and next-purchase offers/)).toBeInTheDocument();
 await act(async()=>{fireEvent.click(screen.getByRole("button",{name:"Confirm subscription"}));});
 expect(fetch).toHaveBeenCalledWith("/api/marketing/confirm",expect.objectContaining({body:JSON.stringify({token:"T".repeat(43),scope:"lifecycle_reviews"})}));
});
it("rejects ambiguous scope and missing scope never displays or posts review consent",async()=>{
 render(await EmailPreferencesPage({searchParams:Promise.resolve({confirm:"T".repeat(43),scope:["lifecycle","lifecycle_reviews"]})}));
 expect(screen.getByRole("alert")).toHaveTextContent("This email link is invalid");cleanup();
 const fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify({ok:false}),{status:400}));vi.stubGlobal("fetch",fetch);
 render(await EmailPreferencesPage({searchParams:Promise.resolve({confirm:"T".repeat(43)})}));
 expect(screen.queryByText(/post-purchase follow-ups/)).toBeNull();
 await act(async()=>{fireEvent.click(screen.getByRole("button",{name:"Confirm subscription"}));});
 expect(fetch).toHaveBeenCalledWith("/api/marketing/confirm",expect.objectContaining({body:JSON.stringify({token:"T".repeat(43),scope:"welcome"})}));
});
it("popup displays and posts review scope only from verified readiness",async()=>{
 vi.useFakeTimers();const fetch=vi.fn().mockImplementation(()=>Promise.resolve(new Response(JSON.stringify({ready:true,scope:"lifecycle_reviews"}))));vi.stubGlobal("fetch",fetch);
 render(<WelcomePopup/>);await act(async()=>{await vi.advanceTimersByTimeAsync(12001);});
 const consent=screen.getByRole("checkbox");expect(consent).not.toBeChecked();expect(consent.closest("label")).toHaveTextContent("review invitations and next-purchase offers");
 fireEvent.change(screen.getByRole("textbox"),{target:{value:"owner@example.test"}});fireEvent.click(consent);
 await act(async()=>{fireEvent.submit(screen.getByRole("button",{name:"Join the list"}).closest("form")!);});
 expect(fetch).toHaveBeenLastCalledWith("/api/marketing/subscription",expect.objectContaining({body:JSON.stringify({email:"owner@example.test",consent:true,scope:"lifecycle_reviews",source:"welcome_popup"})}));
});
