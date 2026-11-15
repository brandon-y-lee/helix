import {expect,it} from 'vitest';
import {lifecycleTemplateSources} from '@/lib/marketing/lifecycle-template-sources';
import before from './fixtures/lifecycle-before-editorial.json';
it('preserves other three campaigns byte-for-byte',()=>{
 for(const [purpose,source] of Object.entries(before)) expect(lifecycleTemplateSources[purpose as keyof typeof lifecycleTemplateSources]).toEqual(source);
});
it('welcome uses accessible editorial images and live offer content without changing the destination or terms',()=>{
 const {html,text}=lifecycleTemplateSources.lifecycle_welcome;
 const doc=new DOMParser().parseFromString(html,'text/html');
 expect(doc.documentElement.lang).toBe('en');
 expect(doc.querySelector('h1')?.textContent).toBe('Start with your skin.');
 expect(doc.querySelectorAll('img')).toHaveLength(3);
 for(const img of doc.querySelectorAll('img')){expect(img.alt).not.toBe('');expect(img.width).toBeGreaterThan(0);expect(img.height).toBeGreaterThan(0);expect(img.src).toMatch(/\.(png|jpg)$/);expect(img.getAttribute('src')).toMatch(/^\{\{\{HELIX_SITE_ORIGIN\}\}\}\//);}
 expect([...doc.querySelectorAll('a')].map(a=>a.getAttribute('href'))).toEqual(['{{{HELIX_CART_URL}}}','{{{HELIX_PREFERENCES_URL}}}']);
 expect(doc.querySelector('a')?.textContent).toBe('View your offer in cart');
 for(const key of ['HELIX_OFFER_PERCENT','HELIX_OFFER_TERMS','HELIX_OFFER_EXPIRES_LABEL','HELIX_POSTAL_ADDRESS']){expect(doc.body.textContent).toContain(`{{{${key}}}}`);expect(text).toContain(`{{{${key}}}}`);}
 for(const table of doc.querySelectorAll('table'))expect(table.getAttribute('role')).toBe('presentation');
 expect(html).not.toMatch(/<script|box-shadow|prefers-color-scheme/);
});
