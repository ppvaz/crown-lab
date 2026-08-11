
import { spawn } from 'node:child_process';
import { access, mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { cachePath, loadSim } from './bundle-sim.mjs';
import { flag, listArg, valueArg } from './lib/args.mjs';
import { cueSpecsFrom, formatPlan, planPack } from './lib/audio-plan.mjs';
import { keyFor, providerNamed } from './lib/audio-providers.mjs';

const root = resolve(import.meta.dirname, '..');

const ENDPOINT = 'https://api.elevenlabs.io/v1/sound-generation';

const SAMPLE_RATE = 44100;
const VORBIS_BITRATE = '128k';

const NORMALIZE_TARGET_DB = -1;

const exists = async (path) => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/**
 * Which Vorbis encoder this ffmpeg has, preferring the good one.
 *
 * Returns the argument list rather than a name, because the two are not interchangeable: the native
 * encoder needs `-strict -2` to run at all and a bitrate rather than a quality. See the header.
 * @returns {Promise<{ name: string, args: string[] } | null>}
 */
const vorbisEncoder = async () => {
  const encoders = await run('ffmpeg', ['-hide_banner', '-encoders']).catch(() => null);
  if (encoders === null) return null;
  if (encoders.includes('libvorbis')) {
    return { name: 'libvorbis', args: ['-c:a', 'libvorbis', '-q:a', '5'] };
  }
  if (/^\s*A\S*\s+vorbis\s/m.test(encoders)) {
    return { name: 'vorbis (native)', args: ['-c:a', 'vorbis', '-strict', '-2', '-b:a', VORBIS_BITRATE] };
  }
  return null;
};

/**
 * A child process's stdout, or a rejection carrying its stderr.
 * @param {string} cmd
 * @param {string[]} args
 * @returns {Promise<string>}
 */
const run = (cmd, args) =>
  new Promise((ok, fail) => {
    const child = spawn(cmd, args);
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => {
      out += d;
    });
    child.stderr.on('data', (d) => {
      err += d;
    });
    child.on('error', (e) => fail(new Error(`${cmd}: ${e.message}`)));
    child.on('close', (code) =>
      code === 0 ? ok(out + err) : fail(new Error(`${cmd} exited ${code}: ${err.trim()}`)),
    );
  });

/**
 * The mp3 a paid call returned, kept where a retry can find it.
 *
 * Under `node_modules/.cache/crown-lab/`, following `bundle-sim.mjs`'s `cachePath`: never a build
 * input, already ignored by git, and safe to delete. Not in `src/assets/audio/`, which is the pack.
 * @param {string} packId
 * @param {string} cue
 */
const sourcePath = (packId, cue, roll) => cachePath(`audio/${packId}/${cue}.${roll}.mp3`);

/**
 * The rolls already on disk for a cue, lowest number first.
 *
 * **Rolls are numbered because the endpoint's output level is a lottery, and `--force` used to burn
 * the evidence.** Measured 2026-08-10 on `tempered`: one batch at identical presets ranged from a
 * -0.2 dB peak to -26.9, and re-rolling `heavy` with only its duration and influence changed moved it
 * from -15.3 to -34.9 — the wrong way, by 20 dB, on a prompt that had not changed. Wording moves level
 * too (`wave` went from -38.7 to -0.2 when a distance cue came out of it), but nothing here
 * *controls* it.
 *
 * A cache keyed by cue alone therefore had the worst possible property: a re-roll overwrote the take
 * it was meant to be compared against, so the better of two renders was destroyed by the act of
 * looking for a better one. Every roll is kept now. Bytes that were paid for are never discarded.
 * @param {string} packId
 * @param {string} cue
 */
const rollsOf = async (packId, cue) => {
  const dir = dirname(sourcePath(packId, cue, 1));
  const names = await readdir(dir).catch(() => []);
  return names
    .filter((n) => n.startsWith(`${cue}.`) && n.endsWith('.mp3'))
    .map((n) => Number(n.slice(cue.length + 1, -4)))
    .filter((n) => Number.isInteger(n))
    .sort((a, b) => a - b);
};

/**
 * A roll's peak in dBFS, or null when ffmpeg cannot say.
 *
 * Peak is a *filter*, never the choice: it separates a render that contains a sound from one that
 * does not, and what makes an impact satisfying is spectral weight no single number carries. So the
 * loudest roll is the one transcoded, and every roll is left on disk for the ear to overrule.
 * @param {string} path
 */
const peakDb = async (path) => {
  const out = await run('ffmpeg', ['-hide_banner', '-i', path, '-af', 'volumedetect', '-f', 'null', '/dev/null'])
    .catch(() => null);
  const match = out === null ? null : /max_volume:\s*(-?[\d.]+) dB/.exec(out);
  return match === null ? null : Number(match[1]);
};

