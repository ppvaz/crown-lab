
import { describe, expect, it } from 'vitest';
import type { EncounterDef, World } from '../src/sim/types';
import { createWorld } from '../src/sim/encounter';
import { lineOfSight, segmentHitsObstacle } from '../src/sim/arena';
import { spawnProjectile } from '../src/sim/projectile';
import { cfg, countOf, intent, run, ticksFor } from './support/world';

const archerRoom = (obstacles?: EncounterDef['arena']['obstacles']): EncounterDef => ({
  id: 'test_archer_los',
  description: 'Archer at 10 units; the pillar, when present, sits on the firing line.',
  arena: { halfExtents: { x: 20, y: 20 }, obstacles },
  playerStart: { x: 0, y: 0 },
  waves: [{ id: 'w1', atMs: 0, spawns: [{ archetype: 'archer', at: { x: 10, y: 0 } }] }],
  timeLimitMs: null,
});

const world = (encounter: EncounterDef): World => createWorld(encounter, cfg(), 1);

describe('lineOfSight geometry', () => {
  it('an obstacle on the segment blocks; the same segment offset past it does not', () => {
    const w = world(archerRoom([{ at: { x: 5, y: 0 }, radius: 1.2 }]));
    expect(lineOfSight(w, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(false);
    expect(lineOfSight(w, { x: 0, y: 5 }, { x: 10, y: 5 })).toBe(true);
  });

  it('a compound floor blocks the straight line across its bend', () => {
    const bent: EncounterDef = {
      id: 'test_bent_los',
      description: 'L-shaped floor; the chord between the arms leaves the floor.',
      arena: {
        halfExtents: { x: 10, y: 10 },
        outline: [
          { x: -10, y: -2 },
          { x: -2, y: -2 },
          { x: -2, y: -10 },
          { x: 2, y: -10 },
          { x: 2, y: 2 },
          { x: -10, y: 2 },
        ],
        regions: [
          [
            { x: -10, y: -2 },
            { x: 2, y: -2 },
            { x: 2, y: 2 },
            { x: -10, y: 2 },
          ],
          [
            { x: -2, y: -10 },
            { x: 2, y: -10 },
            { x: 2, y: 2 },
            { x: -2, y: 2 },
          ],
        ],
      },
      playerStart: { x: 0, y: 0 },
      waves: [{ id: 'never', atMs: Number.POSITIVE_INFINITY, spawns: [] }],
      timeLimitMs: null,
    };
    const w = world(bent);
    expect(lineOfSight(w, { x: -8, y: 0 }, { x: 0, y: -8 })).toBe(false);
    expect(lineOfSight(w, { x: -8, y: 0 }, { x: 0, y: 0 })).toBe(true);
    expect(lineOfSight(w, { x: 0, y: 0 }, { x: 0, y: -8 })).toBe(true);
  });

  it('a closed doorway blocks, and opens with its wave', () => {
    const gated: EncounterDef = {
      id: 'test_gate_los',
      description: 'One doorway across x = 0, locked until w1 clears.',
      arena: {
        halfExtents: { x: 20, y: 20 },
        gates: [{ id: 'door', from: { x: 0, y: -3 }, to: { x: 0, y: 3 }, lockUntilWaveCleared: 'w1' }],
      },
      playerStart: { x: -5, y: 0 },
      waves: [{ id: 'w1', atMs: 0, spawns: [] }],
      timeLimitMs: null,
    };
    const w = world(gated);
    w.encounter.spawnedWaves.push('w1');
    expect(lineOfSight(w, { x: -5, y: 0 }, { x: 5, y: 0 })).toBe(false);
    w.encounter.clearedWaves.push('w1');
    expect(lineOfSight(w, { x: -5, y: 0 }, { x: 5, y: 0 })).toBe(true);
  });

  it('segmentHitsObstacle is swept, not endpoint-sampled', () => {
    const w = world(archerRoom([{ at: { x: 5, y: 0 }, radius: 0.5 }]));
    expect(segmentHitsObstacle(w.arena, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(true);
    expect(segmentHitsObstacle(w.arena, { x: 0, y: 2 }, { x: 10, y: 2 })).toBe(false);
  });
});

describe('the archer against cover', () => {
  it('holds fire while a pillar blocks the line, and fires without one', () => {
    const window = ticksFor(5000);

    const blocked = world(archerRoom([{ at: { x: 5, y: 0 }, radius: 1.2 }]));
    const blockedEvents = run(blocked, window, intent(), {
      encounter: archerRoom([{ at: { x: 5, y: 0 }, radius: 1.2 }]),
    });
    expect(countOf(blockedEvents, 'enemy_telegraph')).toBe(0);
    expect(countOf(blockedEvents, 'projectile_fired')).toBe(0);

    const clear = world(archerRoom());
    const clearEvents = run(clear, window, intent(), { encounter: archerRoom() });
    expect(countOf(clearEvents, 'projectile_fired')).toBeGreaterThan(0);
  });
});

describe('the arrow against cover', () => {
  it('breaks on a solid instead of passing through it', () => {
    const room = archerRoom([{ at: { x: 5, y: 0 }, radius: 1.2 }]);
    const w = world(room);
    spawnProjectile(w, cfg(), { x: 10, y: 0 }, { x: -1, y: 0 }, 11, 12, 999);
    const events = run(w, ticksFor(2000), intent(), { encounter: room });
    expect(w.projectiles).toHaveLength(0);
    expect(countOf(events, 'hit_received')).toBe(0);
    expect(w.players[0].hp).toBe(cfg().player.maxHp);
  });
});
