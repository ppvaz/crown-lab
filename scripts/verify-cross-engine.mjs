import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { bundleSim } from './bundle-sim.mjs';
import { chromium, firefox, webkit } from 'playwright-core';
import { flag, listArg } from './lib/args.mjs';

const root = resolve(import.meta.dirname, '..');


const DEFAULT_ROOMS = ['kernel_guard', 'kernel_duelist', 'captain_read', 'maze_serpentine'];

const rooms = listArg('rooms', DEFAULT_ROOMS);
const seeds = listArg('seeds', ['1', '2']).map(Number);
const ticks = Number(listArg('ticks', ['3000'])[0]);
const asserting = flag('assert');
const options = { rooms, seeds, ticks };


const bundle = async (name, format, platform, globalName) =>
  bundleSim({ entry: 'src/lab/engine-probe.ts', name, format, platform, globalName });

const nodeBundlePath = await bundle('engine-probe.node.mjs', 'esm', 'node');
const browserBundlePath = await bundle('engine-probe.web.js', 'iife', 'browser', 'CrownEngineProbe');
const { readFile } = await import('node:fs/promises');
const browserSource = await readFile(browserBundlePath, 'utf8');


const reports = [];
const uncovered = [];

const runInNode = async () => {
  const probe = await import(`file://${nodeBundlePath}`);
  return {
    engine: `Node ${process.versions.node}`,
    detail: `V8 ${process.versions.v8}`,
    report: probe.probeEngine(options),
  };
};

const runInBrowser = async (label, launcher, launchOptions) => {
  const browser = await launcher.launch({ headless: true, ...launchOptions });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(300_000);
    page.on('pageerror', (error) => console.error(`  ${label}: ${error.message}`));
    await page.setContent('<!doctype html><title>crown engine probe</title>');
    await page.addScriptTag({ content: browserSource });
    const result = await page.evaluate(
      (opts) => ({
        agent: navigator.userAgent,
        report: globalThis.CrownEngineProbe.probeEngine(opts),
      }),
      options,
    );
    return {
      engine: label,
      detail: `${browser.version()} · ${result.agent}`,
      report: result.report,
    };
  } finally {
    await browser.close();
  }
};

const ENGINES = [
  { label: 'Node', run: runInNode },
  {
    label: 'Chromium (bundled)',
    run: () => runInBrowser('Chromium (bundled)', chromium, {}),
    missing: 'npx playwright install chromium',
  },
  {
    label: 'Chrome (channel)',
    run: () => runInBrowser('Chrome (channel)', chromium, { channel: 'chrome' }),
    missing: 'install Google Chrome',
  },
  {
    label: 'Edge (channel)',
    run: () => runInBrowser('Edge (channel)', chromium, { channel: 'msedge' }),
    missing: 'install Microsoft Edge',
  },
  {
    label: 'Firefox',
    run: () => runInBrowser('Firefox', firefox, {}),
    missing: 'npx playwright install firefox',
  },
  {
    label: 'WebKit',
    run: () => runInBrowser('WebKit', webkit, {}),
    missing: 'npx playwright install webkit',
  },
];

console.log(
  `\nCROSS-ENGINE DETERMINISM — ${rooms.length} room(s) x ${seeds.length} seed(s) x ${ticks} ticks\n`,
);

for (const engine of ENGINES) {
  try {
    const result = await engine.run();
    reports.push(result);
    console.log(`  ran   ${result.engine.padEnd(20)} ${result.detail}`);
  } catch (error) {
    uncovered.push({ label: engine.label, why: error.message.split('\n')[0], fix: engine.missing });
    console.log(`  ---   ${engine.label.padEnd(20)} not covered`);
  }
}

if (uncovered.length > 0) {
  console.log('\nNOT COVERED — these engines were not measured, so nothing here speaks for them:');
  for (const entry of uncovered) {
    console.log(`  ${entry.label.padEnd(20)} ${entry.fix ?? ''}`);
    console.log(`  ${' '.repeat(20)} ${entry.why}`);
  }
}

if (reports.length < 2) {
  console.error('\nFewer than two engines ran. A comparison needs two; nothing was compared.');
  process.exitCode = 1;
  process.exit();
}


const reference = reports[0];
const divergences = [];

const groupBy = (valueOf) => {
  const groups = new Map();
  for (const entry of reports) {
    const key = String(valueOf(entry));
    const existing = groups.get(key);
    if (existing) existing.push(entry.engine);
    else groups.set(key, [entry.engine]);
  }
  return groups;
};

