
import { arenaContains } from '../sim/arena';
import { makeRng, nextInt, nextRange } from '../sim/rng';
import type { Arena, EncounterDef, EnemyArchetype, Vec2, WaveDef } from '../sim/types';
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

export const BOSS_EVERY = 5;

export const WAVE_COUNT = 100;

export const BOSS_WAVE_ESCORT_SHARE = 0.2;
export const BOSS_WAVE_ESCORT_CAP = 4;

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

const placeAround = (arena: Arena, from: Vec2, angle: number, radius: number): Vec2 => {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  for (let r = radius; r > 0; r -= 0.25) {
    const at = { x: from.x + dx * r, y: from.y + dy * r };
    if (arenaContains(arena, at, 0.5)) return at;
  }
  return { ...from };
};

export const planEternalSiege = (
  arena: Arena,
  playerStart: Vec2,
  spec: EternalSiegeSpec = ETERNAL_SIEGE_SPEC,
): WaveDef[] => {
  const rng = makeRng(spec.seed);
  const cheapest = Math.min(...SIEGE_RABBLE.map((archetype) => THREAT_COST[archetype]));

  return Array.from({ length: WAVE_COUNT }, (_, index) => {
    const spawns: WaveDef['spawns'] = [];
    const bossWave = (index + 1) % BOSS_EVERY === 0;

    if (bossWave) {
      const boss = SIEGE_BOSSES[nextInt(rng, 0, SIEGE_BOSSES.length)];
      spawns.push({
        archetype: boss,
        at: placeAround(
          arena,
          playerStart,
          nextRange(rng, 0, Math.PI * 2),
          nextRange(rng, spec.minSpawnDistance, spec.maxSpawnDistance),
        ),
      });
    }




    let remaining = spec.openingBudget + index * spec.budgetPerWave;
    if (bossWave) remaining = Math.min(remaining * BOSS_WAVE_ESCORT_SHARE, BOSS_WAVE_ESCORT_CAP);
    while (remaining >= cheapest) {
      const affordable = SIEGE_RABBLE.filter(
        (archetype) => THREAT_COST[archetype] <= remaining + 1e-9,
      );
      if (affordable.length === 0) break;
      const archetype = affordable[nextInt(rng, 0, affordable.length)];
      remaining -= THREAT_COST[archetype];
      spawns.push({
        archetype,
        at: placeAround(
          arena,
          playerStart,
          nextRange(rng, 0, Math.PI * 2),
          nextRange(rng, spec.minSpawnDistance, spec.maxSpawnDistance),
        ),
      });
    }

    return { id: `w${index + 1}`, atMs: index === 0 ? 0 : null, spawns };
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
