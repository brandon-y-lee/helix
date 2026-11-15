import {expect,it} from 'vitest';
import {lifecycleTemplateSources} from '@/lib/marketing/lifecycle-template-sources';
it('welcome follows the approved profile, macro, portrait and still-life sequence',()=>{
 const {html,text}=lifecycleTemplateSources.lifecycle_welcome;
 const doc=new DOMParser().parseFromString(html,'text/html');
 expect([...doc.querySelectorAll('img')].map(i=>i.getAttribute('src')?.split('/').at(-1))).toEqual(['helix-wordmark-email.png','welcome-profile.jpg','welcome-macro.jpg','welcome-portrait.jpg','serum-still-life.jpg']);
 expect(doc.querySelector('h1')?.textContent).toBe('Start with your skin.');
 for(const key of ['HELIX_CART_URL','HELIX_OFFER_PERCENT','HELIX_OFFER_TERMS','HELIX_OFFER_EXPIRES_LABEL','HELIX_POSTAL_ADDRESS']) for(const body of [html,text]) expect(body).toContain(`{{{${key}}}}`);
 expect([...doc.querySelectorAll('a')].every(a=>['{{{HELIX_CART_URL}}}','{{{HELIX_PREFERENCES_URL}}}'].includes(a.getAttribute('href')??''))).toBe(true);
});
