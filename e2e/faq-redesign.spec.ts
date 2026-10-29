import { expect, test } from './storefront-fixture';
import { expectNoMainOverflow } from './layout-assertions';
import { FAQ_HERO_IMAGE } from '@/lib/content/faq-hero';

test('FAQ matches System hero and has responsive single-title islands', async ({ page }, testInfo) => {
  for (const width of [320, 390, 720, 760, 761, 1024, 1440]) {
    const height = width <= 760 ? 844 : width === 1024 ? 900 : 1000;
    await page.setViewportSize({ width, height });
    await page.goto('/faq');
    const hero = page.locator('.system-hero');
    await expect(hero.getByRole('heading', { level: 1 })).toHaveText('In case you were wondering...');
    const dimensions = await hero.evaluate((element) => {
      const surface = element.querySelector('.system-hero__surface')!.getBoundingClientRect();
      const title = element.querySelector('h1')!;
      return { hero: element.getBoundingClientRect().height, surface: surface.height,
        left: surface.left, right: window.innerWidth - surface.right,
        font: getComputedStyle(title).fontSize };
    });
    expect(dimensions.hero).toBeCloseTo(height - 64, 0);
    expect(Math.abs(dimensions.left - dimensions.right)).toBeLessThan(1);
    if (width === 1440) expect(dimensions.font).toBe('24px');
    if (width === 1024) expect(dimensions.font).toBe('18px');
    const image = hero.locator('img');
    await expect(image).toHaveCSS('object-position', width <= height ? '85% 50%' : '50% 15%');
    await expect.poll(() => image.evaluate((element: HTMLImageElement) =>
      element.complete && element.naturalWidth > 0 && element.naturalHeight > 0,
    )).toBe(true);
    const loaded = await image.evaluate((element: HTMLImageElement) => ({
      source: new URL(element.currentSrc, location.href).searchParams.get('url'),
      ratio: element.naturalWidth / element.naturalHeight,
    }));
    expect(loaded.source).toBe(FAQ_HERO_IMAGE);
    expect(loaded.ratio).toBeCloseTo(2160 / 1216, 2);
    const titles = page.locator('.faq-category h2');
    await expect(titles).toHaveCount(8);
    await expect(page.locator('.faq-category .eyebrow')).toHaveCount(0);
    const fits = await titles.evaluateAll((elements) => elements.every((element) => element.scrollWidth <= element.clientWidth));
    expect(fits).toBe(true);
    await expectNoMainOverflow(page, width);
    if (width === 390 || width === 1440) {
      await page.screenshot({ path: testInfo.outputPath(`faq-${width}-hero.png`) });
      await page.locator('#products').scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath(`faq-${width}-islands.png`) });
    }
  }
});

test('desktop FAQ tracks scrolling, native fragments and history', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/faq#shipping');
  const nav = page.getByRole('navigation', { name: 'FAQ categories' });
  await expect(nav.getByRole('link', { name: 'Shipping', exact: true })).toHaveAttribute('aria-current', 'location');
  await page.locator('#accounts').evaluate((element) => element.scrollIntoView());
  await expect(nav.getByRole('link', { name: 'Accounts', exact: true })).toHaveAttribute('aria-current', 'location');
  await expect(page).toHaveURL(/#shipping$/); // Scrolling does not add history entries.
  await nav.getByRole('link', { name: 'Products', exact: true }).click();
  await expect(page).toHaveURL(/#products$/);
  await nav.getByRole('link', { name: 'Policies', exact: true }).click();
  await expect(page).toHaveURL(/#policies$/);
  await page.goBack();
  await expect(page).toHaveURL(/#products$/);
  await expect(nav.getByRole('link', { name: 'Products', exact: true })).toHaveAttribute('aria-current', 'location');
  await page.goForward();
  await expect(page).toHaveURL(/#policies$/);
  await expect(nav.getByRole('link', { name: 'Policies', exact: true })).toHaveAttribute('aria-current', 'location');
  await page.reload();
  await expect(page).toHaveURL(/#policies$/);
  await expect(nav.getByRole('link', { name: 'Policies', exact: true })).toHaveAttribute('aria-current', 'location');
});

test('FAQ disclosure reverses motion, follows native state and settles reduced motion', async ({ page }) => {
  await page.goto('/faq#products');
  const details = page.locator('#products details').nth(1);
  const summary = details.locator('summary');
  const closedHeight = (await details.boundingBox())!.height;
  await summary.focus();
  await summary.press('Enter');
  await expect(summary).toHaveAttribute('aria-expanded', 'true');
  await expect.poll(() => details.evaluate((element) => element.getAnimations().length)).toBeGreaterThan(0);
  await summary.press('Space');
  await expect(summary).toHaveAttribute('aria-expanded', 'false');
  await expect(details.locator('> div')).toHaveAttribute('inert', '');
  await summary.press('Enter');
  await expect(details).toHaveAttribute('open', '');
  await expect(summary.locator('span[aria-hidden]')).toHaveCSS('transform', 'none');
  await expect.poll(() => details.evaluate((element) => element.getAnimations().length)).toBe(0);
  expect(await details.evaluate((element) => (element as HTMLElement).style.height)).toBe('');
  expect((await details.boundingBox())!.height).toBeGreaterThan(closedHeight + 20);
  const link = details.getByRole('link', { name: 'Shop the system' });
  await link.focus();
  await summary.evaluate((element) => (element as HTMLElement).click());
  await expect(summary).toBeFocused();
  await expect(summary).toHaveAttribute('aria-expanded', 'false');
  await expect(details.getByRole('link')).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(details).not.toHaveAttribute('open');
  await expect(details.locator('> div')).not.toHaveAttribute('inert');
  await expect.poll(() => details.evaluate((element) => element.getAnimations().length)).toBe(0);
  await details.evaluate((element) => { (element as HTMLDetailsElement).open = true; });
  await expect(summary).toHaveAttribute('aria-expanded', 'true');
  await expect(details.locator('> div')).not.toHaveAttribute('inert');
  await summary.press('Space');
  await expect(details).not.toHaveAttribute('open');
  await expect(summary).toHaveAttribute('aria-expanded', 'false');
});

test('FAQ native disclosures work without JavaScript', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  try {
    await page.goto(`${baseURL}/faq#products`);
    const details = page.locator('#products details').first();
    const summary = details.locator('summary');
    await expect(summary).not.toHaveAttribute('aria-expanded');
    await summary.focus();
    await summary.press('Enter');
    await expect(details).not.toHaveAttribute('open');
    await summary.press('Space');
    await expect(details).toHaveAttribute('open', '');
    await expect(details.locator('p')).toBeVisible();
  } finally { await context.close(); }
});
