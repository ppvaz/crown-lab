import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import { loadSim } from './bundle-sim.mjs';
import { listArg } from './lib/args.mjs';

const root = resolve(import.meta.dirname, '..');
const dir = resolve(root, listArg('runs', ['runs'])[0]);
const sortBy = listArg('sort', ['candidate'])[0];

const { deriveMetrics } = await loadSim('src/lab/metrics.ts', 'metrics-score');
const { deriveFluidity } = await loadSim('src/lab/fluidity.ts', 'fluidity-score');

const walk = async (at) => {
  const out = [];
  for (const entry of await readdir(at, { withFileTypes: true })) {
    const full = resolve(at, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else if (entry.name.endsWith('.json')) out.push(full);
  }
  return out;
};

let files;
try {
  files = await walk(dir);
} catch {
  console.error(`no such directory: ${dir}`);
  process.exit(1);
}
if (files.length === 0) {
  console.error(`no run files under ${dir} — pilot runs are written with \`npm run pilot -- --out=…\``);
  process.exit(1);
}

const rows = [];
for (const file of files) {
  const record = JSON.parse(await readFile(file, 'utf8'));
  if (!Array.isArray(record.events)) continue;
  const metrics = deriveMetrics(record.events, {
    outcome: record.outcome,
    ticks: record.ticks,
    pathLength: record.pathLength ?? 0,
  });
  const f = deriveFluidity(record.events, metrics);
  rows.push({
    name: file
      .slice(root.length + 1)
      .replace(/^runs\//, '')
      .replace(/\.json$/, '')
      .replace(/(^|\/)pilot_/, '$1'),
    outcome: metrics.outcome,
    secs: metrics.durationMs / 1000,
    f,
  });
}

const key = (r) =>
  sortBy === 'candidate' ? (r.f.candidateScore ?? -1) : (r.f[sortBy]?.score ?? -1);
rows.sort((a, b) => key(b) - key(a));

const pct = (c) => (c.score === null ? '  -- ' : `${(c.score * 100).toFixed(0).padStart(4)}%`);
const raw = (c, digits = 2) => (c.raw === null ? '--' : c.raw.toFixed(digits));

console.log(
  '\nCANDIDATE fluidity proxies — uncalibrated, never checked against a person, not for tuning.\n' +
    'Rank these runs by eye first, then read the table. See src/lab/fluidity.ts.\n',
);
console.log(
  `${'run'.padEnd(34)} ${'out'.padEnd(8)} ${'secs'.padStart(6)}  ` +
    `${'occ'.padStart(5)} ${'prec'.padStart(5)} ${'econ'.padStart(5)} ` +
    `${'phrase'.padStart(6)} ${'comp'.padStart(5)} ${'cad'.padStart(5)}  ${'CAND'.padStart(5)}`,
);
for (const r of rows) {
  console.log(
    `${r.name.slice(-34).padEnd(34)} ${r.outcome.padEnd(8)} ${r.secs.toFixed(1).padStart(6)}  ` +
      `${pct(r.f.occupancy)} ${pct(r.f.precision)} ${pct(r.f.economy)} ` +
      `${pct(r.f.phrasing).padStart(6)} ${pct(r.f.composure)} ${pct(r.f.cadence)}  ` +
      `${r.f.candidateScore === null ? '  -- ' : `${(r.f.candidateScore * 100).toFixed(0).padStart(4)}%`}` +
      `${r.f.defined < 4 ? ` (only ${r.f.defined} components)` : ''}`,
  );
}

console.log('\nraw values, in their own units:');
console.log(
  `${'run'.padEnd(34)} ${'busy frac'.padStart(9)} ${'offsetSd'.padStart(9)} ${'whiff'.padStart(6)} ` +
    `${'phrased'.padStart(8)} ${'hit-while-committed'.padStart(20)} ${'gap cv'.padStart(7)}`,
);
for (const r of rows) {
  console.log(
    `${r.name.slice(-34).padEnd(34)} ${raw(r.f.occupancy).padStart(9)} ${raw(r.f.precision, 0).padStart(9)} ` +
      `${raw(r.f.economy).padStart(6)} ${raw(r.f.phrasing).padStart(8)} ` +
      `${`${raw(r.f.composure)} of ${r.f.composure.n}`.padStart(20)} ${raw(r.f.cadence).padStart(7)}`,
  );
}
console.log(
  '\nEvery component has a degenerate optimum reachable by a worse player — composure is maximised\n' +
    'by never attacking. These find runs to watch; they do not grade dials.\n',
);
