

import { spawn } from 'node:child_process';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

import { cachePath } from './bundle-sim.mjs';
import { listArg, valueArg } from './lib/args.mjs';

const root = resolve(import.meta.dirname, '..');
const TARGET_DB = -1;
const AUDIO_SUBDIR = 'audition-audio';

const run = (cmd, args) =>
  new Promise((ok, fail) => {
    const child = spawn(cmd, args);
    let all = '';
    child.stdout.on('data', (d) => {
      all += d;
    });
    child.stderr.on('data', (d) => {
      all += d;
    });
    child.on('error', (e) => fail(new Error(`${cmd}: ${e.message}`)));
    child.on('close', (code) => (code === 0 ? ok(all) : fail(new Error(`${cmd} exited ${code}`))));
  });

const peakDb = async (path) => {
  const out = await run('ffmpeg', ['-hide_banner', '-i', path, '-af', 'volumedetect', '-f', 'null', '/dev/null']).catch(
    () => null,
  );
  const m = out === null ? null : /max_volume:\s*(-?[\d.]+) dB/.exec(out);
  return m === null ? null : Number(m[1]);
};

/**
 * Candidates from an arbitrary folder, grouped by the cue their filename names.
 *
 * Recursive, because a downloaded library arrives in nested folders and flattening it by hand is the
 * kind of chore that ends with half of it unheard.
 * @param {string} dir
 * @param {readonly string[]} cues
 */
const sourced = async (dir, cues) => {
  /** @type {Map<string, {pack: string, roll: number, path: string}[]>} */
  const byCue = new Map();
  const unmatched = [];
  /** @param {string} at */
  const walk = async (at) => {
    for (const entry of await readdir(at, { withFileTypes: true }).catch(() => [])) {
      const full = resolve(at, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      if (!/\.(wav|mp3|ogg|flac|aif|aiff|m4a)$/i.test(entry.name)) continue;
      const lower = entry.name.toLowerCase();
      const cue = [...cues].sort((a, b) => b.length - a.length).find((c) => lower.includes(c));
      if (cue === undefined) {
        unmatched.push(entry.name);
        continue;
      }
      const list = byCue.get(cue) ?? [];
      list.push({ pack: entry.name.replace(/\.[^.]+$/, ''), roll: list.length + 1, path: full });
      byCue.set(cue, list);
    }
  };
  await walk(dir);
  return { byCue, unmatched };
};

const takes = async () => {
  const base = cachePath('audio');
  const packs = await readdir(base, { withFileTypes: true }).catch(() => []);
  /** @type {Map<string, {pack: string, roll: number, path: string}[]>} */
  const byCue = new Map();
  for (const pack of packs.filter((d) => d.isDirectory())) {
    for (const name of await readdir(resolve(base, pack.name))) {
      const m = /^(.+)\.(\d+)\.mp3$/.exec(name);
      if (m === null) continue;
      const list = byCue.get(m[1]) ?? [];
      list.push({ pack: pack.name, roll: Number(m[2]), path: resolve(base, pack.name, name) });
      byCue.set(m[1], list);
    }
  }
  return byCue;
};

const main = async () => {
  const only = listArg('only', null);
  const dir = valueArg('dir', null);
  const CUES = [
    'light', 'heavy', 'hit', 'parry', 'guard', 'unparryable', 'step',
    'stagger', 'death', 'player_hurt', 'power_hit', 'power', 'wave', 'slowmo',
  ];
  let unmatched = [];
  let byCue;
  if (dir === null) {
    byCue = await takes();
  } else {
    const found = await sourced(resolve(dir.replace(/^~/, process.env.HOME ?? '~')), CUES);
    byCue = found.byCue;
    unmatched = found.unmatched;
  }
  if (byCue.size === 0) {
    console.error(
      dir === null
        ? 'no takes cached — run npm run audio:gen first'
        : `no files under ${dir} whose names contain a cue name (${CUES.join(', ')})`,
    );
    process.exit(1);
  }

  const outDir = resolve(root, 'runs');
  const audioDir = resolve(outDir, AUDIO_SUBDIR);
  await mkdir(audioDir, { recursive: true });
  const sections = [];
  let count = 0;

  for (const cue of [...byCue.keys()].sort()) {
    if (only !== null && !only.includes(cue)) continue;
    const rows = [];
    for (const take of (byCue.get(cue) ?? []).sort((a, b) => a.pack.localeCompare(b.pack) || a.roll - b.roll)) {
      const peak = await peakDb(take.path);
      const tmp = resolve(audioDir, `${cue}--${take.pack}-${take.roll}.mp3`.replace(/[^\w.\-]/g, '_'));
      const gain = peak === null ? 0 : TARGET_DB - peak;
      await run('ffmpeg', [
        '-hide_banner', '-loglevel', 'error', '-i', take.path,
        '-af', `volume=${gain.toFixed(2)}dB`, '-y', tmp,
      ]);
      count += 1;
      const lift = gain >= 20 ? ` <em>+${gain.toFixed(0)} dB lift — noise floor came up with it</em>` : '';
      rows.push(
        `<li><audio controls preload="none" src="${AUDIO_SUBDIR}/${basename(tmp)}"></audio>` +
          `<code>${take.pack} #${take.roll}</code> <span>raw peak ${peak ?? '?'} dB</span>${lift}</li>`,
      );
    }
    sections.push(`<section><h2>${cue}</h2><ol>${rows.join('')}</ol></section>`);
  }

  const html = `<!doctype html><meta charset="utf-8"><title>Crown Lab — cue audition</title>
<style>
 :root{color-scheme:dark light}
 body{font:15px/1.5 system-ui,sans-serif;max-width:60rem;margin:2rem auto;padding:0 1rem}
 h1{font-size:1.3rem} h2{font-size:1rem;margin:1.5rem 0 .4rem;letter-spacing:.04em;text-transform:uppercase;opacity:.75}
 ol{list-style:none;padding:0;margin:0;display:grid;gap:.4rem}
 li{display:flex;align-items:center;gap:.6rem;flex-wrap:wrap}
 audio{height:2rem} code{font-weight:600} span{opacity:.6;font-size:.85rem} em{opacity:.6;font-size:.85rem}
 p{opacity:.75}
</style>
<h1>Cue audition — ${count} takes, every one normalized to ${TARGET_DB} dB peak</h1>
<p>Level is matched on purpose, so what you are comparing is the sound rather than the loudness:
this endpoint's output level is a lottery and the loudest take is not the best one. The raw peak is
printed beside each take because a take that needed a large lift brought its noise floor up too.</p>
<p>Pick one per cue and give me the labels — that becomes the bank.</p>
${sections.join('')}`;

  if (unmatched.length > 0) {
    sections.push(
      `<section><h2>matched no cue</h2><p>${unmatched.length} file(s) — rename to contain a cue ` +
        `name to audition them: <code>${unmatched.slice(0, 12).join('</code>, <code>')}</code>` +
        `${unmatched.length > 12 ? ' …' : ''}</p></section>`,
    );
  }

  const out = resolve(outDir, 'cue-audition.html');
  await writeFile(out, html);
  console.log(`${count} takes → ${out}`);
  console.log(`  audio beside it in runs/${AUDIO_SUBDIR}/ — keep them together or the page goes silent`);
  console.log(`open it with:  open ${out}`);
};

await main();
