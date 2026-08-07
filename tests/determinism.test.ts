
import type { CombatConfig, Intent, World } from '../src/sim/types';
import { createWorld } from '../src/sim/encounter';
import { hashWorld, stepWorld } from '../src/sim/world';
import { SLOWMO_PRESETS } from '../src/lab/config';
import { cfg, noSlowMo, oneEnemy } from './support/world';

const scriptedIntent = (t: number): Intent => ({
  move: { x: Math.sin(t * 0.11), y: Math.cos(t * 0.07) },
  facing: null,
  lightPressed: t % 97 === 5,
  heavyPressed: t % 211 === 17,
  guardHeld: t % 53 < 20,
  guardPressed: t % 53 === 0,
  stepPressed: t % 173 === 41,
  focusPressed: t % 307 === 3,
  interactPressed: t % 401 === 29,
  powerPressed: t % 131 === 11,
  powerHeld: t % 97 < 30,
  aimDistance: t % 29 === 0 ? null : (t % 71) / 10,
});

const durable = (): CombatConfig => {
  const c = cfg();
  c.player.maxHp = 1e6;
  c.enemies.duelist.maxHp = 1e6;
  return c;
};

const encounterDef = () => oneEnemy('duelist', { x: 3, y: 0 });

const play = (
  world: World,
  ticks: number,
  combat: CombatConfig,
  slowMo = noSlowMo(),
  from = 0,
): void => {
  const def = encounterDef();
  for (let t = from; t < from + ticks; t++) {
    stepWorld(world, [scriptedIntent(t)], combat, slowMo, def);
  }
};

const TICKS = 1500;

describe('determinism', () => {
  it('produces an identical world from the same seed and intent stream', () => {
    const a = createWorld(encounterDef(), durable(), 12345);
    const b = createWorld(encounterDef(), durable(), 12345);

    play(a, TICKS, durable());
    play(b, TICKS, durable());

    expect(hashWorld(a)).toBe(hashWorld(b));
    expect(a.players[0].pos).toEqual(b.players[0].pos);
    expect(a.rng.value).toBe(b.rng.value);
    expect(a.enemies.map((e) => e.hp)).toEqual(b.enemies.map((e) => e.hp));
  });

  it('diverges on a different seed', () => {
    const a = createWorld(encounterDef(), durable(), 1);
    const b = createWorld(encounterDef(), durable(), 2);

    play(a, TICKS, durable());
    play(b, TICKS, durable());

    expect(hashWorld(a)).not.toBe(hashWorld(b));
  });

  it('moves the hash as the world evolves', () => {
    const w = createWorld(encounterDef(), durable(), 99);
    const atRest = hashWorld(w);
    play(w, TICKS, durable());
    expect(hashWorld(w)).not.toBe(atRest);
  });

  it('survives a JSON round-trip and resumes bit-identically', () => {
    const original = createWorld(encounterDef(), durable(), 4242);
    play(original, 500, durable());

    const revived = JSON.parse(JSON.stringify(original)) as World;
    expect(hashWorld(revived)).toBe(hashWorld(original));

    play(original, 500, durable(), noSlowMo(), 500);
    play(revived, 500, durable(), noSlowMo(), 500);

    expect(hashWorld(revived)).toBe(hashWorld(original));
  });

  it('replays identically with slow motion active', () => {
    const slowMo = () => structuredClone(SLOWMO_PRESETS.static);
    const a = createWorld(encounterDef(), durable(), 777);
    const b = createWorld(encounterDef(), durable(), 777);
    a.slowMo.pending = 'perfect_parry';
    b.slowMo.pending = 'perfect_parry';

    play(a, TICKS, durable(), slowMo());
    play(b, TICKS, durable(), slowMo());

    expect(hashWorld(a)).toBe(hashWorld(b));
    expect(a.players[0].slowMoUsedThisEncounter).toBe(b.players[0].slowMoUsedThisEncounter);
    expect(a.players[0].slowMoUsedThisEncounter).toBeGreaterThan(0);
  });
});

describe('the sim uses exactly-rounded arithmetic', () => {
  const APPROXIMATED = ['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2', 'hypot', 'exp', 'log', 'pow', 'cbrt', 'sinh', 'cosh', 'tanh'];

  it('calls no approximated Math function anywhere under src/sim/', async () => {
    const { readdirSync, readFileSync } = await import('node:fs');
    const { join } = await import('node:path');

    const dir = join(process.cwd(), 'src', 'sim');
    const banned = new RegExp(`Math\\.(${APPROXIMATED.join('|')})\\s*\\(`);
    const offenders: string[] = [];
    for (const entry of readdirSync(dir)) {
      if (!entry.endsWith('.ts')) continue;
      const source = readFileSync(join(dir, entry), 'utf8');
      source.split('\n').forEach((line, index) => {
        if (banned.test(line)) offenders.push(`src/sim/${entry}:${index + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it('routes the sim through src/sim/trig.ts rather than leaving the calls absent', async () => {
    const { readdirSync, readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const dir = join(process.cwd(), 'src', 'sim');
    const importers = readdirSync(dir).filter(
      (entry) =>
        entry.endsWith('.ts') &&
        entry !== 'trig.ts' &&
        /from '\.\/trig'/.test(readFileSync(join(dir, entry), 'utf8')),
    );
    expect(importers.sort()).toEqual([
      'combat.ts',
      'companion.ts',
      'encounter.ts',
      'enemy.ts',
      'player.ts',
      'powers.ts',
      'vec.ts',
      'volley.ts',
      'world.ts',
    ]);
  });
});
