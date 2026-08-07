
import type {
  CombatConfig,
  EnemyArchetype,
  EncounterDef,
  Intent,
  SlowMoConfig,
  Vec2,
  World,
} from '../../src/sim/types';
import { NEUTRAL_INTENT, TICK_MS } from '../../src/sim/types';
import { createWorld } from '../../src/sim/encounter';
import { stepWorld } from '../../src/sim/world';
import { DEFAULT_COMBAT, SLOWMO_PRESETS } from '../../src/lab/config';
import { ENCOUNTERS } from '../../src/lab/encounters';

export const cfg = (): CombatConfig => structuredClone(DEFAULT_COMBAT);
export const noSlowMo = (): SlowMoConfig => structuredClone(SLOWMO_PRESETS.none);

export const emptyEncounter = (playerStart: Vec2 = { x: 0, y: 0 }): EncounterDef => ({
  id: 'test_empty',
  description: 'One wave, never due. Steps a subsystem without an encounter verdict.',
  arena: { halfExtents: { x: 20, y: 20 } },
  playerStart,
  waves: [{ id: 'never', atMs: Number.POSITIVE_INFINITY, spawns: [] }],
  timeLimitMs: null,
});

export const oneEnemy = (
  archetype: EnemyArchetype,
  at: Vec2,
  playerStart: Vec2 = { x: 0, y: 0 },
): EncounterDef => ({
  id: `test_${archetype}`,
  description: 'One enemy, no clock.',
  arena: { halfExtents: { x: 20, y: 20 } },
  playerStart,
  waves: [{ id: 'w1', atMs: 0, spawns: [{ archetype, at }] }],
  timeLimitMs: null,
});

export const intent = (over: Partial<Intent> = {}): Intent => ({
  ...NEUTRAL_INTENT,
  move: { x: 0, y: 0 },
  ...over,
});

export const bareWorld = (combat: CombatConfig = cfg()): World => {
  const w = createWorld(emptyEncounter(), combat, 1);
  w.players[0].facing = 0;
  w.events.length = 0;
  return w;
};

export interface StepOpts {
  combat?: CombatConfig;
  slowMo?: SlowMoConfig;
  encounter?: EncounterDef;
}

export const run = (
  world: World,
  n: number,
  input: Intent = intent(),
  opts: StepOpts = {},
): World['events'] => {
  const combat = opts.combat ?? cfg();
  const slowMo = opts.slowMo ?? noSlowMo();
  const encounter = opts.encounter ?? emptyEncounter();
  const collected: World['events'] = [];
  for (let i = 0; i < n; i++) {
    stepWorld(world, [input], combat, slowMo, encounter);
    collected.push(...world.events);
  }
  return collected;
};

export const runUntil = (
  world: World,
  predicate: (w: World) => boolean,
  opts: StepOpts & { input?: Intent; maxTicks?: number } = {},
): World['events'] => {
  const maxTicks = opts.maxTicks ?? 20_000;
  const collected: World['events'] = [];
  for (let i = 0; i < maxTicks; i++) {
    if (predicate(world)) return collected;
    collected.push(...run(world, 1, opts.input ?? intent(), opts));
  }
  throw new Error(`runUntil exceeded ${maxTicks} ticks (${(maxTicks * TICK_MS) / 1000}s)`);
};

export const ticksFor = (ms: number): number => Math.ceil(ms / TICK_MS);

export const typesOf = (events: World['events']): string[] => events.map((e) => e.type);

export const firstOf = (events: World['events'], type: string) =>
  events.find((e) => e.type === type);

export const countOf = (events: World['events'], type: string): number =>
  events.filter((e) => e.type === type).length;

export { ENCOUNTERS, TICK_MS };
