
import { DEFAULT_COMBAT, COMBAT_PRESETS } from '../src/lab/config';
import type { CombatConfig, EncounterDef, World } from '../src/sim/types';
import { createWorld } from '../src/sim/encounter';
import { fingerprintWorld } from '../src/sim/fingerprint';
import { cfg, countOf, intent, run, ticksFor } from './support/world';

const court = (): EncounterDef => ({
  id: 'test_overlap',
  description: 'A guard and an archer, both already in reach.',
  arena: { halfExtents: { x: 20, y: 20 } },
  playerStart: { x: 0, y: 0 },
  waves: [
    {
      id: 'w1',
      atMs: 0,
      spawns: [
        { archetype: 'guard', at: { x: 1.6, y: 0 } },
        { archetype: 'archer', at: { x: -6, y: 0 } },
      ],
    },
  ],
  timeLimitMs: null,
});

const withOverlaps = (overlaps: CombatConfig['overlaps']): CombatConfig => {
  const c = cfg();
  c.overlaps = overlaps;
  return c;
};

const world = (combat: CombatConfig): World => createWorld(court(), combat, 7);

const telegraphsOf = (events: World['events'], archetype: string) =>
  events.filter((e) => e.type === 'enemy_telegraph' && e.data?.archetype === archetype);

describe('an authored overlap holds a body until the phrase says so', () => {
  it('releases the follower and says so as a fact', () => {
    const combat = withOverlaps([
      { id: 'arrow_into_guard', lead: 'guard', follow: 'archer', atLeadTelegraph: 0.5, maxHoldMs: 5000 },
    ]);
    const events = run(world(combat), ticksFor(6000), intent(), {
      combat,
      encounter: court(),
    });
    const released = events.filter((e) => e.type === 'overlap_released');
    expect(released.length).toBeGreaterThan(0);
    expect(released[0].data?.overlapId).toBe('arrow_into_guard');
    expect(released.some((e) => e.data?.timedOut === false)).toBe(true);
  });

  it('does not fire at all when no phrase is declared — the default lab is untouched', () => {
    const combat = cfg();
    expect(combat.overlaps).toBeUndefined();
    const events = run(world(combat), ticksFor(6000), intent(), { combat, encounter: court() });
    expect(countOf(events, 'overlap_released')).toBe(0);
  });
});

describe('the guarantees, which matter more than the mechanism', () => {
  it('costs nothing when its declaration matches nobody in the room', () => {
    const plain = cfg();
    const declared = withOverlaps([
      { id: 'absent', lead: 'queen', follow: 'thorn_marshal', atLeadTelegraph: 0.5, maxHoldMs: 800 },
    ]);
    const a = world(plain);
    const b = world(declared);
    run(a, ticksFor(3000), intent(), { combat: plain, encounter: court() });
    run(b, ticksFor(3000), intent(), { combat: declared, encounter: court() });
    expect(fingerprintWorld(b)).toBe(fingerprintWorld(a));
  });

  it('never makes a body strike sooner than it would have alone', () => {
    const eager = withOverlaps([
      { id: 'eager', lead: 'guard', follow: 'archer', atLeadTelegraph: 0, maxHoldMs: 5000 },
    ]);
    const plain = cfg();
    const first = (combat: CombatConfig) => {
      const events = run(world(combat), ticksFor(6000), intent(), { combat, encounter: court() });
      return telegraphsOf(events, 'archer')[0];
    };
    const unheld = first(plain);
    const held = first(eager);
    expect(unheld).toBeDefined();
    expect(held).toBeDefined();
    expect(held!.tick).toBeGreaterThanOrEqual(unheld!.tick);
  });

  it('releases a follower whose lead never comes, rather than stalling the room', () => {
    const orphan = withOverlaps([
      { id: 'orphan', lead: 'first_blade', follow: 'archer', atLeadTelegraph: 0.5, maxHoldMs: 800 },
    ]);
    const events = run(world(orphan), ticksFor(6000), intent(), {
      combat: orphan,
      encounter: court(),
    });
    const released = events.filter((e) => e.type === 'overlap_released');
    expect(released.length).toBeGreaterThan(0);
    expect(released.every((e) => e.data?.timedOut === true)).toBe(true);
    expect(telegraphsOf(events, 'archer').length).toBeGreaterThan(0);
  });

  it('cannot spend the readability cap it was given', () => {
    const combat = withOverlaps([
      { id: 'both', lead: 'guard', follow: 'archer', atLeadTelegraph: 0, maxHoldMs: 5000 },
    ]);
    combat.maxSimultaneousAttackers = 1;
    const w = world(combat);
    let worst = 0;
    for (let i = 0; i < ticksFor(6000); i++) {
      run(w, 1, intent(), { combat, encounter: court() });
      const committed = w.enemies.filter(
        (e) => e.state.kind === 'telegraph' || e.state.kind === 'attack',
      ).length;
      if (committed > worst) worst = committed;
    }
    expect(worst).toBeLessThanOrEqual(1);
  });
});

describe('the Phase 7 presets', () => {
  it('differ from the default on the overlap axis and nowhere else', () => {
    for (const id of ['Overlap_Concurrent', 'Overlap_Sequential']) {
      const preset = COMBAT_PRESETS[id];
      const { id: _i, description: _d, overlaps: _o, ...rest } = preset;
      const { id: _di, description: _dd, overlaps: _do, ...defaultRest } = DEFAULT_COMBAT;
      expect(rest).toEqual(defaultRest);
      expect(preset.overlaps?.length).toBeGreaterThan(0);
    }
  });

  it('brackets the axis — the siblings sit at opposite ends of the wind-up', () => {
    const concurrent = COMBAT_PRESETS.Overlap_Concurrent.overlaps ?? [];
    const sequential = COMBAT_PRESETS.Overlap_Sequential.overlaps ?? [];
    expect(concurrent.every((o) => o.atLeadTelegraph === 0)).toBe(true);
    expect(sequential.every((o) => o.atLeadTelegraph > 0.5)).toBe(true);
    expect(concurrent.map((o) => o.id)).toEqual(sequential.map((o) => o.id));
  });

  it('anchors on the body with no telegraph jitter', () => {
    for (const o of COMBAT_PRESETS.Overlap_Sequential.overlaps ?? []) {
      expect(DEFAULT_COMBAT.enemies[o.lead].attacks.every((a) => a.telegraphJitterMs === 0)).toBe(
        true,
      );
    }
  });
});
