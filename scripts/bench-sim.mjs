import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { loadSim } from './bundle-sim.mjs';
import { listArg } from './lib/args.mjs';

const root = resolve(import.meta.dirname, '..');


const DEFAULT_ROOMS = [
  'kernel_guard',
  'siege_10',
  'shape_combat_bowl',
  'maze_serpentine:1',
  'maze_serpentine:3',
  'maze_serpentine:6',
  'maze_serpentine',
];
const DEFAULT_PARRY_ROOMS = ['captain_read', 'kernel_duelist'];
const DEFAULT_FPS = [120, 60, 45, 30, 20, 15, 10];

const only = listArg('only', ['tick', 'parry']);
const rooms = listArg('rooms', DEFAULT_ROOMS);
const parryRooms = listArg('parry-rooms', DEFAULT_PARRY_ROOMS);
const seeds = listArg('seeds', ['1', '2', '3']).map(Number);
const parrySeeds = listArg('parry-seeds', ['1', '2', '3', '4', '5', '6', '7', '8']).map(Number);
const ticks = Number(listArg('ticks', ['3000'])[0]);
const frameRates = listArg('fps', DEFAULT_FPS.map(String)).map(Number);
const combatId = listArg('combat', ['Default'])[0];


const kit = await loadSim('src/lab/bench-kit.ts', 'bench-kit');
const { MAX_CATCHUP_MS } = await loadSim('src/app/frame.ts', 'bench-frame-clock');

const {
  COMBAT_PRESETS,
  DEFAULT_PILOT_SKILL_ID,
  DEFAULT_SLOWMO_ID,
  ENCOUNTERS,
  PILOT_SKILLS,
  Pilot,
  SLOWMO_PRESETS,
  TICK_MS,
  createWorld,
  stepWorld,
  summarize,
  thinRoster,
} = kit;

const combat = COMBAT_PRESETS[combatId];
if (combat === undefined) {
  console.error(`unknown combat preset: ${combatId} (have: ${Object.keys(COMBAT_PRESETS).join(', ')})`);
  process.exit(1);
}
const slowMo = SLOWMO_PRESETS[DEFAULT_SLOWMO_ID];
const skill = PILOT_SKILLS[DEFAULT_PILOT_SKILL_ID];

const resolveRoom = (spec) => {
  const [id, bodies] = spec.split(':');
  const def = ENCOUNTERS[id];
  if (def === undefined) {
    console.error(`unknown encounter: ${id}`);
    process.exit(1);
  }
  return {
    label: bodies === undefined ? id : `${id} (${bodies})`,
    def: bodies === undefined ? def : thinRoster(def, Number(bodies)),
  };
};

const pad = (value, width) => String(value).padEnd(width);
const right = (value, width, digits = 1) =>
  (typeof value === 'number' ? value.toFixed(digits) : String(value)).padStart(width);


const benchTick = () => {
  console.log(`\nWHAT A TICK COSTS — ${ticks} ticks x ${seeds.length} seeds, combat ${combatId}`);
  console.log(
    `${pad('room', 26)}${right('cells', 7)}${right('bodies', 8)}${right('ticks', 8)}` +
      `${right('mean', 9)}${right('p50', 9)}${right('p95', 9)}${right('max', 9)}${right('pilot', 9)}`,
  );

  for (const spec of rooms) {
    const { label, def } = resolveRoom(spec);
    const stepUs = [];
    const intentUs = [];
    let bodySum = 0;
    let cells = 1;

    for (const seed of seeds) {
      const cfg = structuredClone(combat);
      const world = createWorld(def, cfg, seed);
      cells = world.arena.regions?.length > 0 ? world.arena.regions.length : 1;
      const pilot = new Pilot(skill, seed);
      for (let i = 0; i < 200 && world.outcome === 'running'; i++) {
        stepWorld(world, [pilot.intent(world, cfg)], cfg, slowMo, def);
      }
      for (let i = 0; i < ticks && world.outcome === 'running'; i++) {
        const t0 = performance.now();
        const intent = pilot.intent(world, cfg);
        const t1 = performance.now();
        stepWorld(world, [intent], cfg, slowMo, def);
        intentUs.push((t1 - t0) * 1000);
        stepUs.push((performance.now() - t1) * 1000);
        bodySum += world.enemies.filter((enemy) => enemy.hp > 0).length;
      }
    }

    const step = summarize(stepUs);
    const intent = summarize(intentUs);
    console.log(
      `${pad(label, 26)}${right(cells, 7, 0)}${right(bodySum / Math.max(1, step.samples), 8)}` +
        `${right(step.samples, 8, 0)}${right(step.mean, 9)}${right(step.p50, 9)}` +
        `${right(step.p95, 9)}${right(step.max, 9)}${right(intent.mean, 9)}`,
    );
  }
  console.log(
    `\nµs per stepWorld call. TICK_HZ is 120, so a 60 Hz frame runs two of them: a 16.7 ms frame` +
      ` is ${(16_666 / 2).toFixed(0)} µs of budget per tick.`,
  );
};


const playFramed = (def, seed, frameMs, tally) => {
  const cfg = structuredClone(combat);
  const world = createWorld(def, cfg, seed);
  const pilot = new Pilot(skill, seed);
  let pending = 0;

  for (let frame = 0; frame < 20_000 && world.outcome === 'running'; frame++) {
    pending = Math.min(MAX_CATCHUP_MS, pending + frameMs);
    const framed = pilot.intent(world, cfg);
    let spent = 0;
    let first = true;

    while (spent + TICK_MS <= pending && world.outcome === 'running') {
      stepWorld(world, [first ? framed : { ...framed, guardPressed: false }], cfg, slowMo, def);
      first = false;
      spent += TICK_MS;

      for (const event of world.events) {
        if (event.type === 'parry_success') tally.perfect++;
        else if (event.type === 'parry_failed') tally.failed++;
        else if (event.type === 'hit_received') tally.hits++;
      }
    }
    pending -= spent;
  }
  if (world.outcome === 'cleared') tally.cleared++;
};

const benchParry = () => {
  console.log(`\nWHAT A SLOW FRAME COSTS THE PARRY — ${parrySeeds.length} seeds, combat ${combatId}`);
  console.log(
    `${pad('room', 20)}${right('fps', 6)}${right('attempts', 10)}${right('perfect', 9)}` +
      `${right('rate', 8)}${right('hits', 7)}${right('cleared', 9)}`,
  );

  for (const spec of parryRooms) {
    const { label, def } = resolveRoom(spec);
    for (const fps of frameRates) {
      const tally = { perfect: 0, failed: 0, hits: 0, cleared: 0 };
      for (const seed of parrySeeds) playFramed(def, seed, 1000 / fps, tally);
      const attempts = tally.perfect + tally.failed;
      const rate = attempts === 0 ? 0 : (tally.perfect / attempts) * 100;
      console.log(
        `${pad(label, 20)}${right(fps, 6, 0)}${right(attempts, 10, 0)}${right(tally.perfect, 9, 0)}` +
          `${right(`${rate.toFixed(1)}%`, 8)}${right(tally.hits, 7, 0)}` +
          `${right(`${tally.cleared}/${parrySeeds.length}`, 9)}`,
      );
    }
    console.log('');
  }
  console.log('Attempts against hits received is the pair that means something; rate alone is not.');
};

if (only.includes('tick')) benchTick();
if (only.includes('parry')) benchParry();
