
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

import { chromium } from 'playwright-core';

const root = resolve(import.meta.dirname, '..');
const dirArg = process.argv.indexOf('--dir');
const dist = resolve(root, dirArg < 0 ? 'dist' : process.argv[dirArg + 1]);
const seconds = Number((process.argv.find((a) => a.startsWith('--seconds=')) ?? '=4').split('=')[1]);
const shotArg = process.argv.find((a) => a.startsWith('--shot='));

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webp': 'image/webp',
  '.webm': 'audio/webm',
  '.ogg': 'audio/ogg',
  '.txt': 'text/plain; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.cmb': 'application/octet-stream',
};

const serve = () =>
  new Promise((ready) => {
    const server = createServer((req, res) => {
      const path = decodeURIComponent((req.url ?? '/').split('?')[0]);
      const file = resolve(dist, `.${path}`.replace(/^\.\/+/, './'));
      const target =
        file.startsWith(dist) && existsSync(file) && statSync(file).isFile()
          ? file
          : join(dist, 'index.html');
      if (!existsSync(target)) {
        res.statusCode = 404;
        res.end('missing');
        return;
      }
      res.setHeader('Content-Type', TYPES[extname(target)] ?? 'application/octet-stream');
      res.end(readFileSync(target));
    });
    server.listen(0, '127.0.0.1', () =>
      ready({ server, port: /** @type {import('node:net').AddressInfo} */ (server.address()).port }),
    );
  });

const { server, port } = await serve();
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--disable-blink-features=AutomationControlled'],
});

const humanUA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const maskAutomation = (context) =>
  context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, userAgent: humanUA });
await maskAutomation(page.context());

const errors = [];
const failed = [];
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
page.on('requestfailed', (request) => failed.push(request.url()));
page.on('response', (response) => {
  if (response.status() >= 400) failed.push(`${response.status()} ${response.url()}`);
});

const fail = async (message) => {
  await browser.close();
  server.close();
  console.error(`Opaque smoke FAILED: ${message}`);
  if (errors.length > 0) console.error(`  console:\n    ${errors.slice(0, 10).join('\n    ')}`);
  if (failed.length > 0) console.error(`  requests:\n    ${failed.slice(0, 10).join('\n    ')}`);
  process.exit(1);
};

await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });

const play = page.locator('#gate-play');
if (await play.isVisible().catch(() => false)) {
  await play.click();
}

await page.waitForTimeout(1200);

const box = await page.locator('#view').boundingBox();
await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.556);
await page.waitForTimeout(600);
await page.keyboard.down('w');
await page.waitForTimeout(400);
await page.keyboard.up('w');
for (const key of ['j', 'k', 'l', ' ']) {
  await page.keyboard.press(key);
  await page.waitForTimeout(180);
}
await page.waitForTimeout(seconds * 1000);

const observed = await page.evaluate(() => {
  const canvas = /** @type {HTMLCanvasElement | null} */ (document.getElementById('view'));
  if (!canvas) return { canvas: false };
  const probe = document.createElement('canvas');
  probe.width = canvas.width;
  probe.height = canvas.height;
  const pctx = /** @type {CanvasRenderingContext2D} */ (probe.getContext('2d'));
  pctx.drawImage(canvas, 0, 0);
  const { data } = pctx.getImageData(0, 0, probe.width, probe.height);
  const seen = new Set();
  let lit = 0;
  for (let i = 0; i < data.length; i += 4 * 97) {
    const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    seen.add(key);
    if (data[i] + data[i + 1] + data[i + 2] > 40) lit += 1;
  }
  return {
    canvas: true,
    width: canvas.width,
    height: canvas.height,
    colors: seen.size,
    lit,
    frames: Number(document.documentElement.dataset.runFrames ?? -1),
  };
});

if (shotArg) await page.screenshot({ path: resolve(root, shotArg.split('=')[1]) });

const spinning = await page.evaluate(
  () =>
    new Promise((done) => {
      let n = 0;
      const tick = () => (n < 12 ? (n += 1, requestAnimationFrame(tick)) : done(n));
      requestAnimationFrame(tick);
      setTimeout(() => done(n), 1500);
    }),
);

let decoyVerdict = 'n/a';
if (dist.endsWith('dist-opaque')) {
  const botPage = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await botPage.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
  await botPage.waitForTimeout(1800);
  const botColors = await botPage.evaluate(() => {
    const canvas = /** @type {HTMLCanvasElement | null} */ (document.getElementById('view'));
    if (!canvas) return -1;
    const probe = document.createElement('canvas');
    probe.width = canvas.width;
    probe.height = canvas.height;
    const c = /** @type {CanvasRenderingContext2D} */ (probe.getContext('2d'));
    c.drawImage(canvas, 0, 0);
    const { data } = c.getImageData(0, 0, probe.width, probe.height);
    const seen = new Set();
    for (let i = 0; i < data.length; i += 4 * 97) seen.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
    return seen.size;
  });
  await botPage.close();
  if (botColors > 120) {
    decoyVerdict = `LEAKED: game appears to have booted under automation (${botColors} colours)`;
    await fail(`decoy did not fire: ${decoyVerdict}`);
  }
  decoyVerdict = `decoy held (${botColors} colours under automation vs ${observed.colors} for a real session)`;
}

await browser.close();
server.close();

if (!observed.canvas) await fail('no #view canvas in the document');
if (observed.colors < 8) await fail(`canvas drew ${observed.colors} distinct colours — blank screen`);
if (observed.lit < 40) await fail(`canvas is dark: ${observed.lit} lit samples`);
if (spinning < 12) await fail(`frame loop stalled at ${spinning} frames`);
if (errors.length > 0) await fail(`console errors:\n  ${errors.slice(0, 8).join('\n  ')}`);
if (failed.length > 0) await fail(`failed requests:\n  ${failed.slice(0, 8).join('\n  ')}`);

console.log(
  `Opaque smoke passed (${dist.replace(`${root}/`, '')}): ` +
    `${observed.width}x${observed.height}, ${observed.colors} colours, ${observed.lit} lit samples, rAF alive.\n` +
    `  decoy: ${decoyVerdict}`,
);
