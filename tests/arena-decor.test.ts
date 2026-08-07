
import { LAB_ROOMS } from '../src/render/rooms/index-lab';
import { PUBLIC_ROOMS } from '../src/render/rooms/index-public';
import { ENCOUNTERS } from '../src/lab/encounters';
import { DEFAULT_COMBAT } from '../src/lab/config';
import { PALETTE } from '../src/render/palette';
import {
  arenaProps,
  arenaPropsFor,
  arenaThemeFor,
  arenaViewMargin,
} from '../src/render/arena-decor';
import { createWorld } from '../src/sim/encounter';
import { stepWorld } from '../src/sim/world';
import { arenaContains } from '../src/sim/arena';
import { COURT_PILLARS, courtPillarObstacles } from '../src/game/court';
import { intent, noSlowMo } from './support/world';

describe('the first blade room, as a room like any other', () => {
  const arena = ENCOUNTERS.first_blade.arena;
  const props = arenaProps(LAB_ROOMS, 'first_blade', arena);

  it('places the same nine props, in the same order, that it placed as a special case', () => {
    expect(props.map((prop) => prop.kind)).toEqual([
      'gate',
      'torn_banner',
      'torn_banner',
      'weapon_rack',
      'weapon_rack',
      'ceremonial_brazier',
      'ceremonial_brazier',
      'ceremonial_brazier',
      'ceremonial_brazier',
    ]);
  });

  it('anchors them where they stood, to the unit', () => {
    const h = arena.halfExtents;
    expect(props.map((prop) => prop.at)).toEqual([
      { x: 0, y: -h.y - 0.72 },
      { x: -3.7, y: -h.y - 0.58 },
      { x: 3.1, y: -h.y - 0.58 },
      { x: -h.x - 0.58, y: -1.8 },
      { x: h.x + 0.58, y: 1.3 },
      { x: -h.x - 0.62, y: -h.y - 0.62 },
      { x: h.x + 0.62, y: -h.y - 0.62 },
      { x: -h.x - 0.62, y: h.y + 0.62 },
      { x: h.x + 0.62, y: h.y + 0.62 },
    ]);
  });

  it('anchors every volumetric prop beyond at least one arena boundary', () => {
    const h = arena.halfExtents;
    for (const prop of props) {
      const outsideX = Math.abs(prop.at.x) > h.x + 0.5;
      const outsideY = Math.abs(prop.at.y) > h.y + 0.5;
      expect(outsideX || outsideY, `${prop.kind} entered the playable floor`).toBe(true);
    }
  });

  it('reaches the same nine through the ordinary registry path', () => {
    const world = createWorld(ENCOUNTERS.first_blade, DEFAULT_COMBAT, 1);
    expect(arenaPropsFor(LAB_ROOMS, world)).toHaveLength(9);
  });

  it('turns to the danger colour when he assumes phase two', () => {
    const combat = structuredClone(DEFAULT_COMBAT);
    const def = ENCOUNTERS.first_blade;
    const world = createWorld(def, combat, 77);
    stepWorld(world, [intent()], combat, noSlowMo(), def);
    const blade = world.enemies[0];
    if (blade?.archetype !== 'first_blade') throw new Error('first_blade did not spawn its boss');

    const room = LAB_ROOMS.theme('first_blade');
    expect(room.accent(PALETTE, world)).toBe(PALETTE.firstBlade);
    blade.phase = 2;
    expect(room.accent(PALETTE, world)).toBe(PALETTE.danger);
  });

  it('reserves its extra framing space from its own file, in both builds', () => {
    for (const rooms of [LAB_ROOMS, PUBLIC_ROOMS]) {
      expect(arenaViewMargin(rooms, 'first_blade')).toBe(125);
      expect(arenaViewMargin(rooms, 'first_blade')).toBeGreaterThan(
        arenaViewMargin(rooms, 'kernel_guard'),
      );
    }
    expect(arenaViewMargin(LAB_ROOMS, 'kernel_guard')).toBe(108);
  });

  it('is dressed by the public index too, not only the lab one', () => {
    expect(arenaThemeFor(PUBLIC_ROOMS, 'first_blade')).toBe('first_blade');
    expect(arenaThemeFor(LAB_ROOMS, 'first_blade')).toBe('first_blade');
  });
});

