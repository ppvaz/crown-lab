
import {
  CAPTURE_SHOTS,
  captureShotFromSearch,
  prepareCaptureWorld,
  type CaptureShotId,
  debugFlagsFromSearch,
} from '../src/app/capture';
import { DEFAULT_COMBAT, SLOWMO_PRESETS } from '../src/lab/config';
import { ENCOUNTERS } from '../src/lab/encounters';
import { attachment } from '../src/render/actor-stack';
import { viewOf } from '../src/render/models';
import { createWorld } from '../src/sim/encounter';
import { hashWorld } from '../src/sim/world';

describe('capture catalog', () => {
  it('resolves only named capture URLs', () => {
    expect(captureShotFromSearch('?capture=first-blade-room')?.id).toBe('first-blade-room');
    expect(captureShotFromSearch('?capture=unknown')).toBeNull();
    expect(captureShotFromSearch('')).toBeNull();
  });

  it('carries real route context for locked, open, and antechamber threshold captures', () => {
    expect(CAPTURE_SHOTS['route-guard-locked'].route).toEqual({
      nodeId: 'guardroom',
      cleared: false,
    });
    expect(CAPTURE_SHOTS['route-guard-open'].route).toEqual({
      nodeId: 'guardroom',
      cleared: true,
    });
    expect(CAPTURE_SHOTS['route-antechamber']).toMatchObject({
      encounterId: 'upper_hall',
      route: { nodeId: 'antechamber', cleared: false },
    });
  });

  it.each(Object.keys(CAPTURE_SHOTS) as CaptureShotId[])(
    'prepares %s to the same world hash every time',
    (shot) => {
      const hashes = [1, 2].map(() => {
        const combat = structuredClone(DEFAULT_COMBAT);
        const encounter = ENCOUNTERS[CAPTURE_SHOTS[shot].encounterId];
        const world = createWorld(encounter, combat, 1);
        prepareCaptureWorld(world, combat, SLOWMO_PRESETS.none, encounter, shot);
        return hashWorld(world);
      });
      expect(hashes[0]).toBe(hashes[1]);
    },
  );

  it('uses real boss FSM milestones for the three authored frames', () => {
    const encounter = ENCOUNTERS.first_blade;
    const states = (
      ['first-blade-entrance', 'first-blade-room', 'first-blade-phase-two'] as const
    ).map((shot) => {
      const combat = structuredClone(DEFAULT_COMBAT);
      const world = createWorld(encounter, combat, 1);
      prepareCaptureWorld(world, combat, SLOWMO_PRESETS.none, encounter, shot);
      const firstBlade = world.enemies.find((enemy) => enemy.archetype === 'first_blade');
      return { tick: world.tick, state: firstBlade?.state.kind, phase: firstBlade?.phase };
    });

    expect(states[0]).toMatchObject({ tick: 1, state: 'entrance_fall', phase: 1 });
    expect(states[1].state).toBe('approach');
    expect(states[1].phase).toBe(1);
    expect(states[2].phase).toBe(2);
    expect(states[2].tick).toBeGreaterThan(states[1].tick);
  });

  it('freezes the perfect-parry fixture on the real contact fact', () => {
    const combat = structuredClone(DEFAULT_COMBAT);
    const encounter = ENCOUNTERS.kernel_guard;
    const world = createWorld(encounter, combat, 1);

    prepareCaptureWorld(world, combat, SLOWMO_PRESETS.none, encounter, 'perfect-parry');

    expect(world.events.some((event) => event.type === 'parry_success')).toBe(true);
    expect(world.players[0].riposteWindowMs).toBeGreaterThan(0);
    expect(world.enemies[0]?.state.kind).toBe('recovery');
  });

  it('freezes the First Blade during a real wall-to-wall phase-two flight', () => {
    const combat = structuredClone(DEFAULT_COMBAT);
    const encounter = ENCOUNTERS.first_blade;
    const world = createWorld(encounter, combat, 1);
    prepareCaptureWorld(world, combat, SLOWMO_PRESETS.none, encounter, 'first-blade-glide');
    const subject = world.enemies.find((enemy) => enemy.archetype === 'first_blade');

    expect(subject?.phase).toBe(2);
    expect(subject?.state.kind).toBe('attack');
    expect(subject?.glideTarget).toBeDefined();
    expect(combat.enemies.first_blade.attacks[subject!.state.attackIndex].traversesArena).toBe(true);
  });

  it('freezes the response instrument at all four reads', () => {
    const states = (
      ['captain-direct', 'captain-feint', 'captain-pressure', 'captain-release'] as const
    ).map(
      (shot) => {
        const combat = structuredClone(DEFAULT_COMBAT);
        const encounter = ENCOUNTERS.captain;
        const world = createWorld(encounter, combat, 1);
        prepareCaptureWorld(world, combat, SLOWMO_PRESETS.none, encounter, shot);
        const subject = world.enemies.find((enemy) => enemy.archetype === 'captain');
        return { kind: subject?.state.kind, attackIndex: subject?.state.attackIndex };
      },
    );

    expect(states).toEqual([
      { kind: 'telegraph', attackIndex: 0 },
      { kind: 'telegraph', attackIndex: 1 },
      { kind: 'telegraph', attackIndex: 2 },
      { kind: 'telegraph', attackIndex: 3 },
    ]);
  });

  it('freezes the rain before and during its overlapping focal read', () => {
    const states = (['rain-field', 'rain-overlap'] as const).map((shot) => {
      const combat = structuredClone(DEFAULT_COMBAT);
      const encounter = ENCOUNTERS.projectile_rain_boss;
      const world = createWorld(encounter, combat, 1);
      prepareCaptureWorld(world, combat, SLOWMO_PRESETS.none, encounter, shot);
      const subject = world.enemies.find((enemy) => enemy.archetype === 'rain_boss');
      return {
        projectiles: world.projectiles.filter((projectile) => projectile.kind === 'falling').length,
        kind: subject?.state.kind,
        attackIndex: subject?.state.attackIndex,
      };
    });

    expect(states[0].projectiles).toBe(5);
    expect(states[1]).toEqual({ projectiles: 5, kind: 'telegraph', attackIndex: 1 });
  });

  it('freezes the shield cue during the live parry state, one shot per view it resolves in', () => {
    const shots = [
      'guard-shield',
      'guard-shield-back',
      'guard-shield-profile',
      'guard-shield-profile-rear',
    ] as const;
    const facings = shots.map((shot) => {
      const combat = structuredClone(DEFAULT_COMBAT);
      const encounter = ENCOUNTERS.kernel_guard;
      const world = createWorld(encounter, combat, 1);
      prepareCaptureWorld(world, combat, SLOWMO_PRESETS.none, encounter, shot);
      expect(world.players[0].state.kind).toBe('parry');
      return world.players[0].facing;
    });

    expect(facings[0]).toBe(0);
    expect(facings[1]).toBeCloseTo(Math.PI, 4);
    expect(facings[2]).toBeCloseTo((5 * Math.PI) / 8, 4);
    expect(facings[3]).toBeCloseTo((7 * Math.PI) / 8, 4);

    expect(viewOf(facings[2])).toBe('profile');
    expect(viewOf(facings[3])).toBe('profile');
    const slotOf = (facing: number): string =>
      attachment({ facing, forward: 0.69, draw: () => undefined }).slot;
    expect(slotOf(facings[2])).toBe('frontAttachments');
    expect(slotOf(facings[3])).toBe('rearAttachments');
  });

  it('freezes weapon contact on the exact tick a real heavy lands', () => {
    const combat = structuredClone(DEFAULT_COMBAT);
    const encounter = ENCOUNTERS.kernel_guard;
    const world = createWorld(encounter, combat, 1);
    prepareCaptureWorld(world, combat, SLOWMO_PRESETS.none, encounter, 'weapon-contact');
    const hit = world.events.find((event) => event.type === 'hit_landed');

    expect(hit?.tick).toBe(world.tick);
    expect(hit?.actor).toBe(world.players[0].id);
    expect(world.players[0].state.kind).toBe('active');
    expect(world.players[0].state.struck).toContain(hit?.target);
  });

  it('freezes an enemy weapon on the exact tick it reaches the king', () => {
    const combat = structuredClone(DEFAULT_COMBAT);
    const encounter = ENCOUNTERS.kernel_guard;
    const world = createWorld(encounter, combat, 1);
    prepareCaptureWorld(world, combat, SLOWMO_PRESETS.none, encounter, 'enemy-weapon-contact');
    const hit = world.events.find((event) => event.type === 'hit_received');
    const attacker = world.enemies.find((enemy) => enemy.id === hit?.actor);

    expect(hit?.tick).toBe(world.tick);
    expect(hit?.target).toBe(world.players[0].id);
    expect(attacker?.state.struck).toContain(world.players[0].id);
  });

  it('routes each generic arena frame to a different authored layout', () => {
    expect(
      (
        [
          'arena-training',
          'arena-duel',
          'arena-crossfire',
          'arena-corner',
          'arena-stairs',
          'arena-rotated-rectangle',
        ] as const
      ).map(
        (shot) => CAPTURE_SHOTS[shot].encounterId,
      ),
    ).toEqual([
      'kernel_guard',
      'kernel_duelist',
      'court_45s',
      'overlap_court',
      'siege_10',
      'rotated_rectangle',
    ]);
  });

  it('keeps a route-owned Herald fixture in the opening court', () => {
    expect(CAPTURE_SHOTS['herald-room'].encounterId).toBe('wayfarer_court');
  });

  it('keeps the background inspection isolated in its named encounter', () => {
    expect(CAPTURE_SHOTS['background-encounter'].encounterId).toBe(
      'background_encounter',
    );
  });

});

describe('hitbox overlay asked for in the query string', () => {
  it('is off unless the URL says otherwise', () => {
    expect(debugFlagsFromSearch('').showHitboxes).toBe(false);
    expect(debugFlagsFromSearch('?run=runs/x.json').showHitboxes).toBe(false);
  });

  it('is on for the spellings someone actually types', () => {
    expect(debugFlagsFromSearch('?hitboxes=1').showHitboxes).toBe(true);
    expect(debugFlagsFromSearch('?hitboxes').showHitboxes).toBe(true);
    expect(debugFlagsFromSearch('?hitboxes=true').showHitboxes).toBe(true);
    expect(debugFlagsFromSearch('?run=runs/x.json&hitboxes=1').showHitboxes).toBe(true);
  });

  it('is off when the URL explicitly says off, rather than on because the key is present', () => {
    expect(debugFlagsFromSearch('?hitboxes=0').showHitboxes).toBe(false);
    expect(debugFlagsFromSearch('?hitboxes=false').showHitboxes).toBe(false);
    expect(debugFlagsFromSearch('?hitboxes=off').showHitboxes).toBe(false);
  });
});
