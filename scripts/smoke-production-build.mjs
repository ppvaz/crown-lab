import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const index = process.argv.indexOf('--dir');
const dist = resolve(root, index < 0 ? 'dist' : process.argv[index + 1]);
const assets = join(dist, 'assets');
const gameChunks = readdirSync(assets).filter((file) => /^game-[^/]+\.js$/.test(file));
if (gameChunks.length !== 1) {
  throw new Error(`Expected exactly one public game chunk, found ${gameChunks.length}.`);
}

const frames = [];
let now = 0;
let fills = 0;
const context = new Proxy(
  {
    canvas: { width: 1280, height: 720 },
    measureText: () => ({ width: 12 }),
    setTransform: () => {},
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
    fillRect: () => {
      fills += 1;
    },
  },
  {
    get(target, property) {
      return property in target ? target[property] : () => {};
    },
    set(target, property, value) {
      target[property] = value;
      return true;
    },
  },
);
const canvas = {
  clientWidth: 1280,
  clientHeight: 720,
  width: 1280,
  height: 720,
  getContext: () => context,
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }),
  addEventListener: () => {},
  removeEventListener: () => {},
};

globalThis.document = /** @type {any} */ ({
  getElementById: (id) => (id === 'view' ? canvas : null),
  body: { classList: { add: () => {} } },

  querySelector: () => null,
  querySelectorAll: () => [],
});
globalThis.window = /** @type {any} */ ({
  devicePixelRatio: 1,
  addEventListener: () => {},
  removeEventListener: () => {},
});




globalThis.location = /** @type {any} */ ({
  protocol: 'http:',
  host: 'localhost',
  hostname: 'localhost',
  origin: 'http://localhost',
  href: 'http://localhost/?play',
  pathname: '/',
  search: '?play',
});
globalThis.performance = /** @type {any} */ ({ now: () => now });
globalThis.requestAnimationFrame = (callback) => {
  frames.push(callback);
  return frames.length;
};

await import(pathToFileURL(join(assets, gameChunks[0])).href);
if (frames.length !== 1) throw new Error('Public artifact did not schedule its first frame.');

for (let frame = 0; frame < 480; frame += 1) {
  now += 16.7;
  const next = frames.shift();
  if (next === undefined) throw new Error('Public artifact stopped scheduling frames.');
  next(now);
}

if (fills === 0) throw new Error('Public artifact ran but did not render.');
if (frames.length !== 1) throw new Error('Public artifact scheduled an unexpected frame count.');
console.log(`Production game smoke passed: ${gameChunks[0]}, ${fills} canvas fills.`);
