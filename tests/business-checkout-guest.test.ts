import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CHECKOUT_RECEIPT_COOKIE, GUEST_CART_COOKIE } from "@/lib/customer-state-identifiers";
import { createCheckoutSession } from "@/lib/cart/client";
const state = vi.hoisted(() => ({ values:new Map<string,string>(), set:vi.fn() }));
vi.mock("next/headers",()=>({cookies:async()=>({
  get:(name:string)=>state.values.has(name)?{value:state.values.get(name)}:undefined,
  set:(name:string,value:string,options:unknown)=>{state.values.set(name,value);state.set(name,value,options);},
})}));
import { prepareBusinessGuestReceipt, readBusinessReceiptTokenHash } from "@/lib/orders/business-receipt-cookie";
const digest=(v:string)=>createHash("sha256").update(v).digest("hex");
beforeEach(()=>{state.values.clear();state.set.mockClear();});
afterEach(()=>vi.unstubAllGlobals());
describe("private business guest checkout",()=>{
  it("binds only an independent per-generation secret after the browser proves it on a second request",async()=>{
    const cartToken=Buffer.alloc(32,6).toString("base64url");
    state.values.set(GUEST_CART_COOKIE,cartToken);
    state.values.set(CHECKOUT_RECEIPT_COOKIE,cartToken);
    expect(await prepareBusinessGuestReceipt("cart","generation")).toBeNull();
    const [,secret,options]=state.set.mock.calls[0];
    expect(secret).not.toBe(cartToken);expect(options).toMatchObject({httpOnly:true,sameSite:"lax"});
    const proof=await prepareBusinessGuestReceipt("cart","generation");
    expect(proof?.guestHash).toBe(digest(cartToken));expect(proof?.receiptHash).toBe(digest(secret));
    expect(await readBusinessReceiptTokenHash("cs_test_stored")).toBeNull();
    proof?.bindSession("cs_test_stored");
    expect(await readBusinessReceiptTokenHash("cs_test_stored")).toBe(digest(secret));
    expect(await readBusinessReceiptTokenHash("cs_test_other")).toBeNull();
    expect(await prepareBusinessGuestReceipt("cart","new-generation")).toBeNull();
  });
  it("retries cookie preparation exactly once without repeating an uncertain payment request",async()=>{
    const prepared=()=>Response.json({error:{code:"CHECKOUT_RECEIPT_PREPARED",message:"Preparing"}},{status:409});
    const origin=vi.fn().mockResolvedValueOnce(prepared()).mockResolvedValueOnce(Response.json({url:"https://checkout.stripe.com/c/pay/cs_test_x"}));
    vi.stubGlobal("fetch",origin);
    expect((await createCheckoutSession(null)).url).toContain("checkout.stripe.com");
    expect(origin).toHaveBeenCalledTimes(2);
    origin.mockClear().mockResolvedValueOnce(prepared()).mockResolvedValueOnce(prepared());
    await expect(createCheckoutSession(null)).rejects.toThrow();expect(origin).toHaveBeenCalledTimes(2);
    origin.mockClear().mockRejectedValueOnce(new Error("network"));
    await expect(createCheckoutSession(null)).rejects.toThrow();expect(origin).toHaveBeenCalledOnce();
  });
});
