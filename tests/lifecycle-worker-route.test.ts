import {afterEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({run:vi.fn(),dependencies:vi.fn()}));
vi.mock('@/lib/marketing/campaigns',()=>({runLifecycleCampaigns:m.run}));
vi.mock('@/lib/marketing/campaign-storage',()=>({lifecycleCampaignDependencies:m.dependencies}));
import {POST} from '@/app/api/internal/lifecycle-campaigns/route';
afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks();});
it('requires the configured bearer secret before any worker work',async()=>{
 vi.stubEnv('HELIX_EMAIL_DISPATCH_SECRET','');expect((await POST(new Request('https://helix.test/api/internal/lifecycle-campaigns',{method:'POST'}))).status).toBe(503);
 vi.stubEnv('HELIX_EMAIL_DISPATCH_SECRET','s'.repeat(32));expect((await POST(new Request('https://helix.test/api/internal/lifecycle-campaigns',{method:'POST',headers:{authorization:'Bearer wrong'}}))).status).toBe(401);expect(m.run).not.toHaveBeenCalled();
 m.run.mockResolvedValue({admitted:0,deferred:0});const response=await POST(new Request('https://helix.test/api/internal/lifecycle-campaigns',{method:'POST',headers:{authorization:'Bearer '+'s'.repeat(32)}}));expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toContain('no-store');expect(m.run).toHaveBeenCalledTimes(1);
});
