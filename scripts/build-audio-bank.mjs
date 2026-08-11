
import { spawn } from 'node:child_process';
import { mkdir, readdir, rename, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { cachePath } from './bundle-sim.mjs';
import { flag } from './lib/args.mjs';

const root = resolve(import.meta.dirname, '..');
const OUT_DIR = resolve(root, 'src/assets/audio/bank');
const TARGET_DB = -1;
const SAMPLE_RATE = 44100;

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
    child.on('close', (code) => (code === 0 ? ok(all) : fail(new Error(`${cmd} exited ${code}: ${all.trim()}`))));
  });

const peakDb = async (path) => {
  const out = await run('ffmpeg', ['-hide_banner', '-i', path, '-af', 'volumedetect', '-f', 'null', '/dev/null']).catch(
    () => null,
  );
  const m = out === null ? null : /max_volume:\s*(-?[\d.]+) dB/.exec(out);
  return m === null ? null : Number(m[1]);
};

const vorbisEncoder = async () => {
  const encoders = await run('ffmpeg', ['-hide_banner', '-encoders']).catch(() => null);
  if (encoders === null) return null;
  if (encoders.includes('libvorbis')) return { name: 'libvorbis', args: ['-c:a', 'libvorbis', '-q:a', '5'] };
  if (/^\s*A\S*\s+vorbis\s/m.test(encoders)) {
    return { name: 'vorbis (native)', args: ['-c:a', 'vorbis', '-strict', '-2', '-b:a', '128k'] };
  }
  return null;
};

const main = async () => {
  const { BANK, PACKS } = await import(`file://${resolve(root, 'src/assets/audio/manifest.mjs')}`);
  const { CUES, ESSENTIAL_CUES } = await (await import('./bundle-sim.mjs')).loadSim(
    'src/render/soundbank.ts',
    'soundbank.mjs',
  );
  const { cueSpecsFrom } = await import('./lib/audio-plan.mjs');
  const specs = cueSpecsFrom(CUES, ESSENTIAL_CUES);

  const encoder = await vorbisEncoder();
  if (encoder === null) {
    console.error('ffmpeg has no Vorbis encoder — see gen-audio.mjs’s header');
    process.exit(1);
  }
  console.log(`bank ${BANK.id} — ${BANK.description}`);
  console.log(`encoding with ${encoder.name}, normalized to ${TARGET_DB} dB peak\n`);

  await mkdir(OUT_DIR, { recursive: true });
  const unchosen = [];
  const unknown = [];
  let written = 0;

  for (const [cue, spec] of Object.entries(specs)) {
    const take = BANK.takes[cue];
    if (take === undefined) {
      unchosen.push(cue);
      continue;
    }
    const src =
      take.file !== undefined
        ? resolve(root, take.file.replace(/^~/, process.env.HOME ?? '~'))
        : cachePath(`audio/${take.from}/${cue}.${take.roll}.mp3`);
    const peak = await peakDb(src);
    if (peak === null) {
      unknown.push(`${cue} → ${take.file ?? `${take.from} #${take.roll}`} (not on disk, or unreadable)`);
      continue;
    }
    const out = resolve(OUT_DIR, spec.file);
    const tmp = `${out}.tmp`;
    const gain = TARGET_DB - peak;
    await run('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-i', src,
      '-af', `volume=${gain.toFixed(2)}dB`,
      '-ar', String(SAMPLE_RATE), ...encoder.args, '-f', 'ogg', '-y', tmp,
    ]);
    await rename(tmp, out);
    await unlink(tmp).catch(() => {});
    written += 1;
    const lift = gain >= 20 ? `  ⚠ +${gain.toFixed(0)} dB — its noise floor came up too` : '';
    const label = take.file ?? `${take.from} #${take.roll}`;
    console.log(`  + ${cue.padEnd(13)} ${label}, ${gain >= 0 ? '+' : ''}${gain.toFixed(1)} dB${lift}`);
  }

  for (const bad of unknown) console.error(`  ✖ ${bad}`);
  if (unchosen.length > 0) {
    console.warn(`\n  ⚠ no take chosen for: ${unchosen.join(', ')}`);
    console.warn('    these cues stay synthesized. hear the candidates: npm run audio:audition');
  }
  const briefs = [...new Set(Object.values(BANK.takes).map((t) => t.from ?? 'sourced'))].sort();
  console.log(
    `\n${written}/${Object.keys(specs).length} written from ${briefs.length} brief(s)` +
      `${briefs.length > 0 ? ` (${briefs.join(', ')})` : ''}`,
  );
  if (unknown.length > 0) process.exit(1);
  if (written > 0 && !flag('quiet')) console.log('now: npm run audio:check -- --pack=bank');
};

await main();
