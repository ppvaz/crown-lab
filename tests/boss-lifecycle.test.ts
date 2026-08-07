
import { DEFAULT_COMBAT, SLOWMO_PRESETS } from '../src/lab/config';
import { ENCOUNTERS, encounterHasBoss } from '../src/lab/encounters';
import { createWorld } from '../src/sim/encounter';
import type { EnemyArchetype } from '../src/sim/types';
import { enemyIsInvulnerable, NEUTRAL_INTENT } from '../src/sim/types';
import { stepWorld } from '../src/sim/world';

const cases = [
  ['first_blade', 'first_blade'],
  ['captain', 'captain'],
  ['projectile_rain_boss', 'rain_boss'],
] as const satisfies ReadonlyArray<[string, EnemyArchetype]>;

describe('the shared boss lifecycle', () => {
  it('is configured once with one complete display name per boss', () => {
    const lifecycles = cases.map(([, archetype]) => DEFAULT_COMBAT.enemies[archetype].boss);

    expect(lifecycles.every((lifecycle) => lifecycle !== undefined)).toBe(true);
    expect(lifecycles.map((lifecycle) => lifecycle?.name)).toEqual([
      'THE FIRST BLADE',
      'THE CAPTAIN OF THE GUARD',
      'PERIPHERAL STUDY',
    ]);
    expect(
      lifecycles.map((lifecycle) => ({
        fall: lifecycle?.entranceFallMs,
        intro: lifecycle?.introRoarMs,
        threshold: lifecycle?.phaseTwoHpFraction,
        phase: lifecycle?.phaseRoarMs,
      })),
    ).toEqual([
      { fall: 720, intro: 980, threshold: 0.5, phase: 920 },
      { fall: 720, intro: 980, threshold: 0.5, phase: 920 },
      { fall: 720, intro: 980, threshold: 0.5, phase: 920 },
    ]);
  });

  it('marks every boss encounter for the shared pre-entrance music gate', () => {
    for (const [encounterId] of cases) {
      expect(encounterHasBoss(ENCOUNTERS[encounterId], DEFAULT_COMBAT)).toBe(true);
    }
    expect(encounterHasBoss(ENCOUNTERS.kernel_guard, DEFAULT_COMBAT)).toBe(false);
  });

  it.each(cases)('%s falls and roars before its AI can begin', (encounterId, archetype) => {
    const cfg = structuredClone(DEFAULT_COMBAT);
    const encounter = ENCOUNTERS[encounterId];
    const world = createWorld(encounter, cfg, 19);
    stepWorld(world, [NEUTRAL_INTENT], cfg, SLOWMO_PRESETS.none, encounter);
    const subject = world.enemies.find((enemy) => enemy.archetype === archetype);
    expect(subject?.state.kind).toBe('entrance_fall');
    expect(subject === undefined ? false : enemyIsInvulnerable(subject)).toBe(true);

    let fightStarted = false;
    for (let i = 0; i < 300 && !fightStarted; i++) {
      stepWorld(world, [NEUTRAL_INTENT], cfg, SLOWMO_PRESETS.none, encounter);
      fightStarted = world.events.some((event) => event.type === 'boss_fight_started');
      if (subject?.state.kind === 'entrance_roar') expect(enemyIsInvulnerable(subject)).toBe(true);
    }

    expect(fightStarted).toBe(true);
    expect(subject?.state.kind).toBe('approach');
  });

  it.each(cases)('%s enters an invulnerable phase roar at the shared threshold', (
    encounterId,
    archetype,
  ) => {
    const cfg = structuredClone(DEFAULT_COMBAT);
    const encounter = ENCOUNTERS[encounterId];
    const world = createWorld(encounter, cfg, 23);
    stepWorld(world, [NEUTRAL_INTENT], cfg, SLOWMO_PRESETS.none, encounter);
    const subject = world.enemies.find((enemy) => enemy.archetype === archetype);
    if (subject === undefined) throw new Error(`${encounterId} did not spawn ${archetype}`);

    subject.state.kind = 'approach';
    subject.state.elapsedMs = 0;
    subject.hp = subject.maxHp * (cfg.enemies[archetype].boss?.phaseTwoHpFraction ?? 0.5);
    stepWorld(world, [NEUTRAL_INTENT], cfg, SLOWMO_PRESETS.none, encounter);

    expect(subject.state.kind).toBe('phase_roar');
    expect(enemyIsInvulnerable(subject)).toBe(true);
    expect(world.events.some((event) => event.type === 'boss_phase_roar_started')).toBe(true);

    let changed = false;
    for (let i = 0; i < 180 && !changed; i++) {
      stepWorld(world, [NEUTRAL_INTENT], cfg, SLOWMO_PRESETS.none, encounter);
      changed = world.events.some(
        (event) => event.type === 'enemy_phase_changed' && event.data?.phase === 2,
      );
    }

    expect(changed).toBe(true);
    expect(subject.phase).toBe(2);
    expect(subject.state.kind).not.toBe('phase_roar');
  });

  it.each(cases)('%s names the phase on every telegraph it emits', (encounterId, archetype) => {
    const cfg = structuredClone(DEFAULT_COMBAT);
    const encounter = ENCOUNTERS[encounterId];
    const world = createWorld(encounter, cfg, 29);
    stepWorld(world, [NEUTRAL_INTENT], cfg, SLOWMO_PRESETS.none, encounter);
    const subject = world.enemies.find((enemy) => enemy.archetype === archetype);
    if (subject === undefined) throw new Error(`${encounterId} did not spawn ${archetype}`);

    const phaseOf = (limit: number): unknown => {
      for (let i = 0; i < limit; i++) {
        stepWorld(world, [NEUTRAL_INTENT], cfg, SLOWMO_PRESETS.none, encounter);
        const telegraph = world.events.find((event) => event.type === 'enemy_telegraph');
        if (telegraph !== undefined) return telegraph.data?.phase;
      }
      throw new Error(`${archetype} never telegraphed`);
    };

    expect(phaseOf(600)).toBe(1);

    subject.hp = subject.maxHp * (cfg.enemies[archetype].boss?.phaseTwoHpFraction ?? 0.5);
    for (let i = 0; i < 300 && subject.phase !== 2; i++) {
      stepWorld(world, [NEUTRAL_INTENT], cfg, SLOWMO_PRESETS.none, encounter);
    }

    expect(subject.phase).toBe(2);
    expect(phaseOf(600)).toBe(2);
  });
});