const contentGroups = groupBy((entry) => entry.report.contentHash);
if (contentGroups.size > 1) {
  console.error('\nEngines loaded different content. Nothing below is comparable.');
  for (const [hash, engines] of contentGroups) console.error(`  ${hash}  ${engines.join(', ')}`);
  process.exitCode = 1;
  process.exit();
}

console.log(`\nMATH SURFACE — content ${reference.report.contentHash}\n`);
for (let i = 0; i < reference.report.math.length; i++) {
  const sweep = reference.report.math[i];
  const groups = groupBy((entry) => entry.report.math[i].hash);
  const agreed = groups.size === 1;
  const tag = agreed ? 'same' : sweep.exactBySpec ? 'DIFFER (control!)' : 'DIFFER';
  console.log(`  ${sweep.name.padEnd(14)} ${String(sweep.samples).padStart(6)} samples  ${tag}`);
  if (agreed) continue;

  divergences.push({ what: sweep.name, control: sweep.exactBySpec });
  console.log(`    inputs: ${sweep.inputs}`);
  for (const [hash, engines] of groups) {
    console.log(`    ${hash.padStart(11)}  ${engines.join(', ')}`);
  }
  const differing = [];
  for (let b = 0; b < sweep.buckets.length; b++) {
    if (groupBy((entry) => entry.report.math[i].buckets[b]).size > 1) differing.push(b);
  }
  console.log(
    `    disagreeing sixteenths of the input range: ${differing.join(', ')} ` +
      `(${differing.length}/${sweep.buckets.length})`,
  );
}

console.log('\nSIM SURFACE — quantized is what a replay compares, exact is what a session needs\n');
for (let i = 0; i < reference.report.sim.length; i++) {
  const run = reference.report.sim[i];
  const label = `${run.encounterId}/seed ${run.seed}`;
  const quantized = groupBy((entry) => entry.report.sim[i].finalQuantized);
  const exact = groupBy((entry) => entry.report.sim[i].finalExact);

  const firstDiverged = (pick) => {
    for (let c = 0; c < run.checkpoints.length; c++) {
      if (groupBy((entry) => pick(entry.report.sim[i].checkpoints[c])).size > 1) {
        return run.checkpoints[c].tick;
      }
    }
    return null;
  };

  const quantizedTick = quantized.size > 1 ? firstDiverged((c) => c.quantized) : null;
  const exactTick = exact.size > 1 ? firstDiverged((c) => c.exact) : null;

  console.log(
    `  ${label.padEnd(30)} quantized ${quantized.size === 1 ? 'same' : `DIFFER (first tick ${quantizedTick ?? 'final only'})`}` +
      `  ·  exact ${exact.size === 1 ? 'same' : `DIFFER (first tick ${exactTick ?? 'final only'})`}`,
  );

  if (quantized.size > 1) {
    divergences.push({ what: `${label} replay hash`, control: true });
    for (const [hash, engines] of quantized) console.log(`      ${hash.padStart(11)}  ${engines.join(', ')}`);
  } else if (exact.size > 1) {
    divergences.push({ what: `${label} exact world`, control: true });
    for (const [hash, engines] of exact) console.log(`      ${hash.padStart(11)}  ${engines.join(', ')}`);
  }
}


const failures = divergences.filter((d) => d.control);
const expected = divergences.filter((d) => !d.control);
console.log('');

if (expected.length > 0) {
  console.log(`${expected.length} engine function(s) differ, as expected and as ADR-017 predicts:`);
  for (const d of expected) console.log(`  · ${d.what}`);
  console.log(
    '  These are implementation-approximated and are swept only to show what the sim would be' +
      '\n  exposed to if it still called them. src/sim/ calls none of them.',
  );
}

if (failures.length === 0) {
  console.log(
    `\n✓ ${reports.length} engines agree, bit for bit, on every pinned function and every world.`,
  );
} else {
  console.log(`\n${failures.length} REAL divergence(s):`);
  for (const d of failures) console.log(`  ✖ ${d.what}`);
  console.log(
    '\n✖ marks a surface that must not differ: a function ECMA-262 pins exactly, one src/sim/' +
      '\n  computes for itself, or a world two engines are supposed to share. ADR-017 clause 3' +
      '\n  says to reverse rather than relax this — do not adjust the harness to make it pass.',
  );
}

if (asserting && failures.length > 0) process.exitCode = 1;
