import {renderLifecyclePreviews} from '../render-preview';
export const dynamic='force-dynamic';
export async function GET(){
 if(process.env.VERCEL || process.env.HELIX_VERIFICATION_ADAPTER!=='1') return new Response('Not found',{status:404});
 const preview=(await renderLifecyclePreviews()).find(p=>p.purpose==='lifecycle_welcome');
 if(!preview) return new Response('Not found',{status:404});
 return new Response(preview.html,{headers:{
  'Content-Type':'text/html; charset=utf-8',
  'Cache-Control':'no-store',
  'X-Robots-Tag':'noindex, nofollow',
  'Content-Security-Policy':"default-src 'none'; img-src 'self'; font-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
 }});
}
