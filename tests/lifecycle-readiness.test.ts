import {afterEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({rpc:vi.fn(),coupon:vi.fn(),render:vi.fn()}));
vi.mock('@/lib/supabase/admin',()=>({createSupabaseAdminClient:()=>({rpc:m.rpc})}));
vi.mock('@/lib/offers/server',()=>({verifyConfiguredOfferCoupon:m.coupon,grantLifecycleOffer:vi.fn(),readLifecycleOfferForDelivery:vi.fn()}));
vi.mock('@/lib/marketing/templates',()=>({renderMarketingMessage:m.render}));
import {lifecyclePopupReady} from '@/lib/marketing/campaign-storage';
const id='eeeeeeee-0000-4000-8000-000000000001',entry={id,sha256:'a'.repeat(64)};
function ready(){
 for(const key of ['HELIX_LIFECYCLE_ENABLED','HELIX_LIFECYCLE_CAMPAIGNS_ENABLED','HELIX_MARKETING_ENABLED','HELIX_OFFERS_ENABLED'])vi.stubEnv(key,'true');
 vi.stubEnv('HELIX_EMAIL_ENVIRONMENT','sandbox');vi.stubEnv('HELIX_EMAIL_MODE','restricted');vi.stubEnv('HELIX_EMAIL_SITE_ORIGIN','https://helixskin.vercel.app');vi.stubEnv('HELIX_EMAIL_REPLY_TO','support@example.test');vi.stubEnv('HELIX_EMAIL_OWNER_RECIPIENT','owner@example.test');vi.stubEnv('RESEND_API_KEY','re_synthetic');
 vi.stubEnv('HELIX_EMAIL_LIFECYCLE_CONTRACT',JSON.stringify({version:'lifecycle_v1',siteOrigin:'https://helixskin.vercel.app',from:'Helix <onboarding@resend.dev>',replyTo:'support@example.test',postalAddress:'Synthetic address',topicId:id,templates:Object.fromEntries(['marketing_confirmation','welcome_initial','welcome_education','lifecycle_welcome','lifecycle_cart','lifecycle_browse'].map(p=>[p,entry]))}));
 m.rpc.mockReturnValue({abortSignal:()=>Promise.resolve({data:true,error:null})});m.coupon.mockResolvedValue('coupon');m.render.mockResolvedValue({});
}
afterEach(()=>{vi.useRealTimers();vi.unstubAllEnvs();vi.resetAllMocks();});
it('hides promotion by default without touching providers',async()=>{vi.stubEnv('HELIX_LIFECYCLE_ENABLED','false');expect(await lifecyclePopupReady()).toBe(false);expect(m.rpc).not.toHaveBeenCalled();});
it('requires database readiness, verified coupon and valid confirmation/offer native templates',async()=>{
 ready();vi.useFakeTimers();vi.setSystemTime(200000);expect(await lifecyclePopupReady()).toBe(true);expect(m.render.mock.calls.map(c=>c[0])).toEqual(['marketing_confirmation','lifecycle_welcome']);
 vi.setSystemTime(240000);m.coupon.mockRejectedValue(new Error('mismatch'));expect(await lifecyclePopupReady()).toBe(false);
 vi.setSystemTime(280000);m.coupon.mockResolvedValue('coupon');m.render.mockRejectedValue(new Error('drift'));expect(await lifecyclePopupReady()).toBe(false);
 vi.setSystemTime(320000);m.render.mockResolvedValue({});m.rpc.mockReturnValue({abortSignal:()=>Promise.resolve({data:false,error:null})});expect(await lifecyclePopupReady()).toBe(false);
});

it('coalesces concurrent readiness reads, caches failures, and honors disabled flags immediately',async()=>{
 ready();vi.useFakeTimers();vi.setSystemTime(500000);m.coupon.mockRejectedValue(new Error('unavailable'));
 expect(await Promise.all([lifecyclePopupReady(),lifecyclePopupReady()])).toEqual([false,false]);expect(m.coupon).toHaveBeenCalledTimes(1);
 expect(await lifecyclePopupReady()).toBe(false);expect(m.coupon).toHaveBeenCalledTimes(1);
 vi.setSystemTime(540000);m.coupon.mockResolvedValue('coupon');expect(await lifecyclePopupReady()).toBe(true);
 vi.stubEnv('HELIX_OFFERS_ENABLED','false');expect(await lifecyclePopupReady()).toBe(false);
});
it('v2 enrollment readiness requires its own immutable contract and never borrows v1 approval',async()=>{
 ready();vi.stubEnv('HELIX_LIFECYCLE_REVIEWS_ENABLED','true');vi.useFakeTimers();vi.setSystemTime(700000);
 expect(await lifecyclePopupReady()).toBe(false);expect(m.coupon).not.toHaveBeenCalled();
 const contract=JSON.parse(process.env.HELIX_EMAIL_LIFECYCLE_CONTRACT!);contract.version='lifecycle_v2';contract.templates.lifecycle_review_winback=entry;
 vi.stubEnv('HELIX_EMAIL_LIFECYCLE_REVIEWS_CONTRACT',JSON.stringify(contract));
 expect(await lifecyclePopupReady()).toBe(true);expect(m.render.mock.calls[0][1].templateContract.version).toBe('lifecycle_v2');
});
