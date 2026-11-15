import { act, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { LifecycleProductVisit } from "@/components/marketing/LifecycleProductVisit";
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
it("sends only one delayed visible-page signal without an identity",async()=>{
 vi.useFakeTimers();const fetch=vi.fn().mockResolvedValue(new Response(null,{status:204}));vi.stubGlobal("fetch",fetch);
 vi.spyOn(document,"visibilityState","get").mockReturnValue("visible");
 const view=render(<LifecycleProductVisit productSlug="super-serum"/>);
 await act(()=>vi.advanceTimersByTimeAsync(4999));expect(fetch).not.toHaveBeenCalled();
 await act(()=>vi.advanceTimersByTimeAsync(1));expect(fetch).toHaveBeenCalledOnce();
 expect(fetch.mock.calls[0][1].body).toBe(JSON.stringify({productSlug:"super-serum"}));
 view.unmount();expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);vi.restoreAllMocks();
});
it("navigation before delay cancels optional capture",async()=>{
 vi.useFakeTimers();const fetch=vi.fn();vi.stubGlobal("fetch",fetch);const view=render(<LifecycleProductVisit productSlug="super-serum"/>);
 view.unmount();await act(()=>vi.advanceTimersByTimeAsync(5000));expect(fetch).not.toHaveBeenCalled();
});
