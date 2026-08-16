
import { arenaContains, arenaVertices } from '../sim/arena';
import { makeRng, nextInt } from '../sim/rng';
import type { Arena, EncounterDef, EnemyArchetype, RngState, Vec2, WaveDef } from '../sim/types';
import { THREAT_COST } from './threat-budget';

export const ETERNAL_SIEGE_ID = 'eternal_siege';

export const SIEGE_RABBLE: readonly EnemyArchetype[] = ['guard', 'duelist', 'archer', 'pike_novice'];




export const SIEGE_BOSSES: readonly EnemyArchetype[] = [
  'first_blade',
  'captain',
  'chancellor',
  'glass_regent',
  'queen',
  'thorn_marshal',
];

const bossForAppearance = (n: number, rng: RngState): EnemyArchetype => {
  const round = Math.floor(n / SIEGE_BOSSES.length);
  const slot = n % SIEGE_BOSSES.length;
  if (round === 0) return FIRST_ROUND[slot];
  const bag = [...SIEGE_BOSSES];
  for (let i = bag.length - 1; i > 0; i--) {
    const j = nextInt(rng, 0, i + 1);
    const swap = bag[i];
    bag[i] = bag[j];
    bag[j] = swap;
  }
  return bag[slot];
};

const ESCORT_AFFINITY: Readonly<Partial<Record<EnemyArchetype, readonly EnemyArchetype[]>>> = {
  glass_regent: ['guard', 'duelist'],
  queen: ['guard', 'duelist'],
  chancellor: ['guard', 'duelist', 'pike_novice'],
};

const rangedWeight = (archetype: EnemyArchetype, index: number): number => {
  const ranged = archetype === 'archer';
  if (!ranged) return 1;
  return 1 + Math.min(1, index / 60) * 1.5;
};

export const BOSS_EVERY = 5;

const FIRST_ROUND: readonly EnemyArchetype[] = [
  'first_blade',
  'captain',
  'thorn_marshal',
  'chancellor',
  'glass_regent',
  'queen',
];

export const WAVE_COUNT = 100;

export const BOSS_WAVE_ESCORT_CAP = 4;

export const BEAT_SHARE = [0.2, 0.55, 0.8, 1.25, 0.2] as const;

export const WAVE_BREATH_MS = 1800;

export const BOSS_BREATH_MS = 3600;

export const MS_PER_THREAT = 2600;

export interface EternalSiegeSpec {
  seed: number;
  openingBudget: number;
  budgetPerWave: number;
  minSpawnDistance: number;
  maxSpawnDistance: number;
}

export const ETERNAL_SIEGE_SPEC: EternalSiegeSpec = {
  seed: 0x51e6e,
  openingBudget: 2,
  budgetPerWave: 0.5,
  minSpawnDistance: 4.5,
  maxSpawnDistance: 7.5,
};

export const SIEGE_GATES = 8;

export const GATE_INSET = 1.1;

const gateRing = (arena: Arena, inset: number): Vec2[] => {
  const vertices = arenaVertices(arena);
  if (vertices.length < 3) return [];
  const edge = (i: number) => {
    const a = vertices[i];
    const b = vertices[(i + 1) % vertices.length];
    return { a, b, len: Math.hypot(b.x - a.x, b.y - a.y) };
  };
  const edges = vertices.map((_, i) => edge(i));
  const total = edges.reduce((sum, e) => sum + e.len, 0);
  const centre = vertices.reduce(
    (acc, v) => ({ x: acc.x + v.x / vertices.length, y: acc.y + v.y / vertices.length }),
    { x: 0, y: 0 },
  );

  const gates: Vec2[] = [];
  for (let g = 0; g < SIEGE_GATES; g++) {
    let along = (total * g) / SIEGE_GATES;
    for (const e of edges) {
      if (along > e.len) {
        along -= e.len;
        continue;
      }
      const t = e.len === 0 ? 0 : along / e.len;
      const on = { x: e.a.x + (e.b.x - e.a.x) * t, y: e.a.y + (e.b.y - e.a.y) * t };
      const dx = centre.x - on.x;
      const dy = centre.y - on.y;
      const d = Math.hypot(dx, dy) || 1;
      gates.push({ x: on.x + (dx / d) * inset, y: on.y + (dy / d) * inset });
      break;
    }
  }
  return gates;
};

