
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { flag, listArg, valueArg } from './lib/args.mjs';

const root = resolve(import.meta.dirname, '..');
const OUT = resolve(root, 'runs/sfx-candidates');
const UA = 'Mozilla/5.0 (crown-lab audition shortlist)';
const GAP_MS = 700;

const QUERIES = {
  light: ['sword swing air', 'blade swish'],
  heavy: ['heavy sword swing', 'greatsword swing air'],
  hit: ['sword impact flesh', 'blade hit body'],
  parry: ['sword clash', 'sword parry metal'],
  guard: ['shield block impact', 'shield hit wood'],
  unparryable: ['heavy stone impact thud', 'boulder drop impact'],
  step: ['armor footstep stone', 'boot step gravel'],
  stagger: ['body fall armor', 'metal scrape stone'],
  death: ['armor body fall clatter', 'knight fall metal'],
  player_hurt: ['punch body impact', 'blunt body hit'],
  power: ['tesla coil arc', 'high voltage electrical discharge', 'capacitor discharge sustained'],
  power_hit: ['electrical short circuit spark', 'arc welder strike', 'high voltage zap crack'],
  wave: ['army footsteps march', 'crowd footsteps stone'],
  slowmo: ['metal groan drone', 'low rumble drone'],
};

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/**
 * Preview URLs from one Freesound search page, best quality first.
 *
 * Scraped rather than taken from the API because the API needs a token and this needs to work today.
 * That makes it fragile by construction: if Freesound changes its markup this returns nothing, which
 * is why an empty cue is reported rather than silently skipped.
 * @param {string} query
 * @param {boolean} cc0
 */
const search = async (query, cc0) => {
  const url =
    `https://freesound.org/search/?q=${encodeURIComponent(query)}` +
    (cc0 ? `&f=${encodeURIComponent('license:"Creative Commons 0"')}` : '');
  const res = await fetch(url, { headers: { 'user-agent': UA } }).catch(() => null);
  if (res === null || !res.ok) return [];
  const html = await res.text();
  const found = [...html.matchAll(/https:\/\/cdn\.freesound\.org\/previews\/[^"']+?-lq\.mp3/g)].map((m) => m[0]);
  const byId = new Map();
  for (const preview of found) {
    const id = /previews\/\d+\/(\d+)_/.exec(preview)?.[1];
    if (id !== undefined && !byId.has(id)) byId.set(id, preview.replace('-lq.mp3', '-hq.mp3'));
  }
  return [...byId.entries()];
};

const main = async () => {
  const only = listArg('only', null);
  const per = Number(valueArg('per', '4'));
  const cc0 = !flag('any-licence');
  await mkdir(OUT, { recursive: true });

  console.log(`${cc0 ? 'CC0 only' : 'any licence'}, up to ${per} candidates per cue → runs/sfx-candidates/\n`);
  const thin = [];
  let total = 0;

  for (const [cue, queries] of Object.entries(QUERIES)) {
    if (only !== null && !only.includes(cue)) continue;
    /** @type {Map<string, string>} */
    const picks = new Map();
    for (const query of queries) {
      if (picks.size >= per) break;
      for (const [id, url] of await search(query, cc0)) {
        if (picks.size >= per) break;
        if (!picks.has(id)) picks.set(id, url);
      }
      await sleep(GAP_MS);
    }
    let got = 0;
    for (const [id, url] of picks) {
      const name = `${cue}-${id}.mp3`;
      const res = await fetch(url, { headers: { 'user-agent': UA } }).catch(() => null);
      const body = res !== null && res.ok ? res : await fetch(url.replace('-hq.mp3', '-lq.mp3'), { headers: { 'user-agent': UA } }).catch(() => null);
      if (body === null || !body.ok) continue;
      const bytes = Buffer.from(await body.arrayBuffer());
      if (bytes.length === 0) continue;
      await writeFile(resolve(OUT, name), bytes);
      got += 1;
      total += 1;
      await sleep(GAP_MS);
    }
    console.log(`  ${cue.padEnd(13)} ${got}`);
    if (got === 0) thin.push(cue);
  }

  if (thin.length > 0) {
    console.warn(`\n  ⚠ nothing found for: ${thin.join(', ')}`);
    console.warn('    try --any-licence, or edit QUERIES in this file — the query is the judgement');
  }
  console.log(`\n${total} candidates. hear them:\n  npm run audio:audition -- --dir=runs/sfx-candidates`);
};

await main();
