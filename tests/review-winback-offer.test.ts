import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const b=vi.hoisted(()=>({rpc:vi.fn(),coupon:vi.fn(),account:vi.fn()}));
vi.mock('@/lib/supabase/admin',()=>({createSupabaseAdminClient:()=>({rpc:b.rpc})}));
vi.mock('@/lib/stripe/server',()=>({getStripeClient:()=>({coupons:{retrieve:b.coupon}})}));
vi.mock('@/lib/stripe/payment-verification',()=>({verifyStripeAccount:b.account}));
vi.mock('@/lib/checkout/config',()=>({readPaymentProviderConfig:()=>({})}));
import {grantReviewWinbackOffer} from '@/lib/offers/server';
const subscriberId='11111111-1111-4111-8111-111111111111',orderId='22222222-2222-4222-8222-222222222222',offerId='33333333-3333-4333-8333-333333333333';
beforeEach(()=>{
 vi.stubEnv('HELIX_OFFERS_ENABLED','true');vi.stubEnv('STRIPE_REVIEW_WINBACK_10_COUPON_ID','review_coupon');
 b.coupon.mockResolvedValue({id:'review_coupon',valid:true,livemode:false,percent_off:10,amount_off:null,currency:null,duration:'once',redeem_by:null,max_redemptions:null});
 b.rpc.mockReturnValue({abortSignal:()=>Promise.resolve({data:offerId,error:null})});
});
afterEach(()=>{vi.unstubAllEnvs();vi.resetAllMocks();});
describe('private review offer grant',()=>{
 it('resolves recipient solely through canonical order/subscriber RPC, without review submission',async()=>{
  expect(await grantReviewWinbackOffer({subscriberId,orderId})).toBe(offerId);
  expect(b.rpc).toHaveBeenCalledExactlyOnceWith('grant_review_winback_offer',{p_subscriber_id:subscriberId,p_order_id:orderId,p_coupon_id:'review_coupon'});
  expect(b.account).toHaveBeenCalledTimes(1);
 });
 it('returns no grant when genuine source evidence is absent',async()=>{
  b.rpc.mockReturnValue({abortSignal:()=>Promise.resolve({data:null,error:null})});
  expect(await grantReviewWinbackOffer({subscriberId,orderId})).toBeNull();
 });
 it('rejects invalid order identity before any provider work',async()=>{
  await expect(grantReviewWinbackOffer({subscriberId,orderId:'arbitrary'})).rejects.toThrow();
  expect(b.coupon).not.toHaveBeenCalled();expect(b.rpc).not.toHaveBeenCalled();
 });
 it('rejects the wrong or unconfigured coupon before any grant',async()=>{
  b.coupon.mockResolvedValue({id:'review_coupon',valid:true,livemode:false,percent_off:15});
  await expect(grantReviewWinbackOffer({subscriberId,orderId})).rejects.toThrow();
  expect(b.rpc).not.toHaveBeenCalled();
  vi.stubEnv('STRIPE_REVIEW_WINBACK_10_COUPON_ID','');
  await expect(grantReviewWinbackOffer({subscriberId,orderId})).rejects.toThrow();
 });
});