const gateFor = (gates: readonly Vec2[], arena: Arena, from: Vec2, rng: RngState): Vec2 => {
  if (gates.length === 0) return { ...from };
  const at = gates[nextInt(rng, 0, gates.length)];
  return arenaContains(arena, at, 0.5) ? { ...at } : { ...from };
};

export const planEternalSiege = (
  arena: Arena,
  playerStart: Vec2,
  spec: EternalSiegeSpec = ETERNAL_SIEGE_SPEC,
): WaveDef[] => {
  const rng = makeRng(spec.seed);





  const ring = gateRing(arena, GATE_INSET);
  const usable = ring.filter(
    (gate) => Math.hypot(gate.x - playerStart.x, gate.y - playerStart.y) >= spec.minSpawnDistance,
  );
  const gates = usable.length > 0 ? usable : ring;
  let at = 0;

  return Array.from({ length: WAVE_COUNT }, (_, index) => {
    const spawns: WaveDef['spawns'] = [];
    const bossWave = (index + 1) % BOSS_EVERY === 0;
    const beat = index % BOSS_EVERY;

    if (bossWave) {
      const boss = bossForAppearance(Math.floor(index / BOSS_EVERY), rng);
      spawns.push({
        archetype: boss,
        at: gateFor(gates, arena, playerStart, rng),
      });
    }






    const ceiling = spec.openingBudget + index * spec.budgetPerWave;
    let remaining = ceiling * BEAT_SHARE[beat];
    if (bossWave) remaining = Math.min(remaining, BOSS_WAVE_ESCORT_CAP);
    const roster =
      bossWave && spawns.length > 0
        ? (ESCORT_AFFINITY[spawns[0].archetype] ?? SIEGE_RABBLE)
        : SIEGE_RABBLE;
    const floorCost = Math.min(...roster.map((archetype) => THREAT_COST[archetype]));


    if (!bossWave) remaining = Math.max(remaining, floorCost);
    while (remaining >= floorCost) {
      const affordable = roster.filter((archetype) => THREAT_COST[archetype] <= remaining + 1e-9);
      if (affordable.length === 0) break;


      const weights = affordable.map((a) => rangedWeight(a, index));
      const total = weights.reduce((sum, w) => sum + w, 0);
      let roll = (nextInt(rng, 0, 1024) / 1024) * total;
      let archetype = affordable[affordable.length - 1];
      for (let k = 0; k < affordable.length; k++) {
        roll -= weights[k];
        if (roll <= 0) {
          archetype = affordable[k];
          break;
        }
      }
      remaining -= THREAT_COST[archetype];
      spawns.push({
        archetype,
        at: gateFor(gates, arena, playerStart, rng),
      });
    }

    const wave = { id: `w${index + 1}`, atMs: at, spawns };
    const weight = spawns.reduce((sum, spawn) => sum + THREAT_COST[spawn.archetype], 0);
    const nextIsBoss = (index + 2) % BOSS_EVERY === 0;
    at += (nextIsBoss ? BOSS_BREATH_MS : WAVE_BREATH_MS) + weight * MS_PER_THREAT;
    return wave;
  });
};

export const eternalSiegeFrom = (room: EncounterDef, seed?: number): EncounterDef => ({
  ...room,
  id: ETERNAL_SIEGE_ID,
  description:
    'The eternal siege: generated waves in the Lantern Cloister, a boss every fifth wave.',
  waves: planEternalSiege(
    room.arena,
    room.playerStart,
    seed === undefined ? ETERNAL_SIEGE_SPEC : { ...ETERNAL_SIEGE_SPEC, seed },
  ),
  timeLimitMs: null,
});