/**
 * mp3 file in, `.ogg` on disk, atomically.
 *
 * **`-f ogg` is not optional and its absence cost fourteen calls.** ffmpeg chooses a muxer from the
 * output *extension*, and an atomic write means writing to `parry.ogg.tmp` — for which the extension
 * is `.tmp`, so it exits 234 with "Unable to choose an output format". Every request in the first
 * batch succeeded and every transcode then failed, which is the exact pairing this pipeline is least
 * able to afford. The format is now stated rather than inferred, and `check-audio.mjs` reads the
 * container back to confirm it.
 *
 * The temporary is a sibling of the target so the rename cannot cross a filesystem — a rename that
 * silently becomes a copy is no longer atomic, which is the whole property being bought.
 * @param {string} mp3Path
 * @param {string} outPath
 * @param {{ name: string, args: string[] }} encoder
 */
const transcode = async (mp3Path, outPath, encoder, normalize) => {
  const outTmp = `${outPath}.tmp`;
  await mkdir(dirname(outPath), { recursive: true });
  const peak = normalize ? await peakDb(mp3Path) : null;
  const gain = peak === null ? [] : ['-af', `volume=${(NORMALIZE_TARGET_DB - peak).toFixed(2)}dB`];
  try {
    await run('ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      mp3Path,
      ...gain,
      '-ar',
      String(SAMPLE_RATE),
      ...encoder.args,
      '-f',
      'ogg',
      '-y',
      outTmp,
    ]);
    await rename(outTmp, outPath);
  } finally {
    await unlink(outTmp).catch(() => {});
  }
};

const main = async () => {
  const packId = valueArg('pack', 'hollow');
  const only = listArg('only', null);
  const force = flag('force');
  const rolls = Number(valueArg('rolls', '1'));
  const normalize = flag('normalize');
  const provider = providerNamed(valueArg('provider', 'elevenlabs'));
  const listing = flag('list');

  const { CUES, ESSENTIAL_CUES } = await loadSim('src/render/soundbank.ts', 'soundbank.mjs');
  const { PACKS } = await import(`file://${resolve(root, 'src/assets/audio/manifest.mjs')}`);
  const plan = planPack(PACKS, packId, cueSpecsFrom(CUES, ESSENTIAL_CUES));

  console.log(formatPlan(plan));
  if (plan.problems.length > 0) {
    console.error(`\n${plan.problems.length} problem(s) — nothing was generated.`);
    process.exit(1);
  }
  if (listing) return;

  if (!listing && provider.credits !== undefined) {
    const balance = await provider.credits(keyFor(provider));
    if (balance !== null) console.log(`${provider.id} balance: ${balance} credits`);
    if (balance !== null && balance <= 0) {
      console.error(`\n${provider.id} has no credits — nothing was sent, so nothing was spent.`);
      process.exit(1);
    }
  }

  const encoder = await vorbisEncoder();
  if (encoder === null) {
    console.error('\nffmpeg has no Vorbis encoder — stage 2 needs one. See this file’s header.');
    process.exit(1);
  }
  console.log(`\nprovider ${provider.id}, encoding with ${encoder.name}${normalize ? `, normalized to ${NORMALIZE_TARGET_DB} dB peak` : ''}`);

  const wanted = plan.entries.filter((e) => only === null || only.includes(e.cue));
  if (only !== null) {
    for (const cue of only) {
      if (!plan.entries.some((e) => e.cue === cue)) console.error(`  ⚠ no cue "${cue}" in this pack`);
    }
  }

  /** @type {string[]} */
  const failed = [];
  let made = 0;
  let skipped = 0;
  let paid = 0;
  for (const entry of wanted) {
    const outPath = resolve(root, entry.outPath);
    if (!force && (await exists(outPath)) && (await rollsOf(packId, entry.cue)).length >= rolls) {
      skipped += 1;
      console.log(`  = ${entry.cue} (exists)`);
      continue;
    }
    try {
      let have = await rollsOf(packId, entry.cue);
      const target = force ? have.length + rolls : Math.max(rolls, have.length);
      for (let n = have.length + 1; n <= target; n += 1) {
        const mp3 = await provider.generate(entry, keyFor(provider));
        const path = sourcePath(packId, entry.cue, n);
        await mkdir(dirname(path), { recursive: true });
        await writeFile(`${path}.tmp`, mp3);
        await rename(`${path}.tmp`, path);
        paid += 1;
        await sleep(500);
      }
      have = await rollsOf(packId, entry.cue);

      const measured = [];
      for (const n of have) {
        measured.push({ n, peak: await peakDb(sourcePath(packId, entry.cue, n)) });
      }
      const best = measured.reduce((a, b) => ((b.peak ?? -Infinity) > (a.peak ?? -Infinity) ? b : a));
      await transcode(sourcePath(packId, entry.cue, best.n), outPath, encoder, normalize);
      const size = (await readFile(outPath)).length;
      made += 1;
      const table = measured.map((m) => `#${m.n} ${m.peak ?? '?'}`).join(', ');
      console.log(
        `  + ${entry.cue.padEnd(13)} roll #${best.n} of ${have.length}, ${size} bytes  [${table}]`,
      );
    } catch (e) {
      failed.push(entry.cue);
      console.error(`  ✖ ${entry.cue}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  console.log(
    `\n${made} written from ${paid} paid call(s), ${skipped} already there, ${failed.length} failed`,
  );
  if (failed.length > 0) {
    console.error(`re-run to retry only these: --only=${failed.join(',')}`);
    process.exit(1);
  }
  console.log('listen to the pack as a whole before wiring it: npm run audio:check');
};

await main();
