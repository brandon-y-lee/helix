import {afterEach,expect,it,vi} from 'vitest';
import {renderLifecyclePreviews} from '@/app/helix-verification/lifecycle/render-preview';
vi.mock('next/navigation',()=>({notFound:()=>{throw new Error('404');}}));
afterEach(()=>vi.unstubAllEnvs());
it('renders all actual templates without network, real identities or operative links',async()=>{
 const network=vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('No network'));
 const previews=await renderLifecyclePreviews();
 expect(previews).toHaveLength(4);
 for(const p of previews){expect(p.html).not.toMatch(/\{\{|href=|<script/i);expect(p.html).toContain('#ffffff');expect(p.text).toContain('[non-operative preview link]');}
 expect(previews.find(p=>p.purpose==='lifecycle_review_winback')?.text).toContain('whether or not you leave a review');
 expect(network).not.toHaveBeenCalled();network.mockRestore();
});
it('rejects hosted and gate-off route before rendering',async()=>{
 const {default:page}=await import('@/app/helix-verification/lifecycle/page');
 vi.stubEnv('VERCEL','1');vi.stubEnv('HELIX_VERIFICATION_ADAPTER','1');await expect(page()).rejects.toThrow('404');
 vi.stubEnv('VERCEL','');vi.stubEnv('HELIX_VERIFICATION_ADAPTER','0');await expect(page()).rejects.toThrow('404');
});

it('serves the isolated welcome preview with restrictive headers only behind the local gate',async()=>{
 const {GET}=await import('@/app/helix-verification/lifecycle/welcome/route');
 vi.stubEnv('VERCEL','1');vi.stubEnv('HELIX_VERIFICATION_ADAPTER','1');expect((await GET()).status).toBe(404);
 vi.stubEnv('VERCEL','');vi.stubEnv('HELIX_VERIFICATION_ADAPTER','0');expect((await GET()).status).toBe(404);
 vi.stubEnv('HELIX_VERIFICATION_ADAPTER','1');const response=await GET();
 expect(response.status).toBe(200);expect(response.headers.get('content-type')).toContain('text/html');
 expect(response.headers.get('cache-control')).toBe('no-store');expect(response.headers.get('x-robots-tag')).toContain('noindex');
 expect(response.headers.get('content-security-policy')).toContain("default-src 'none'");
 const html=await response.text();expect(html).toContain('Start with your skin.');expect(html).not.toMatch(/href=|<script/);
});
