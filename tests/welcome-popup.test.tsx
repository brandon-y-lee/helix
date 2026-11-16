import { act, fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const route=vi.hoisted(()=>({pathname:"/"}));
vi.mock("next/navigation",()=>({usePathname:()=>route.pathname}));
import { WelcomePopup } from "@/components/marketing/WelcomePopup";
beforeEach(()=>{vi.useFakeTimers();localStorage.clear();route.pathname="/";});
afterEach(()=>{cleanup();vi.useRealTimers();vi.unstubAllGlobals();});
async function advance(){await act(async()=>{await vi.advanceTimersByTimeAsync(12001);});}
it("requires verified readiness and a delay, never promotes on excluded routes",async()=>{
 const fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify({ready:false})));vi.stubGlobal("fetch",fetch);
 const view=render(<WelcomePopup/>);expect(screen.queryByRole("dialog")).toBeNull();await advance();expect(screen.queryByRole("dialog")).toBeNull();
 route.pathname="/checkout";view.rerender(<WelcomePopup/>);fetch.mockClear();await advance();expect(fetch).not.toHaveBeenCalled();
});
it("requires separate consent, submits exact scope, and never exposes a code",async()=>{
 const fetch=vi.fn().mockImplementation(()=>Promise.resolve(new Response(JSON.stringify({ready:true}),{status:200})));vi.stubGlobal("fetch",fetch);
 render(<WelcomePopup/>);await advance();expect(screen.getByRole("dialog")).toBeInTheDocument();
 const checkbox=screen.getByRole("checkbox");expect(checkbox).not.toBeChecked();
 fireEvent.change(screen.getByRole("textbox",{name:"Email address"}),{target:{value:"owner@example.test"}});
 fireEvent.submit(screen.getByRole("button",{name:"Join the list"}).closest("form")!);expect(fetch).toHaveBeenCalledTimes(1);
 fireEvent.click(checkbox);await act(async()=>{fireEvent.submit(screen.getByRole("button",{name:"Join the list"}).closest("form")!);});
 expect(fetch).toHaveBeenLastCalledWith("/api/marketing/subscription",expect.objectContaining({body:JSON.stringify({email:"owner@example.test",consent:true,scope:"lifecycle",source:"welcome_popup"})}));
 expect(screen.getByRole("status")).toHaveTextContent("If this address is eligible, check your inbox to confirm");
 expect(localStorage.getItem("helix.welcome-dismissed-until")).not.toContain("owner");
});
it("Escape dismisses for 30 days and restores focus",async()=>{
 vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(JSON.stringify({ready:true}))));
 const trigger=document.createElement("button");document.body.appendChild(trigger);trigger.focus();
 const view=render(<WelcomePopup/>);await advance();fireEvent.keyDown(document,{key:"Escape"});await act(async()=>{});
 expect(screen.queryByRole("dialog")).toBeNull();expect(trigger).toHaveFocus();
 expect(Number(localStorage.getItem("helix.welcome-dismissed-until"))).toBeGreaterThan(Date.now()+29*86400000);
 view.unmount();render(<WelcomePopup/>);await advance();expect(screen.queryByRole("dialog")).toBeNull();trigger.remove();
});
it("late readiness cannot open a popup after navigation",async()=>{
 let resolve!:(response:Response)=>void;vi.stubGlobal("fetch",vi.fn(()=>new Promise<Response>(r=>{resolve=r;})));
 const view=render(<WelcomePopup/>);await advance();route.pathname="/account";view.rerender(<WelcomePopup/>);
 await act(async()=>{resolve(new Response(JSON.stringify({ready:true})));});expect(screen.queryByRole("dialog")).toBeNull();
});

it("contains keyboard focus and blocks repeat submission while pending",async()=>{
 let submitted=false;
 vi.stubGlobal("fetch",vi.fn(()=>submitted ? new Promise<Response>(()=>{}) : Promise.resolve(new Response(JSON.stringify({ready:true})))));
 render(<WelcomePopup/>);await advance();
 const close=screen.getByRole("button",{name:"Close welcome offer"});const join=screen.getByRole("button",{name:"Join the list"});
 close.focus();fireEvent.keyDown(document,{key:"Tab",shiftKey:true});expect(join).toHaveFocus();
 fireEvent.keyDown(document,{key:"Tab"});expect(close).toHaveFocus();
 fireEvent.change(screen.getByRole("textbox"),{target:{value:"owner@example.test"}});fireEvent.click(screen.getByRole("checkbox"));submitted=true;
 fireEvent.submit(join.closest("form")!);fireEvent.submit(join.closest("form")!);expect(fetch).toHaveBeenCalledTimes(2);
 await act(async()=>{fireEvent.click(close);});expect(screen.queryByRole("dialog")).toBeNull();
});
