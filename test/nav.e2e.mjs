// Browser test for the sticky step bar: after clicking a tab, that tab must be highlighted
// immediately, after the scroll settles, and after a 1px nudge. Clicks go in order, in reverse
// and mixed, at desktop and phone widths and with reduced motion. Run: npm run test:nav
//
// Named .e2e.mjs, not .spec/.test, so Vitest doesn't collect it.
// The page is served from disk through request routing, so no local server is needed.
// If Playwright's own browser isn't installed, set CHROMIUM_PATH to a Chromium executable,
// or run `npx playwright install chromium`.
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
let failures = 0;

const runs = [
  ['desktop', { width: 1280, height: 800 }, 'no-preference'],
  ['phone', { width: 390, height: 844 }, 'no-preference'],
  ['desktop reduced', { width: 1280, height: 800 }, 'reduce'],
];

for (const [label, viewport, reducedMotion] of runs) {
  const page = await browser.newPage({ viewport, reducedMotion });
  await page.route('http://app.test/**', async (route) => {
    let path = new URL(route.request().url()).pathname;
    if (path === '/') path = '/index.html';
    try {
      const body = await readFile(join(root, path));
      await route.fulfill({ body, contentType: types[extname(path)] ?? 'application/octet-stream' });
    } catch {
      await route.fulfill({ status: 404 });
    }
  });
  page.on('pageerror', (e) => {
    console.log('PAGE ERROR', e.message);
    failures++;
  });
  await page.goto('http://app.test/');
  await page.waitForSelector('#steps a[data-step]');
  const steps = await page.$$eval('#steps a[data-step]', (as) => as.map((a) => a.dataset.step));
  const orders = [steps, [...steps].reverse(), [steps[0], steps[3], steps[1], steps[2], steps[0]]];
  for (const order of orders) {
    for (const step of order) {
      await page.click(`#steps a[data-step="${step}"]`);
      const immediate = await page.$eval('#steps a[aria-current]', (a) => a.dataset.step);
      await page.waitForTimeout(1500);
      const settled = await page.$eval('#steps a[aria-current]', (a) => a.dataset.step);
      // A small scroll after settling must not flip it either: the scroll-spy agrees with where the jump landed.
      await page.mouse.wheel(0, 1);
      await page.waitForTimeout(300);
      const nudged = await page.$eval('#steps a[aria-current]', (a) => a.dataset.step);
      const atBottom = await page.evaluate(() => innerHeight + scrollY >= document.documentElement.scrollHeight - 2);
      const ok = immediate === step && settled === step && (nudged === step || (atBottom && nudged === steps.at(-1)));
      if (!ok) failures++;
      console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: ${step} -> immediate ${immediate}, settled ${settled}, nudged ${nudged}${atBottom ? ' (at bottom)' : ''}`);
    }
  }
  await page.close();
}

await browser.close();
console.log(failures ? `${failures} failures` : 'all passed');
process.exit(failures ? 1 : 0);
