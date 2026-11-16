import { expect,it,vi } from 'vitest';
import { runLifecycleCampaigns } from '@/lib/marketing/campaigns';
const candidate={subscriberId:'a',kind:'cart',sourceKey:'cart:1',email:'owner@example.test'};
it('does nothing while disabled',async()=>{const list=vi.fn();expect(await runLifecycleCampaigns({env:{},list,grant:vi.fn(),offer:vi.fn(),admit:vi.fn(),cleanup:vi.fn()})).toEqual({admitted:0,deferred:0});expect(list).not.toHaveBeenCalled();});
it('never admits an offer that cannot currently be used',async()=>{const admit=vi.fn(); const cleanup=vi.fn();const result=await runLifecycleCampaigns({env:{HELIX_LIFECYCLE_CAMPAIGNS_ENABLED:'true',HELIX_EMAIL_ENVIRONMENT:'sandbox',HELIX_EMAIL_MODE:'restricted',HELIX_EMAIL_OWNER_RECIPIENT:'owner@example.test'},list:vi.fn().mockResolvedValue([candidate]),grant:vi.fn().mockResolvedValue('offer'),offer:vi.fn().mockResolvedValue(null),admit,cleanup});expect(admit).not.toHaveBeenCalled();expect(result.deferred).toBe(1);expect(cleanup).toHaveBeenCalled();});
it('browse never grants or promises a discount',async()=>{const grant=vi.fn(),offer=vi.fn(),admit=vi.fn().mockResolvedValue(true);await runLifecycleCampaigns({env:{HELIX_LIFECYCLE_CAMPAIGNS_ENABLED:'true',HELIX_EMAIL_ENVIRONMENT:'sandbox',HELIX_EMAIL_MODE:'restricted',HELIX_EMAIL_OWNER_RECIPIENT:'owner@example.test'},list:vi.fn().mockResolvedValue([{...candidate,kind:'browse'}]),grant,offer,admit,cleanup:vi.fn()});expect(grant).not.toHaveBeenCalled();expect(offer).not.toHaveBeenCalled();expect(admit).toHaveBeenCalledWith(expect.objectContaining({kind:'browse'}),null);});
it('applies the sandbox recipient policy before grants or admission',async()=>{
 const grant=vi.fn(),admit=vi.fn();const result=await runLifecycleCampaigns({env:{HELIX_LIFECYCLE_CAMPAIGNS_ENABLED:'true',HELIX_EMAIL_ENVIRONMENT:'sandbox',HELIX_EMAIL_MODE:'restricted',HELIX_EMAIL_OWNER_RECIPIENT:'owner@example.test'},list:vi.fn().mockResolvedValue([{...candidate,email:'real-customer@example.test'}]),grant,offer:vi.fn(),admit,cleanup:vi.fn()});
 expect(result.deferred).toBe(1);expect(grant).not.toHaveBeenCalled();expect(admit).not.toHaveBeenCalled();
});
it('review stays independently off and never uses generic offer grant',async()=>{
 const grantReview=vi.fn(),grant=vi.fn(),admit=vi.fn();
 const d={env:{HELIX_LIFECYCLE_CAMPAIGNS_ENABLED:'true',HELIX_EMAIL_ENVIRONMENT:'sandbox',HELIX_EMAIL_MODE:'restricted',HELIX_EMAIL_OWNER_RECIPIENT:'owner@example.test'},list:vi.fn().mockResolvedValue([{...candidate,kind:'review_winback',sourceKey:'review_winback:order-id'}]),grant,grantReview,offer:vi.fn(),admit,cleanup:vi.fn()};
 expect((await runLifecycleCampaigns(d)).deferred).toBe(1);expect(grantReview).not.toHaveBeenCalled();expect(grant).not.toHaveBeenCalled();
});
it('review uses order-bound internal grant and final usable-offer admission',async()=>{
 const grantReview=vi.fn().mockResolvedValue('offer'),grant=vi.fn(),admit=vi.fn().mockResolvedValue(true);
 const d={env:{HELIX_LIFECYCLE_CAMPAIGNS_ENABLED:'true',HELIX_LIFECYCLE_REVIEWS_ENABLED:'true',HELIX_EMAIL_ENVIRONMENT:'sandbox',HELIX_EMAIL_MODE:'restricted',HELIX_EMAIL_OWNER_RECIPIENT:'owner@example.test'},list:vi.fn().mockResolvedValue([{...candidate,kind:'review_winback',sourceKey:'review_winback:order-id'}]),grant,grantReview,offer:vi.fn().mockResolvedValue({}),admit,cleanup:vi.fn()};
 expect((await runLifecycleCampaigns(d)).admitted).toBe(1);expect(grantReview).toHaveBeenCalledWith({subscriberId:'a',orderId:'order-id'});expect(grant).not.toHaveBeenCalled();
 d.offer.mockResolvedValue(null);expect((await runLifecycleCampaigns(d)).deferred).toBe(1);expect(admit).toHaveBeenCalledTimes(1);
});
