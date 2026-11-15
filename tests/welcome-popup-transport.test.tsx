import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WelcomePopupVisit } from "@/components/marketing/WelcomePopup";
beforeEach(()=>{vi.useFakeTimers();});
afterEach(()=>{cleanup();vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();});
function transport(){let dismissed=false;return {
 readiness:vi.fn(async()=>({ready:true,scope:"lifecycle_reviews"})),
 subscribe:vi.fn(async()=>({ok:true})),
 isDismissed:vi.fn(()=>dismissed),
 rememberDismissal:vi.fn(()=>{dismissed=true;}),
};}
it("injected preview preserves delay and consent without fetch or persistent email storage",async()=>{
 const fetch=vi.fn(()=>{throw new Error("No preview network");});vi.stubGlobal("fetch",fetch);
 const read=vi.spyOn(Storage.prototype,"getItem"),write=vi.spyOn(Storage.prototype,"setItem");
 const memory=transport();render(<WelcomePopupVisit transport={memory}/>);
 await act(async()=>{await vi.advanceTimersByTimeAsync(11999);});expect(memory.readiness).not.toHaveBeenCalled();expect(screen.queryByRole("dialog")).toBeNull();
 await act(async()=>{await vi.advanceTimersByTimeAsync(2);});expect(screen.getByRole("dialog")).toBeVisible();
 fireEvent.change(screen.getByRole("textbox"),{target:{value:"demo@example.invalid"}});
 const form=screen.getByRole("button",{name:"Join the list"}).closest("form")!;
 fireEvent.submit(form);expect(memory.subscribe).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole("checkbox"));await act(async()=>{fireEvent.submit(form);});
 expect(memory.subscribe).toHaveBeenCalledWith({email:"demo@example.invalid",consent:true,scope:"lifecycle_reviews",source:"welcome_popup"},expect.any(AbortSignal));
 expect(screen.getByRole("status")).toHaveTextContent("If this address is eligible");expect(memory.rememberDismissal).toHaveBeenCalledOnce();
 expect(fetch).not.toHaveBeenCalled();expect(read).not.toHaveBeenCalled();expect(write).not.toHaveBeenCalled();
});
it("injected dismissal restores focus and remount with new memory resets only the preview",async()=>{
 const fetch=vi.fn();vi.stubGlobal("fetch",fetch);
 const trigger=document.createElement("button");document.body.append(trigger);trigger.focus();
 const first=transport();const view=render(<WelcomePopupVisit transport={first}/>);
 await act(async()=>{await vi.advanceTimersByTimeAsync(12001);});
 await act(async()=>{fireEvent.keyDown(document,{key:"Escape"});});expect(trigger).toHaveFocus();expect(first.rememberDismissal).toHaveBeenCalledOnce();
 view.rerender(<WelcomePopupVisit key="reset" transport={transport()}/>);
 await act(async()=>{await vi.advanceTimersByTimeAsync(12001);});expect(screen.getByRole("dialog")).toBeVisible();expect(fetch).not.toHaveBeenCalled();trigger.remove();
});
