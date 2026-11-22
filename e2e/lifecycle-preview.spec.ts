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
  await page.goto('/helix-verification/lifecycle');
  await expect(page.getByRole('heading',{name:'Lifecycle email previews'})).toBeVisible();
  for(const kind of ['welcome','cart','browse','review_winback']){
   const iframe=page.locator(`iframe[title="lifecycle_${kind} email"]`);
   const frame=page.frameLocator(`iframe[title="lifecycle_${kind} email"]`);
   await expect(frame.locator('h1')).toBeVisible();
   await expect(frame.locator('img[alt="helix"]')).toBeVisible();
   for(const img of await frame.locator('img').all()) {
    await expect(img).toBeVisible();
    await expect.poll(()=>img.evaluate(el=>(el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
   }
   if(kind==='welcome'){
    await expect(frame.getByRole('link',{name:'START YOUR HELIX RITUAL'})).toBeVisible();
    // Images blocked: the offer, deadline and action remain live readable HTML.
    await frame.locator('img').evaluateAll(images=>images.forEach(img=>(img as HTMLElement).style.visibility='hidden'));
    await expect(frame.getByRole('heading',{name:'Welcome to helix.'})).toBeVisible();
    await expect(frame.getByText('Use your offer by', {exact:false})).toBeVisible();
    await frame.locator('img').evaluateAll(images=>images.forEach(img=>(img as HTMLElement).style.visibility='visible'));
   }
   expect(await frame.locator('h1').evaluate(async el=>{await el.ownerDocument.fonts.load('32px Marcellus');return el.ownerDocument.fonts.check('32px Marcellus');})).toBe(true);
   const result=await frame.locator('body').evaluate(body=>{
    const doc=body.ownerDocument;
    return {backgrounds:[doc.documentElement,body,...doc.querySelectorAll('table,td,main')].map(el=>getComputedStyle(el).backgroundColor),ink:getComputedStyle(body).color,links:[...doc.querySelectorAll('a')].map(el=>getComputedStyle(el).color),overflow:doc.documentElement.scrollWidth>doc.documentElement.clientWidth,hrefs:doc.querySelectorAll('[href]').length,height:doc.documentElement.scrollHeight};
   });
   expect(result.backgrounds.every(c=>c==='rgb(255, 255, 255)')).toBe(true);
   expect(result.ink).toBe('rgb(98, 99, 94)');expect(result.links.every(c=>c==='rgb(98, 99, 94)')).toBe(true);
   // #62635e on white is >6:1, above WCAG AA 4.5:1.
   expect(result.overflow).toBe(false);expect(result.hrefs).toBe(0);expect(result.height).toBeLessThanOrEqual(await iframe.evaluate(el=>(el as HTMLIFrameElement).clientHeight));
   await iframe.screenshot({path:testInfo.outputPath(`${kind}-${width}.png`)});
  }
  expect(unexpected).toEqual([]);
  await page.goto('/helix-verification/lifecycle/welcome');
  await expect(page.getByRole('heading',{name:'Start with your skin.'})).toBeVisible();
  for(const img of await page.locator('img').all())await expect.poll(()=>img.evaluate(el=>(el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
  await page.screenshot({path:testInfo.outputPath(`welcome-isolated-${width}.png`),fullPage:true});
 });
}