describe('generic arena layouts', () => {
  it('keeps court pillar visuals and collision on one authored footprint', () => {
    expect(courtPillarObstacles()).toEqual(
      COURT_PILLARS.map((pillar) => ({ at: { ...pillar.at }, radius: pillar.radius })),
    );
  });

  it('decorates the authored bosses and leaves the control instrument neutral', () => {
    expect(arenaThemeFor(LAB_ROOMS, 'kernel_guard')).toBe('training_court');
    expect(arenaThemeFor(LAB_ROOMS, 'kernel_duelist')).toBe('duel_gallery');
    expect(arenaThemeFor(LAB_ROOMS, 'court_45s')).toBe('crossfire_court');
    expect(arenaThemeFor(LAB_ROOMS, 'overlap_court')).toBe('corner_keep');
    expect(arenaThemeFor(LAB_ROOMS, 'siege_10')).toBe('assembly_hall');
    expect(arenaThemeFor(LAB_ROOMS, 'captain')).toBe('guard_hall');
    expect(arenaThemeFor(LAB_ROOMS, 'chancellor')).toBe('chancellery');
    expect(arenaThemeFor(LAB_ROOMS, 'projectile_rain_boss')).toBeNull();
  });

  it('keeps material identities and the expanded prop vocabulary room-authored', () => {
    expect(LAB_ROOMS.theme('training_court').floorDress?.kind).toBe('medallion');
    expect(LAB_ROOMS.theme('duel_gallery').floorDress?.kind).toBe('diamond');
    expect(LAB_ROOMS.theme('crossfire_court').floorDress?.kind).toBe('lanes');
    expect(LAB_ROOMS.theme('corner_keep').floorDress?.kind).toBe('patches');
    expect(LAB_ROOMS.theme('assembly_hall').floorDress?.kind).toBe('runner');

    expect(LAB_ROOMS.theme('training_court').surface?.pattern).toBe('ashlar');
    expect(LAB_ROOMS.theme('duel_gallery').surface?.pattern).toBe('diamond');
    expect(LAB_ROOMS.theme('crossfire_court').surface?.pattern).toBe('range');
    expect(LAB_ROOMS.theme('corner_keep').surface?.pattern).toBe('patchwork');
    expect(LAB_ROOMS.theme('assembly_hall').surface?.pattern).toBe('ceremonial');

    const kinds = new Set(
      [
        'training_court',
        'duel_gallery',
        'crossfire_court',
        'corner_keep',
        'assembly_hall',
      ].flatMap((theme) =>
        LAB_ROOMS.theme(theme as Parameters<typeof LAB_ROOMS.theme>[0]).props.map((placement) =>
          'kind' in placement ? placement.kind : placement[0],
        ),
      ),
    );
    expect(kinds).toEqual(
      new Set(['column', 'target', 'arch', 'banner', 'brazier', 'rubble']),
    );
  });

  it('offers every room the whole vocabulary, including what was one room\'s private set', () => {
    const declared = new Set(
      (['first_blade', 'training_court', 'duel_gallery', 'crossfire_court', 'corner_keep',
        'assembly_hall', 'guard_hall', 'chancellery'] as const).flatMap((theme) =>
        LAB_ROOMS.theme(theme).props.map((placement) =>
          'kind' in placement ? placement.kind : placement[0],
        ),
      ),
    );
    for (const kind of ['gate', 'weapon_rack', 'torn_banner', 'ceremonial_brazier'] as const) {
      expect(declared.has(kind), `${kind} left the vocabulary`).toBe(true);
    }
  });

  it.each([
    'training_court',
    'duel_gallery',
    'crossfire_court',
    'corner_keep',
    'assembly_hall',
    'guard_hall',
    'chancellery',
  ] as const)('keeps every %s volumetric prop outside the playable floor', (theme) => {
    for (const arena of [
      ENCOUNTERS.kernel_guard.arena,
      ENCOUNTERS.kernel_duelist.arena,
      ENCOUNTERS.court_45s.arena,
      ENCOUNTERS.overlap_court.arena,
      ENCOUNTERS.captain.arena,
      ENCOUNTERS.chancellor.arena,
    ]) {
      for (const prop of arenaProps(LAB_ROOMS, theme, arena)) {
        expect(
          arenaContains(arena, prop.at),
          `${theme}/${prop.kind} entered the playable floor`,
        ).toBe(false);
      }
    }
  });

  it('aligns arches to the actual boundary tangent in rotated arenas', () => {
    const arena = ENCOUNTERS.kernel_duelist.arena;
    const arch = arenaProps(LAB_ROOMS, 'duel_gallery', arena).find((prop) => prop.kind === 'arch');
    expect(arch?.axis).toBeDefined();
    expect(Math.abs(arch?.axis?.x ?? 0)).toBeGreaterThan(0.1);
    expect(Math.abs(arch?.axis?.y ?? 0)).toBeGreaterThan(0.1);
  });

  it('gives decorated arenas framing space while leaving neutral instruments unchanged', () => {
    expect(arenaViewMargin(LAB_ROOMS, 'kernel_guard')).toBe(108);
    expect(arenaViewMargin(LAB_ROOMS, 'captain')).toBe(108);
    expect(arenaViewMargin(LAB_ROOMS, 'chancellor')).toBe(108);
    expect(arenaViewMargin(LAB_ROOMS, 'projectile_rain_boss')).toBe(90);
  });
});
