import { expect, it } from 'vitest';
import { lifecycleTemplateSources } from '@/lib/marketing/lifecycle-template-sources';
import before from './fixtures/lifecycle-copy-before-white-theme.json';
for (const [purpose,source] of Object.entries(lifecycleTemplateSources)) {
 it(`${purpose} preserves approved words and contracts while using white-only surfaces`,()=>{
  const original=before[purpose as keyof typeof before];
  expect(source.subject).toBe(original.subject);expect(source.text).toBe(original.text.replaceAll('HELIX_OFFER_EXPIRES_AT','HELIX_OFFER_EXPIRES_LABEL').replaceAll('Offer expires:','Use your offer by'));
  expect(source.html.replace(/<style>[\s\S]*?<\/style>/g,'').replace(/<[^>]*>/g,'')).toBe(original.words.replace('helixhelix','helix').replaceAll('HELIX_OFFER_EXPIRES_AT','HELIX_OFFER_EXPIRES_LABEL').replaceAll('Offer expires:','Use your offer by'));
  expect(source.html.match(/\{\{\{[^}]+\}\}\}/g)?.filter(v=>v!=='{{{HELIX_SITE_ORIGIN}}}')).toEqual(original.variables.map(v=>v.replace('HELIX_OFFER_EXPIRES_AT','HELIX_OFFER_EXPIRES_LABEL')));
  const doc=new DOMParser().parseFromString(source.html,'text/html');
  for (const element of [doc.documentElement,doc.body,...doc.querySelectorAll('table,td,main')]) {
   expect((element as HTMLElement).style.backgroundColor).toBe('rgb(255, 255, 255)');
  }
  expect(doc.querySelector('img')?.getAttribute('src')).toContain('/brand/helix-wordmark-email.png');
  expect((doc.querySelector('h1') as HTMLElement).style.fontFamily).toBe('Marcellus, Georgia, serif');
  for(const link of doc.querySelectorAll('a')) expect(link.style.color).toBe('rgb(23, 23, 23)');
  expect(doc.body.style.color).toBe('rgb(23, 23, 23)');
  expect(source.html).not.toMatch(/#f4f3ef|prefers-color-scheme|color-scheme|mix-blend|box-shadow|@media/i);
 });
}
