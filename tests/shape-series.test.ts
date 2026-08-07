
import { LAB_ROOMS } from '../src/render/rooms/index-lab';
import { DEFAULT_COMBAT } from '../src/lab/config';
import { ENCOUNTERS } from '../src/lab/encounters';
import { arenaContains, arenaGeometryIsValid } from '../src/sim/arena';
import { arenaProps } from '../src/render/arena-decor';
import type { EnemyArchetype } from '../src/sim/types';

const SERIES = [
  'shape_gallery',
  'shape_twin_bowls',
  'shape_combat_bowl',
  'shape_cramped_keep',
] as const;

const PLAYER_RADIUS = DEFAULT_COMBAT.player.radius;
const HEAVY_REACH = DEFAULT_COMBAT.player.attacks.heavy.range;

describe('the shape series', () => {
  it.each([...SERIES, 'gallery_archer'])('%s has valid geometry', (id) => {
    expect(arenaGeometryIsValid(ENCOUNTERS[id].arena)).toBe(true);
  });

  it.each([...SERIES, 'gallery_archer'])('%s spawns everyone on walkable floor', (id) => {
    const encounter = ENCOUNTERS[id];
    expect(
      arenaContains(encounter.arena, encounter.playerStart, PLAYER_RADIUS),
      `${id} playerStart`,
    ).toBe(true);
    for (const wave of encounter.waves) {
      for (const spawn of wave.spawns) {
        const radius = DEFAULT_COMBAT.enemies[spawn.archetype].radius;
        expect(
          arenaContains(encounter.arena, spawn.at, radius),
          `${id} ${spawn.archetype} at ${JSON.stringify(spawn.at)}`,
        ).toBe(true);
      }
    }
  });

  it('holds the roster fixed across all four rooms', () => {
    const rosters = SERIES.map((id) => {
      const archetypes = ENCOUNTERS[id].waves.flatMap((wave) =>
        wave.spawns.map((spawn) => spawn.archetype as EnemyArchetype),
      );
      return [...archetypes].sort().join('+');
    });
    expect(new Set(rosters).size, `rosters diverged: ${rosters.join(' / ')}`).toBe(1);
    expect(rosters[0]).toBe('duelist+guard');
    for (const id of SERIES) {
      expect(ENCOUNTERS[id].waves, `${id} should be a single wave`).toHaveLength(1);
      expect(ENCOUNTERS[id].timeLimitMs, `${id} should be untimed`).toBeNull();
    }
  });

  it('keeps the combat bowl’s pillar wider than the player can reach across', () => {
    const arena = ENCOUNTERS.shape_combat_bowl.arena;
    expect(arenaContains(arena, { x: 0, y: 0 })).toBe(false);

    expect(3).toBeGreaterThan(HEAVY_REACH);
    expect(arenaContains(arena, { x: 0, y: -2.5 }, PLAYER_RADIUS)).toBe(true);
    expect(arenaContains(arena, { x: 0, y: 2.5 }, PLAYER_RADIUS)).toBe(true);

    for (const point of [
      { x: -6, y: 0 },
      { x: 6, y: 0 },
      { x: 0, y: -4 },
      { x: 0, y: 4 },
    ]) {
      expect(arenaContains(arena, point, PLAYER_RADIUS), JSON.stringify(point)).toBe(true);
    }
  });

  it('stands a column in the bowl and in no room that has a walkable centre', () => {
    const bowl = arenaProps(LAB_ROOMS, 'training_court', ENCOUNTERS.shape_combat_bowl.arena);
    const core = bowl.filter((prop) => prop.at.x === 0 && prop.at.y === 0);
    expect(core).toHaveLength(1);
    expect(core[0].kind).toBe('column');

    expect(core[0].scale).toBeGreaterThan(3);
    expect(core[0].scale).toBeLessThan(4);

    for (const id of ['kernel_guard', 'shape_cramped_keep', 'shape_gallery'] as const) {
      for (const prop of arenaProps(LAB_ROOMS, 'training_court', ENCOUNTERS[id].arena)) {
        expect(
          arenaContains(ENCOUNTERS[id].arena, prop.at),
          `${id}/${prop.kind} entered the playable floor`,
        ).toBe(false);
      }
    }
  });

  it('lets a body cross the twin bowls’ neck at every point along it', () => {
    const arena = ENCOUNTERS.shape_twin_bowls.arena;
    for (let x = -4; x <= 4; x += 0.5) {
      expect(arenaContains(arena, { x, y: 0 }, PLAYER_RADIUS), `x=${x}`).toBe(true);
    }
    expect(arenaContains(arena, { x: 0, y: 5 })).toBe(false);
    expect(arenaContains(arena, { x: 0, y: -5 })).toBe(false);
  });

  it('makes the gallery too narrow to step out of the archer’s line', () => {
    const archerRange = DEFAULT_COMBAT.enemies.archer.attacks[0].range;
    const gallery = ENCOUNTERS.gallery_archer;
    const width = gallery.arena.halfExtents.y * 2;

    expect(width).toBeLessThan(archerRange);

    for (const id of ['kernel_guard', 'spacing_archer', 'overlap_court'] as const) {
      expect(
        ENCOUNTERS[id].arena.halfExtents.y * 2,
        `${id} should be wider than the gallery`,
      ).toBeGreaterThan(width);
    }

    const archer = gallery.waves[0].spawns.find((spawn) => spawn.archetype === 'archer');
    expect(Math.abs(archer!.at.x - gallery.playerStart.x)).toBeGreaterThan(archerRange);
  });
});
