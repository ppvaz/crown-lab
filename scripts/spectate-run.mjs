import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, relative, resolve } from 'node:path';
import process from 'node:process';

import { loadSim } from './bundle-sim.mjs';
import { listArg, valueArg } from './lib/args.mjs';
import { launchChrome, startViteServer, waitForServer } from './lib/harness.mjs';
import { pngPixels } from './lib/png.mjs';
import { VIEWPORTS } from './lib/viewports.mjs';

const root = resolve(import.meta.dirname, '..');
const PORT = 5198;
const BASE = `http://localhost:${PORT}`;

const DEFAULT_PRESENTATIONS = ['Full', 'Hud_None', 'Subtracted_All'];

const DEFAULT_EVENTS = [
  'enemy_telegraph',
  'parry_success',
  'parry_failed',
  'guard_broken',
  'hit_received',
  'player_died',
  'encounter_cleared',
];

const runArg = valueArg('run', '');
const presentations = listArg('presentations', DEFAULT_PRESENTATIONS);
const wantedEvents = listArg('events', DEFAULT_EVENTS);
const maxFrames = Number(valueArg('max', '4'));
const viewportName = valueArg('viewport', 'desktop');
const outputRoot = valueArg('output', 'spectate');
const cast = valueArg('cast', '');

if (runArg === '') {
  console.error(
    'spectate needs a recording: --run=runs/pilot_<encounter>_<skill>_seed<n>.json\n' +
      'A run is the input because Phase 9 compares conditions over one fixed performance —\n' +
      'two people playing under two conditions is a different experiment, and a worse one.',
  );
  process.exit(1);
}
const form = VIEWPORTS[viewportName];
if (form === undefined) {
  console.error(`unknown viewport: ${viewportName} (have: ${Object.keys(VIEWPORTS).join(', ')})`);
  process.exit(1);
}
if (!Number.isInteger(maxFrames) || maxFrames < 1) {
  console.error(`--max must be a whole number of frames, got ${valueArg('max', '')}`);
  process.exit(1);
}
if (presentations.length < 2) {
  console.error(
    `--presentations needs at least two arms, got ${presentations.join(', ')}.\n` +
      'One condition photographed alone is `npm run watch:run`, which already exists and is\n' +
      'the better tool for it — this one exists only to hold two of them against each other.',
  );
  process.exit(1);
}

const runPath = runArg.replace(/^\/+/, '');
const record = JSON.parse(await readFile(resolve(root, runPath), 'utf8'));

const { deriveMetrics } = await loadSim('src/lab/metrics.ts', 'metrics');
const metrics = deriveMetrics(record.events, {
  outcome: record.outcome,
  ticks: record.ticks,
  pathLength: record.pathLength ?? 0,
});

const anchors = (() => {
  const wanted = new Set(wantedEvents);
  const seen = new Map();
  for (const event of record.events) {
    if (!wanted.has(event.type)) continue;
    if (typeof event.tick !== 'number') continue;
    if (!seen.has(event.tick)) seen.set(event.tick, event.type);
  }
  const all = [...seen.entries()].map(([tick, type]) => ({ tick, type }));
  all.sort((a, b) => a.tick - b.tick);
  if (all.length <= maxFrames) return all;
  const step = (all.length - 1) / (maxFrames - 1);
  return Array.from({ length: maxFrames }, (_, i) => all[Math.round(i * step)]);
})();

const outDir = resolve(root, outputRoot, basename(runPath).replace(/\.json$/, ''));
await mkdir(outDir, { recursive: true });

const differingPixels = (a, b) => {
  const left = pngPixels(a);
  const right = pngPixels(b);
  if (left.width !== right.width || left.height !== right.height) return Infinity;
  let differ = 0;
  for (let y = 0; y < left.height; y += 1) {
    for (let x = 0; x < left.width; x += 1) {
      const [lr, lg, lb] = left.at(x, y);
      const [rr, rg, rb] = right.at(x, y);
      if (lr !== rr || lg !== rg || lb !== rb || left.alphaAt(x, y) !== right.alphaAt(x, y)) {
        differ += 1;
      }
    }
  }
  return differ;
};

const ratio = (numerator, denominator, digits = 0) =>
  denominator === 0
    ? '— (n=0)'
    : `${numerator}/${denominator} ${((numerator / denominator) * 100).toFixed(digits)}% (n=${denominator})`;

console.log(`\nrun          ${relative(root, resolve(root, runPath))}`);
console.log(
  `played by    ${record.meta.pilot === undefined ? 'a person' : `the ${record.meta.pilot} pilot`}` +
    `${record.meta.pilot === undefined ? '' : ' — a script, and Phase 9 asks about expert play'}`,
);
console.log(
  `encounter    ${record.meta.encounterId} seed ${record.meta.seed}` +
    ` / combat ${record.meta.combatId} / slow-motion ${record.meta.slowMoId}`,
);
console.log(`outcome      ${metrics.outcome} after ${(metrics.durationMs / 1000).toFixed(1)}s`);
console.log(`parry        ${ratio(metrics.parrySuccesses, metrics.parryAttempts)}`);
console.log(`conditions   ${presentations.join(' · ')}  (the first is the control)`);

