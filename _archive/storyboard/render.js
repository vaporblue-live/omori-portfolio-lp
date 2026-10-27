const { chromium } = require('playwright');
(async () => {
  const dir = process.env.D;
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
  await page.goto('http://localhost:8790/storyboard.html', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__glReady === true, null, { timeout: 120000 });
  console.log('font check:', await page.evaluate(() => document.fonts.check('800 20px "Shippori Mincho B1"')));
  await page.screenshot({ path: dir + '/storyboard-full.png', fullPage: true });
  for (const id of ['f0','f1','f2','f3','f4','f5']) await page.locator('#' + id).screenshot({ path: `${dir}/${id}.png` });
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
