import { expect, it } from 'vitest';
import { lifecycleTemplateSources } from '@/lib/marketing/lifecycle-template-sources';
for (const [purpose,source] of Object.entries(lifecycleTemplateSources)) {
 it(`${purpose} uses accessible white editorial surfaces and live contract fields`,()=>{
  const doc=new DOMParser().parseFromString(source.html,'text/html');
  expect(doc.documentElement.lang).toBe('en');
  for (const element of [doc.documentElement,doc.body,...doc.querySelectorAll('table,td')]) expect((element as HTMLElement).style.backgroundColor).toBe('rgb(255, 255, 255)');
  expect(doc.body.style.color).toBe('rgb(98, 99, 94)');
  expect(doc.querySelectorAll('h1')).toHaveLength(1);
  for(const table of doc.querySelectorAll('table')) expect(table.getAttribute('role')).toBe('presentation');
  for(const link of doc.querySelectorAll('a')) {expect(link.style.color).toBe('rgb(98, 99, 94)');expect(link.getAttribute('href')).toMatch(/^\{\{\{HELIX_\w+_URL\}\}\}$/);}
  for(const img of doc.querySelectorAll('img')) {expect(img.alt).not.toBe('');expect(img.width).toBeGreaterThan(0);expect(img.height).toBeGreaterThan(0);expect(img.getAttribute('src')).toMatch(/^\{\{\{HELIX_SITE_ORIGIN\}\}\}\/.*\.(png|jpg)$/);}
  for(const key of ['HELIX_PREFERENCES_URL','HELIX_POSTAL_ADDRESS',...(purpose==='lifecycle_browse'?['HELIX_PRODUCT_NAME','HELIX_PRODUCT_URL']:['HELIX_OFFER_PERCENT','HELIX_OFFER_TERMS','HELIX_OFFER_EXPIRES_LABEL'])]) for(const body of [source.html,source.text]) expect(body).toContain(`{{{${key}}}}`);
  expect(source.html+source.text).not.toMatch(/SAMPLE10|WELCOME15|December 14|design draft|sample code|links inert|<script|<button|prefers-color-scheme|mix-blend|box-shadow/i);
  expect(new TextEncoder().encode(source.html).length).toBeLessThan(102_000);
 });
}
it('uses the latest distinct campaign photos and keeps review and offer paths separate',()=>{
 expect(lifecycleTemplateSources.lifecycle_cart.html).toContain('/cart-portrait.jpg');
 expect(lifecycleTemplateSources.lifecycle_browse.html).toContain('/browse-portrait.jpg');
 expect(lifecycleTemplateSources.lifecycle_review_winback.html).toContain('/review-portrait.jpg');
 for(const body of [lifecycleTemplateSources.lifecycle_review_winback.html,lifecycleTemplateSources.lifecycle_review_winback.text]) {
  expect(body).toContain('whether or not you leave a review');expect(body).toContain('No review or positive rating required. Account sign-in required to redeem.');
  expect(body).toContain('{{{HELIX_REVIEW_URL}}}');expect(body).toContain('{{{HELIX_SHOP_URL}}}');
 }
 expect(lifecycleTemplateSources.lifecycle_browse.html+lifecycleTemplateSources.lifecycle_browse.text).not.toMatch(/HELIX_OFFER|% off|discount/i);
});
