import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, relative, resolve } from 'node:path';
import process from 'node:process';

import { loadSim } from './bundle-sim.mjs';
import { flag, listArg, valueArg } from './lib/args.mjs';
import { launchChrome, startViteServer, waitForServer } from './lib/harness.mjs';
import { pngPixels } from './lib/png.mjs';
import { VIEWPORTS } from './lib/viewports.mjs';

const root = resolve(import.meta.dirname, '..');
const PORT = 5197;
const BASE = `http://localhost:${PORT}`;

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
const wantedEvents = listArg('events', DEFAULT_EVENTS);
const maxFrames = Number(valueArg('max', '8'));
const viewportName = valueArg('viewport', 'desktop');
const outputRoot = valueArg('output', 'watch');
const cast = valueArg('cast', '');
const hitboxes = flag('hitboxes');

if (runArg === '') {
  console.error(
    'watch:run needs a recording: --run=runs/pilot_<encounter>_<skill>_seed<n>.json\n' +
      '`npm run pilot` writes them. A run is the input because a run is what can be watched twice.',
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

const ratio = (numerator, denominator, digits = 0) =>
  denominator === 0
    ? `— (n=0)`
    : `${numerator}/${denominator} ${((numerator / denominator) * 100).toFixed(digits)}% (n=${denominator})`;
const number = (value, digits = 1) => (value === null ? '—' : value.toFixed(digits));

const samePicture = (a, b) => {
  const left = pngPixels(a);
  const right = pngPixels(b);
  if (left.width !== right.width || left.height !== right.height) return false;
  for (let y = 0; y < left.height; y += 1) {
    for (let x = 0; x < left.width; x += 1) {
      const [lr, lg, lb] = left.at(x, y);
      const [rr, rg, rb] = right.at(x, y);
      if (lr !== rr || lg !== rg || lb !== rb) return false;
      if (left.alphaAt(x, y) !== right.alphaAt(x, y)) return false;
    }
  }
  return true;
};

console.log(`\nrun          ${relative(root, resolve(root, runPath))}`);
console.log(
  `played by    ${record.meta.pilot === undefined ? 'a person' : `the ${record.meta.pilot} pilot`}` +
    ` — Instrument rung at best (ADR-007), and a script did not play at all`,
);
console.log(
  `encounter    ${record.meta.encounterId} seed ${record.meta.seed}` +
    ` / combat ${record.meta.combatId} / slow-motion ${record.meta.slowMoId}`,
);
console.log(`outcome      ${metrics.outcome} after ${(metrics.durationMs / 1000).toFixed(1)}s, ${record.ticks} ticks`);
console.log(`parry        ${ratio(metrics.parrySuccesses, metrics.parryAttempts)}`);
console.log(
  `offset       mean ${number(metrics.offsetMean)}ms, sd ${number(metrics.offsetSd)}` +
    ` (n=${metrics.offsets.length})`,
);
console.log(`whiff        ${ratio(metrics.attacksWhiffed, metrics.attacksStarted)}`);
console.log(`damage       ${metrics.damageTaken} over ${metrics.hitsTaken} hit(s); guard broke ${metrics.guardBreaks}x`);
console.log(`answer       ${number(metrics.answerLatencyMean)}ms mean (n=${metrics.answerLatencies.length})`);
console.log(`recovery     ${number(metrics.recoveryLatencyMean)}ms mean (n=${metrics.recoveryLatencies.length})`);
console.log(`kills        ${metrics.enemiesKilled}, powers used ${metrics.powersUsed}`);

if (anchors.length === 0) {
  console.error(
    `\nNo frame to stand on: this run emitted none of ${wantedEvents.join(', ')}.\n` +
      'That is a finding rather than an error — it is what a fight where nothing happened looks\n' +
      'like from here (PILOT-EVOLUTION-PLAN §2). Widen it with --events= if that is not the question.',
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
  page.on('console', (message) => {
    if (message.type() === 'warning' || message.type() === 'error') {
      const where = message.location().url;
      if (where.endsWith('/favicon.ico')) return;
      console.error(
        `Browser ${message.type()}: ${message.text().split('\n')[0]}${where ? ` (${where})` : ''}`,
      );
    }
  });

  console.log(`\n${anchors.length} frame(s) at ${viewportName}, from ${record.ticks} ticks\n`);

  let previous = null;
  for (const anchor of anchors) {
    const label = `tick ${anchor.tick} ${anchor.type}`;
    try {
      const search = new URLSearchParams({ run: runPath, at: String(anchor.tick) });
      if (cast) search.set('cast', cast);
      if (hitboxes) search.set('hitboxes', '1');
      await page.goto(`${BASE}/?${search}`);
      await page.waitForSelector(
        `html[data-run-ready="true"][data-run-tick="${anchor.tick}"]`,
        { timeout: 30_000 },
      );

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
      const repeated = await view.screenshot();
      if (!samePicture(first, repeated)) {
        throw new Error('two shots of one stood-on tick showed different pictures');
      }
      if (previous !== null && samePicture(previous.bytes, first)) {
        throw new Error(
          `pixel-identical to ${previous.label} — the frame did not move between two different ticks`,
        );
      }

      const file = resolve(outDir, `t${String(anchor.tick).padStart(6, '0')}_${anchor.type}.png`);
      await writeFile(file, first);
      const state = await page.evaluate(() => ({ ...document.documentElement.dataset }));
      sheet.push({
        tick: anchor.tick,
        ms: Math.round((anchor.tick / record.ticks) * metrics.durationMs),
        event: anchor.type,
        file: relative(root, file),
        encounter: state.runEncounter,
        castMeshes: state.captureCastMeshes ?? null,
      });
      previous = { bytes: first, label };
      console.log(`✓ ${label} → ${relative(root, file)}`);
    } catch (error) {
      failures.push(label);
      console.error(`✖ ${label}: ${error.message.split('\n')[0]}`);
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
      rung: 'instrument',
      metrics,
      frames: sheet,
    },
    null,
    2,
  )}\n`,
);
console.log(`\n${sheet.length} frame(s) and their metrics → ${relative(root, outDir)}/`);
console.log(
  'A frame says whether to look harder; only a quantity says which of the things in it moved.\n' +
    'Neither says whether it is good — that needs somebody to play it (SEAMLESS-DEV §8).',
);

if (failures.length > 0) {
  console.error(`\n${failures.length} frame(s) failed.`);
  process.exitCode = 1;
}
