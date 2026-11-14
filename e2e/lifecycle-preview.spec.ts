import {expect,test} from './storefront-fixture';
for(const width of [390,1440]){
 test(`synthetic lifecycle previews stay white and isolated at ${width}px`,async({page},testInfo)=>{
  await page.setViewportSize({width,height:900});await page.emulateMedia({colorScheme:'light'});
  const unexpected:string[]=[];
  await page.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(url.pathname==='/api/cart'&&!url.search&&req.method()==='GET')return route.fulfill({json:{count:0,lines:[],subtotal:0,currency:'USD'}});
   if(url.pathname.startsWith('/api/')||!['GET','HEAD'].includes(req.method())){unexpected.push(`${req.method()} ${url.pathname}`);return route.abort();}
   return route.fallback();
  });
  await page.clock.install();await page.goto('/helix-verification/lifecycle');
  await expect(page.getByRole('heading',{name:'Lifecycle email and welcome popup preview'})).toBeVisible();
  for(const kind of ['welcome','cart','browse','review_winback']){
   const iframe=page.locator(`iframe[title="lifecycle_${kind} email"]`);
   const frame=page.frameLocator(`iframe[title="lifecycle_${kind} email"]`);
   await expect(frame.locator('h1')).toBeVisible();
   await expect(frame.locator('img[alt="helix"]')).toBeVisible();
   expect(await frame.locator('img').evaluate(el=>(el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
   expect(await frame.locator('h1').evaluate(async el=>{await el.ownerDocument.fonts.load('32px Marcellus');return el.ownerDocument.fonts.check('32px Marcellus');})).toBe(true);
   const result=await frame.locator('body').evaluate(body=>{
    const doc=body.ownerDocument;
    return {backgrounds:[doc.documentElement,body,...doc.querySelectorAll('table,td,main')].map(el=>getComputedStyle(el).backgroundColor),ink:getComputedStyle(body).color,links:[...doc.querySelectorAll('a')].map(el=>getComputedStyle(el).color),overflow:doc.documentElement.scrollWidth>doc.documentElement.clientWidth,hrefs:doc.querySelectorAll('[href]').length,height:doc.documentElement.scrollHeight};
   });
   expect(result.backgrounds.every(c=>c==='rgb(255, 255, 255)')).toBe(true);
   expect(result.ink).toBe('rgb(23, 23, 23)');expect(result.links.every(c=>c==='rgb(23, 23, 23)')).toBe(true);
   // #171717 on white is >17:1, above WCAG AA 4.5:1.
   expect(result.overflow).toBe(false);expect(result.hrefs).toBe(0);expect(result.height).toBeLessThanOrEqual(await iframe.evaluate(el=>(el as HTMLIFrameElement).clientHeight));
   await iframe.screenshot({path:testInfo.outputPath(`${kind}-${width}.png`)});
  }
  const reset=page.getByRole('button',{name:'Start / reset popup preview'});await reset.click();await page.clock.fastForward(13000);
  const dialog=page.getByRole('dialog',{name:'Your first step. 15% off.'});await expect(dialog).toBeVisible();
  await dialog.getByRole('textbox',{name:'Email address'}).fill('synthetic@example.test');await dialog.getByRole('checkbox').check();await dialog.getByRole('button',{name:'Join the list'}).click();
  await expect(dialog.getByRole('status')).toContainText('If this address is eligible');await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
  await expect(reset).toBeFocused();await reset.click();await page.clock.fastForward(13000);await expect(dialog.getByRole('textbox')).toHaveValue('');await expect(dialog.getByRole('checkbox')).not.toBeChecked();
  await dialog.screenshot({path:testInfo.outputPath(`popup-${width}.png`)});
  expect(await page.evaluate(()=>Object.values(localStorage).some(v=>v.includes('synthetic@example.test')))).toBe(false);expect(unexpected).toEqual([]);
 });
}
