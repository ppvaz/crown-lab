import { LAB_ROOMS } from '../src/render/rooms/index-lab';
import { describe, expect, it } from 'vitest';
import { ENCOUNTERS } from '../src/lab/encounters';
import { DEFAULT_COMBAT } from '../src/lab/config';
import { LAB_FULL_PALETTE, labArchetypeColor } from '../src/render/palette-lab';
import { arenaViewMargin, arenaThemeFor } from '../src/render/arena-decor';
import { DEFAULT_MODELS } from '../src/render/cast/index-lab';
const control = ENCOUNTERS.projectile_rain_boss;
const treatment = ENCOUNTERS.chancellor;

describe('the two arms are the same fight', () => {
  it('puts the player in the same room, at the same place', () => {
    expect(treatment.arena).toEqual(control.arena);
    expect(treatment.playerStart).toEqual(control.playerStart);
    expect(treatment.timeLimitMs).toBe(control.timeLimitMs);
  });

  it('spawns one boss, at the same position and the same moment', () => {
    expect(treatment.waves).toHaveLength(control.waves.length);
    expect(treatment.waves[0].atMs).toBe(control.waves[0].atMs);
    expect(treatment.waves[0].spawns).toHaveLength(1);
    expect(treatment.waves[0].spawns[0].at).toEqual(control.waves[0].spawns[0].at);
  });

  it('differs in the spawned archetype and in nothing else about the wave', () => {
    expect(control.waves[0].spawns[0].archetype).toBe('rain_boss');
    expect(treatment.waves[0].spawns[0].archetype).toBe('chancellor');
  });

  it('differs from the control on exactly the licensed fields and no others', () => {
    const strip = (def: typeof control) => {
      const { waves, notes: _notes, description: _description, id: _id, ...rest } =
        def as typeof control & { notes?: unknown };
      return {
        ...rest,
        waves: waves.map((wave) => ({
          ...wave,
          spawns: wave.spawns.map(({ archetype: _archetype, ...spawn }) => spawn),
        })),
      };
    };

    expect(strip(treatment)).toEqual(strip(control));
  });

  it('carries the books on the Chancellor and leaves the control bare', () => {
    expect((control as { hazard?: unknown }).hazard).toBeUndefined();
    expect((treatment as { hazard?: unknown }).hazard).toBeUndefined();

    const books = DEFAULT_COMBAT.enemies.chancellor.hazard;
    expect(books?.kind).toBe('books');
    expect(books?.count).toBeGreaterThan(0);
    expect(books?.phaseTwoCount ?? 0).toBeGreaterThan(books?.count ?? 0);
    expect(books?.damage).toBeGreaterThan(0);


    expect(DEFAULT_COMBAT.enemies.rain_boss.hazard).toBeUndefined();
  });

  it('gives both bosses identical statistics, attacks and phase behaviour', () => {
    const { archetype: _a, boss: bossA, hazard: _ha, ...neutral } = DEFAULT_COMBAT.enemies.rain_boss;
    const {
      archetype: _b,
      boss: bossB,
      hazard: _hb,
      ...authored
    } = DEFAULT_COMBAT.enemies.chancellor;
    expect(authored).toEqual(neutral);

    expect(bossA).toBeDefined();
    expect({ ...bossA, name: '' }).toEqual({ ...bossB, name: '' });
  });

  it("keeps the control's attack ids on the characterized arm", () => {
    expect(DEFAULT_COMBAT.enemies.chancellor.attacks.map((a) => a.id)).toEqual(
      DEFAULT_COMBAT.enemies.rain_boss.attacks.map((a) => a.id),
    );
    expect(DEFAULT_COMBAT.enemies.chancellor.attacks.some((a) => a.id === 'rain_focus')).toBe(true);
  });
});

describe('the two arms differ on exactly the characterization surfaces', () => {
  it('gives the Chancellor a room and leaves the control bare', () => {
    expect(arenaThemeFor(LAB_ROOMS, 'chancellor')).toBe('chancellery');
    expect(arenaThemeFor(LAB_ROOMS, 'projectile_rain_boss')).toBeNull();
  });

  it('gives the decorated room framing space and leaves the control unchanged', () => {
    expect(arenaViewMargin(LAB_ROOMS, 'chancellor')).toBe(108);
    expect(arenaViewMargin(LAB_ROOMS, 'projectile_rain_boss')).toBe(90);
  });

  it('gives both concept-backed subjects their approved silhouettes', () => {
    expect(DEFAULT_MODELS.models.chancellor.id).toBe('chancellor');
    expect(DEFAULT_MODELS.models.rain_boss.id).toBe('rain_boss_blade_orbit');
  });

  it('gives the Chancellor a colour and leaves the control colourless', () => {
    expect(labArchetypeColor('chancellor')).toBe(LAB_FULL_PALETTE.chancellor);
    expect(labArchetypeColor('rain_boss')).toBe(LAB_FULL_PALETTE.rainBoss);
    expect(labArchetypeColor('chancellor')).not.toBe(labArchetypeColor('rain_boss'));
  });

  it('names the Chancellor and leaves the control a study', () => {
    expect(DEFAULT_COMBAT.enemies.chancellor.boss?.name).toBe('THE CHANCELLOR');
    expect(DEFAULT_COMBAT.enemies.rain_boss.boss?.name).toBe('PERIPHERAL STUDY');
  });
});

describe('the silhouette carries the character it claims to', () => {
  const shapes = DEFAULT_MODELS.models.chancellor.shapes;

  it('carries no weapon and no lightning', () => {
    expect(shapes.some((s) => s.part === 'weapon')).toBe(false);
    expect(shapes.some((s) => s.fill === 'lightning' || s.stroke === 'lightning')).toBe(false);
  });

  it('wears no visor', () => {
    const headMarks = shapes.filter((s) => s.part === 'head' && s.stroke === 'floor');
    expect(headMarks).toHaveLength(0);
  });

  it('wears no crown and no royal gold', () => {
    expect(shapes.some((s) => s.fill === 'playerAccent' || s.stroke === 'playerAccent')).toBe(false);
  });

  it('separates ivory skin and hands from the purple robe', () => {
    expect(shapes.filter((s) => s.part === 'head' && s.fill === 'player').length).toBeGreaterThanOrEqual(2);
    expect(shapes.filter((s) => s.part === 'gesture' && s.fill === 'player')).toHaveLength(2);
    expect(shapes.filter((s) => s.part === 'gesture' && s.kind === 'poly').length).toBeGreaterThanOrEqual(5);
  });
});