if (anchors.length === 0) {
  console.error(
    `\nNo frame to stand on: this run emitted none of ${wantedEvents.join(', ')}.\n` +
      'A fight where nothing happened has no moment for a spectator to read either.',
  );
  process.exit(1);
}

const { proc: server, state: serverState } = startViteServer({ port: PORT });
const failures = [];
const sheet = [];

try {
  await waitForServer(BASE, serverState);
  const browser = await launchChrome();
  const context = await browser.newContext(form);
  const page = await context.newPage();
  await page.addInitScript(() => {
    const style = document.createElement('style');
    style.textContent = '#panel, #lab-actions, #coop-controls { visibility: hidden !important; }';
    document.addEventListener('DOMContentLoaded', () => document.head.appendChild(style));
  });
  page.on('pageerror', (error) => console.error(`Browser: ${error.message}`));
  const missing = new Set();
  page.on('response', (response) => {
    if (response.status() !== 404) return;
    const path = new URL(response.url()).pathname;
    if (missing.has(path)) return;
    missing.add(path);
    console.error(`✖ 404 ${path} — the frame below is whatever the lab drew instead`);
  });

  console.log(
    `\n${anchors.length} tick(s) x ${presentations.length} condition(s) at ${viewportName}\n`,
  );

  for (const anchor of anchors) {
    const shots = [];
    for (const presentation of presentations) {
      const label = `tick ${anchor.tick} ${presentation}`;
      try {
        const search = new URLSearchParams({
          run: runPath,
          at: String(anchor.tick),
          presentation,
        });
        if (cast) search.set('cast', cast);
        await page.goto(`${BASE}/?${search}`);
        await page.waitForSelector(
          `html[data-run-ready="true"][data-run-tick="${anchor.tick}"]`,
          { timeout: 30_000 },
        );

        const drawn = await page.getAttribute('html', 'data-run-presentation');
        if (drawn !== presentation) {
          throw new Error(
            `asked for ${presentation} and the frame was drawn under ${drawn ?? 'nothing published'}`,
          );
        }

        const framesBefore = Number(await page.getAttribute('html', 'data-run-frames'));
        await page.waitForTimeout(400);
        const framesAfter = Number(await page.getAttribute('html', 'data-run-frames'));
        if (!(framesAfter > framesBefore)) {
          throw new Error(
            `the frame loop is not running (data-run-frames stuck at ${framesBefore}) — ` +
              'a screenshot of a suspended tab is evidence of nothing',
          );
        }

        const view = page.locator('canvas#view');
        const first = await view.screenshot();
        await page.waitForTimeout(100);
        if (differingPixels(first, await view.screenshot()) !== 0) {
          throw new Error('two shots of one stood-on tick showed different pictures');
        }

        const file = resolve(
          outDir,
          `t${String(anchor.tick).padStart(6, '0')}_${presentation}.png`,
        );
        await writeFile(file, first);
        shots.push({ presentation, bytes: first, file });
        console.log(`✓ ${label} → ${relative(root, file)}`);
      } catch (error) {
        failures.push(label);
        console.error(`✖ ${label}: ${error.message.split('\n')[0]}`);
      }
    }

    if (shots.length < 2) continue;



    const control = shots[0];
    for (const shot of shots.slice(1)) {
      const differ = differingPixels(control.bytes, shot.bytes);
      const total = pngPixels(control.bytes).width * pngPixels(control.bytes).height;
      if (differ === 0) {
        failures.push(`tick ${anchor.tick} ${shot.presentation} vs ${control.presentation}`);
        console.error(
          `✖ tick ${anchor.tick}: ${shot.presentation} is pixel-identical to ${control.presentation} —` +
            ' the condition changed nothing, which is a broken arm and not a finding',
        );
      } else {
        console.log(
          `  ${shot.presentation} vs ${control.presentation}: ${ratio(differ, total, 1)} of the frame`,
        );
      }
      sheet.push({
        tick: anchor.tick,
        event: anchor.type,
        control: control.presentation,
        presentation: shot.presentation,
        pixelsChanged: differ,
        pixelsTotal: total,
        file: relative(root, shot.file),
        controlFile: relative(root, control.file),
      });
    }
  }

  await context.close();
  await browser.close();
} finally {
  server.kill();
}

const manifestPath = resolve(outDir, 'manifest.json');
await writeFile(
  manifestPath,
  `${JSON.stringify(
    {
      run: relative(root, resolve(root, runPath)),
      meta: record.meta,
      viewport: viewportName,
      // The rung travels with the artifact, because a sheet outlives the shell it was printed in
      // and "a script played this" is the first thing a reader needs and the first thing lost.
      rung: 'instrument',
      playedBy: record.meta.pilot === undefined ? 'person' : record.meta.pilot,
      control: presentations[0],
      presentations,
      metrics,
      comparisons: sheet,
    },
    null,
    2,
  )}\n`,
);
console.log(`\n${sheet.length} comparison(s) → ${relative(root, outDir)}/`);
console.log(
  'What is on disk is the artifact, not the answer. Phase 9 asks whether this has a signature\n' +
    'and whether expert play reads as skill to someone watching; both need somebody watching it,\n' +
    'and a pixel count is not a signature however precisely it is measured.',
);

if (failures.length > 0) {
  console.error(`\n${failures.length} frame(s) or comparison(s) failed.`);
  process.exitCode = 1;
}
