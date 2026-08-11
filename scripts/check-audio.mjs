
import { spawn } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { loadSim } from './bundle-sim.mjs';
import { valueArg } from './lib/args.mjs';
import { cueSpecsFrom, planPack } from './lib/audio-plan.mjs';
import { decodedBytes, oggInfo, oggProblem } from './lib/ogg.mjs';

const root = resolve(import.meta.dirname, '..');

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

const SILENT_PEAK_DB = -30;

/**
 * Mean and peak dBFS via ffmpeg, or null where ffmpeg is absent.
 *
 * §4.3 makes ffmpeg a hard dependency of stage 2 and not of stage 5, so this degrades rather than
 * fails: on a machine with no toolchain the shape checks still run and the level column says so. A
 * check that cannot run everywhere is still worth running where it can — what it must not do is turn
 * its own absence into a pass, which is why the summary line names the packs it could not measure.
 * @param {string} path
 * @returns {Promise<{ meanDb: number, peakDb: number } | null>}
 */
const levels = async (path) => {
  const out = await run('ffmpeg', ['-hide_banner', '-i', path, '-af', 'volumedetect', '-f', 'null', '/dev/null'])
    .catch(() => null);
  if (out === null) return null;
  const mean = /mean_volume:\s*(-?[\d.]+) dB/.exec(out);
  const peak = /max_volume:\s*(-?[\d.]+) dB/.exec(out);
  return mean === null || peak === null
    ? null
    : { meanDb: Number(mean[1]), peakDb: Number(peak[1]) };
};

/**
 * A child process's combined output, or a rejection. `volumedetect` writes to stderr.
 * @param {string} cmd
 * @param {string[]} args
 * @returns {Promise<string>}
 */
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

/**
 * The sample filenames the lab registry carries for a pack, or null when it has no record.
 *
 * Keyed by filename in the registry itself (`soundbank.ts` rule 2), so only the keys are needed —
 * which is fortunate, because the values are `new URL(…, import.meta.url)` hrefs resolved against
 * the bundle's location in `node_modules/.cache` and mean nothing here.
 * @param {Record<string, unknown>} registry
 * @param {string} packId
 */
const registered = (registry, packId) => {
  const record = registry[`${packId.toUpperCase()}_SAMPLES`] ?? registry[`${packId.toUpperCase()}_SAMPLES_LAB`];
  return record === undefined ? null : Object.keys(/** @type {object} */ (record));
};

const main = async () => {
  const wanted = valueArg('pack', null);

  const { CUES, ESSENTIAL_CUES } = await loadSim('src/render/soundbank.ts', 'soundbank.mjs');
  const registry = await loadSim('src/render/asset-registry-lab.ts', 'asset-registry-lab.mjs');
  const { PACKS } = await import(`file://${resolve(root, 'src/assets/audio/manifest.mjs')}`);
  const specs = cueSpecsFrom(CUES, ESSENTIAL_CUES);

  const onDisk = (await readdir(resolve(root, 'src/assets/audio'), { withFileTypes: true }))
    .filter((d) => d.isDirectory() && d.name !== 'music')
    .map((d) => d.name);
  const packs = (wanted === null ? [...new Set([...Object.keys(PACKS), ...onDisk])] : [wanted]).sort();

  let failures = 0;
  let unmeasured = 0;
  for (const packId of packs) {
    const planned = PACKS[packId] === undefined ? null : planPack(PACKS, packId, specs);
    const label = planned === null ? `${packId} (no manifest entry — predates the pipeline)` : packId;
    console.log(`\npack ${label}`);

    if (planned !== null && planned.problems.length > 0) {
      for (const p of planned.problems) console.error(`  ✖ plan: ${p.kind} — ${p.detail}`);
      failures += planned.problems.length;
    }

    const expected =
      planned === null
        ? Object.entries(specs).map(([cue, s]) => ({ cue, file: s.file }))
        : planned.entries.map((e) => ({ cue: e.cue, file: e.file }));

    let total = 0;
    let present = 0;
    const missing = [];
    for (const { cue, file } of expected) {
      const path = resolve(root, 'src/assets/audio', packId, file);
      const bytes = await readFile(path).catch(() => null);
      if (bytes === null) {
        missing.push(cue);
        continue;
      }
      const info = oggInfo(bytes);
      if (!info.ok) {
        console.error(`  ✖ ${cue}: ${oggProblem(info)}`);
        failures += 1;
        continue;
      }
      present += 1;
      total += decodedBytes(info);
      const level = await levels(path);
      if (level === null) unmeasured += 1;
      const levelText =
        level === null ? 'level unmeasured' : `${level.meanDb} dB mean, ${level.peakDb} dB peak`;
      console.log(
        `  ${cue.padEnd(13)} ${info.durationSeconds.toFixed(2)}s ${info.codec} ${info.sampleRate} Hz ` +
          `${info.channels}ch  ${kb(bytes.length)} on disk, ${kb(decodedBytes(info))} decoded, ${levelText}`,
      );
      if (level !== null && level.peakDb < SILENT_PEAK_DB) {
        console.error(
          `  \u2716 ${cue}: peaks at ${level.peakDb} dB — this file contains no audible sound`,
        );
        failures += 1;
      }
    }
    if (missing.length > 0) {
      console.error(`  ✖ missing: ${missing.join(', ')} — these cues fall back to synthesis silently`);
      failures += 1;
    }

    const names = registered(registry, packId);
    if (names === null) {
      console.warn(`  ⚠ no registry record — nothing in the lab can select this pack yet (stage 3)`);
    } else {
      const unregistered = expected.filter(({ file }) => !names.includes(file)).map((e) => e.cue);
      if (unregistered.length > 0) {
        console.error(
          `  ✖ registry omits: ${unregistered.join(', ')} — the pack is selectable and half silent`,
        );
        failures += 1;
      }
    }

    console.log(`  ${present}/${expected.length} samples, ${kb(total)} decoded`);
  }

  if (unmeasured > 0) {
    console.warn(`\n${unmeasured} sample(s) unmeasured for level — ffmpeg is absent on this machine`);
  }
  if (failures > 0) {
    console.error(`\n${failures} failure(s)`);
    process.exit(1);
  }
  console.log('\nevery pack is complete, decodable, audible and reachable');
};

await main();
