import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import process from 'node:process';
import { loadSim } from './bundle-sim.mjs';
import { flag, listArg } from './lib/args.mjs';

const root = resolve(import.meta.dirname, '..');

const DEFAULT_ENCOUNTERS = [
  'kernel_guard',
  'kernel_duelist',
  'spacing_archer',
  'court_45s',
  'shape_gallery',
  'shape_twin_bowls',
  'shape_combat_bowl',
  'shape_cramped_keep',
];


const encounters = listArg('encounters', DEFAULT_ENCOUNTERS);
const skills = listArg('skills', ['steady']);
const seeds = listArg('seeds', ['1']).flatMap((entry) => {
  const range = /^(-?\d+)\.\.(-?\d+)$/.exec(entry);
  if (range === null) return [Number(entry)];
  const [from, to] = [Number(range[1]), Number(range[2])];
  const step = from <= to ? 1 : -1;
  return Array.from({ length: Math.abs(to - from) + 1 }, (_, i) => from + i * step);
});
const combatId = listArg('combat', ['Default'])[0];
const modeId = listArg('mode', [''])[0];

const maxMs = Number(listArg('max-ms', [''])[0] || '') || undefined;
if (maxMs !== undefined && !Number.isFinite(maxMs)) {
  console.error('--max-ms: expected a number of milliseconds');
  process.exit(1);
}
const outDir = resolve(root, listArg('out', ['runs'])[0]);
const write = !flag('no-write');

const {
  runPilotEncounter,
  MODE_PROFILES,
  GENERATED_ENCOUNTER_IDS,
  encounterForSeed,
  invalidateEncounterCache,
  ETERNAL_SIEGE_ID,
  ETERNAL_SIEGE_SPEC,
} = await loadSim('src/lab/pilot-run.ts', 'pilot-run');





const fromArg = listArg('siege-from', [])[0];
if (fromArg !== undefined) {
  const wave = Number(fromArg);
  if (!Number.isFinite(wave) || wave < 1) {
    console.error(`--siege-from: expected a wave number, got ${fromArg}`);
    process.exit(1);
  }
  ETERNAL_SIEGE_SPEC.startWave = wave;
  invalidateEncounterCache();
}

const paceArg = listArg('siege-pace', [])[0];
if (paceArg !== undefined) {
  const parts = paceArg.split(':').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n) || n < 0)) {
    console.error(`--siege-pace: expected wave:boss:threat in ms, got ${paceArg}`);
    process.exit(1);
  }
  [ETERNAL_SIEGE_SPEC.waveBreathMs, ETERNAL_SIEGE_SPEC.bossBreathMs, ETERNAL_SIEGE_SPEC.msPerThreat] =
    parts;
  invalidateEncounterCache();
}

const sweepingGenerated = flag('generated');
if (sweepingGenerated && GENERATED_ENCOUNTER_IDS.length === 0) {
  console.error('--generated: this content document generates no rooms');
  process.exit(1);
}

const mode = modeId === '' ? null : MODE_PROFILES[modeId];
if (modeId !== '' && mode === undefined) {
  console.error(`unknown mode: ${modeId} (have: ${Object.keys(MODE_PROFILES).join(', ')})`);
  process.exit(1);
}
const resolvedEncounters = sweepingGenerated
  ? GENERATED_ENCOUNTER_IDS
  : mode !== null && !process.argv.some((a) => a.startsWith('--encounters='))
    ? [mode.encounterId]
    : encounters;
const resolvedCombat =
  mode !== null && !process.argv.some((a) => a.startsWith('--combat=')) ? mode.combatId : combatId;
const slowMoArg = listArg('slowmo', [])[0];
const resolvedSlowMo = slowMoArg ?? (mode !== null ? mode.slowMoId : undefined);

const startedAt = new Date().toISOString();
const pad = (value, width) => String(value).padEnd(width);
const num = (value, digits = 0) => (value === null ? '--' : value.toFixed(digits));

console.log(
  mode === null
    ? `\ncombat preset: ${resolvedCombat}`
    : `\nmode: ${mode.name} (${mode.source}) — ${mode.question}` +
      `\ncombat ${resolvedCombat} / encounter ${mode.encounterId} / presentation ${mode.presentationId} / slow-motion ${mode.slowMoId}` +
      `\nwatch for: ${mode.watchFor}`,
);
console.log(
  `\n${pad('encounter', 20)} ${pad('pilot', 7)} ${pad('seed', 5)} ${pad('outcome', 8)} ` +
    `${pad('time', 7)} ${pad('parry', 10)} ${pad('sd', 6)} ${pad('dmg', 5)} ${pad('tail', 6)} ` +
    `${pad('kills', 7)} ${pad('waves', 7)} replay`,
);

let failures = 0;
let stalemates = 0;
const written = [];
const sweep = [];

for (const encounterId of resolvedEncounters) {
  for (const skillId of skills) {
    for (const seed of seeds) {
      const result = runPilotEncounter({
        encounterId,
        seed,
        skillId,
        combatId: resolvedCombat,
        slowMoId: resolvedSlowMo,
        startedAt,
        maxMs,
      });
      const m = result.metrics;
      const parry =
        m.parryAttempts === 0
          ? '     --   '
          : pad(`${m.parrySuccesses}/${m.parryAttempts} ${num(m.parryAccuracy * 100)}%`, 10);

      if (!result.replayOk) failures += 1;
      if (m.outcome === 'running') stalemates += 1;

      const def = encounterForSeed(encounterId, seed);


      const clocked = def.waves.some((wave) => wave.atMs !== null);
      const delivered = clocked
        ? def.waves.filter((wave) => (wave.atMs ?? 0) <= m.durationMs)
        : def.waves;
      const spawned = delivered.reduce((total, wave) => total + wave.spawns.length, 0);
      const reached = clocked ? `${delivered.length}/${def.waves.length}` : '--';
      sweep.push({
        encounterId,
        skillId,
        seed,
        outcome: m.outcome,
        spawned,
        killed: m.enemiesKilled,
        ms: m.durationMs,
        wavesReached: clocked ? delivered.length : null,
      });

      console.log(
        `${pad(encounterId, 20)} ${pad(skillId, 7)} ${pad(seed, 5)} ${pad(m.outcome, 8)} ` +
          `${pad(`${(m.durationMs / 1000).toFixed(1)}s`, 7)} ${parry} ${pad(num(m.offsetSd), 6)} ` +
          `${pad(num(m.damageTaken), 5)} ${pad(`${m.woundsInOwnRecovery}/${m.hitsTaken}`, 6)} ` +
          `${pad(`${m.enemiesKilled}/${spawned}`, 7)} ${pad(reached, 7)} ` +
          `${result.replayOk ? 'ok' : `DIVERGED at tick ${result.divergedAtTick}`}`,
      );

      if (write) {
        const file = resolve(outDir, `pilot_${encounterId}_${skillId}_seed${seed}.json`);
        await mkdir(outDir, { recursive: true });
        await writeFile(file, `${JSON.stringify(result.record, null, 2)}\n`);
        written.push(file);
      }
    }
  }
}


if (sweepingGenerated) {
  const cleared = sweep.filter((run) => run.outcome === 'cleared');
  const walled = sweep.filter((run) => run.outcome === 'running');
  const unreached = walled.filter((run) => run.killed < run.spawned);
  const times = cleared.map((run) => run.ms / 1000).sort((a, b) => a - b);
  const seedList = (runs) => runs.map((run) => run.seed).join(', ');
  const named = (outcome) => sweep.filter((run) => run.outcome === outcome);

  console.log(`\nGENERATED SWEEP — ${sweep.length} run(s) over ${resolvedEncounters.join(', ')}`);
  console.log(`  cleared     ${cleared.length}/${sweep.length}`);
  console.log(`  died        ${named('dead').length}${named('dead').length > 0 ? ` — seeds ${seedList(named('dead'))}` : ''}`);
  console.log(`  timed out   ${named('timeout').length}${named('timeout').length > 0 ? ` — seeds ${seedList(named('timeout'))}` : ''}`);
  console.log(`  time wall   ${walled.length}${walled.length > 0 ? ` — seeds ${seedList(walled)}` : ''}`);
  console.log(
    `  unreached   ${unreached.length}${unreached.length > 0 ? ` — seeds ${seedList(unreached)} (bodies alive at the wall: a stranding, or a room the pilot cannot fight in)` : ''}`,
  );
  if (times.length > 0) {
    console.log(
      `  clear time  ${times[0].toFixed(1)}s fastest · ${times[Math.floor(times.length / 2)].toFixed(1)}s median · ` +
        `${times[times.length - 1].toFixed(1)}s slowest`,
    );
  }
  console.log(
    '  Instrument rung (ADR-007): this is a script playing, so it says whether a floor works and\n' +
      '  nothing about a player. Findings go to docs/11-PILOT-FINDINGS.md, never the evidence log.',
  );
}

if (written.length > 0) {
  console.log(
    `\n${written.length} run${written.length === 1 ? '' : 's'} written to ` +
      `${relative(root, outDir)}/ — press 7 in the lab to load one and watch it back.`,
  );
}
if (stalemates > 0) {
  console.log(`${stalemates} run(s) hit the time wall without an outcome — reported, not rounded.`);
}
if (failures > 0) {
  console.error(`\n${failures} run(s) did not reproduce from their own intent stream.`);
  process.exitCode = 1;
}
