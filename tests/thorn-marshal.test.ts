import { LAB_ROOMS } from '../src/render/rooms/index-lab';
import { PUBLIC_ROOMS } from '../src/render/rooms/index-public';
import { describe, expect, it } from 'vitest';
import { ENCOUNTERS } from '../src/lab/encounters';
import { DEFAULT_COMBAT } from '../src/lab/config';
import { LAB_FULL_PALETTE, labArchetypeColor } from '../src/render/palette-lab';
import { PALETTE } from '../src/render/palette';
import { arenaViewMargin, arenaThemeFor } from '../src/render/arena-decor';
import { DEFAULT_MODELS } from '../src/render/cast/index-lab';
import { PUBLIC_MODELS } from '../src/render/cast/index-public';
const control = ENCOUNTERS.reach_study;
const treatment = ENCOUNTERS.thorn_marshal;

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
    expect(control.waves[0].spawns[0].archetype).toBe('pike_boss');
    expect(treatment.waves[0].spawns[0].archetype).toBe('thorn_marshal');
  });

  it('gives both bosses identical statistics, attacks and phase behaviour', () => {
    const { archetype: _a, boss: bossA, ...neutral } = DEFAULT_COMBAT.enemies.pike_boss;
    const { archetype: _b, boss: bossB, ...authored } = DEFAULT_COMBAT.enemies.thorn_marshal;
    expect(authored).toEqual(neutral);

    expect(bossA).toBeDefined();
    expect({ ...bossA, name: '' }).toEqual({ ...bossB, name: '' });
  });

  it("keeps the control's attack ids on the characterized arm", () => {
    expect(DEFAULT_COMBAT.enemies.thorn_marshal.attacks.map((a) => a.id)).toEqual(
      DEFAULT_COMBAT.enemies.pike_boss.attacks.map((a) => a.id),
    );
    expect(
      DEFAULT_COMBAT.enemies.thorn_marshal.attacks.some((a) => a.id === 'pike_boss_thrust'),
    ).toBe(true);
  });

  it('withdraws the safe distance on both arms, identically', () => {
    expect(DEFAULT_COMBAT.enemies.pike_boss.attackPatternPhaseTwo).toEqual([2, 0, 1, 0]);
    expect(DEFAULT_COMBAT.enemies.thorn_marshal.attackPatternPhaseTwo).toEqual(
      DEFAULT_COMBAT.enemies.pike_boss.attackPatternPhaseTwo,
    );
  });
});

describe('the two arms differ on exactly the characterization surfaces', () => {
  it('gives the Marshal a room and leaves the control bare', () => {
    expect(arenaThemeFor(LAB_ROOMS, 'thorn_marshal')).toBe('guard_hall');
    expect(arenaThemeFor(LAB_ROOMS, 'reach_study')).toBeNull();
  });

  it('gives the decorated room framing space and leaves the control unchanged', () => {
    expect(arenaViewMargin(LAB_ROOMS, 'thorn_marshal')).toBe(108);
    expect(arenaViewMargin(LAB_ROOMS, 'reach_study')).toBe(90);
  });

  it('gives both subjects their own silhouette, one neutral and one authored', () => {
    expect(DEFAULT_MODELS.models.thorn_marshal.id).toBe('thorn_marshal');
    expect(DEFAULT_MODELS.models.pike_boss.id).toBe('pike_boss_reach');
  });

  it('gives the Marshal a colour and leaves the control colourless', () => {
    expect(labArchetypeColor('thorn_marshal')).toBe(PALETTE.thornMarshal);
    expect(labArchetypeColor('thorn_marshal')).toBe(LAB_FULL_PALETTE.thornMarshal);
    expect(labArchetypeColor('pike_boss')).toBe(LAB_FULL_PALETTE.pikeBoss);
    expect(Object.keys(PALETTE)).not.toContain('pikeBoss');
    expect(labArchetypeColor('thorn_marshal')).not.toBe(labArchetypeColor('pike_boss'));
  });

  it('names the Marshal and leaves the control a study', () => {
    expect(DEFAULT_COMBAT.enemies.thorn_marshal.boss?.name).toBe('THORN MARSHAL');
    expect(DEFAULT_COMBAT.enemies.pike_boss.boss?.name).toBe('REACH STUDY');
  });

  it('ships the treatment and keeps the control off the public side', () => {
    expect('pike_boss' in PUBLIC_MODELS.models).toBe(false);
    expect(PUBLIC_MODELS.models.thorn_marshal.id).toBe('thorn_marshal');
    expect(PUBLIC_MODELS.models.thorn_marshal).toBe(DEFAULT_MODELS.models.thorn_marshal);
  });

  it('dresses the public room in the same hall the lab dresses it in', () => {
    expect(arenaThemeFor(PUBLIC_ROOMS, 'thorn_marshal')).toBe('guard_hall');
    expect(arenaThemeFor(PUBLIC_ROOMS, 'reach_study')).toBeNull();
  });
});

describe('the silhouettes carry what they claim, and nothing they were not given', () => {
  const marshal = DEFAULT_MODELS.models.thorn_marshal.shapes;
  const study = DEFAULT_MODELS.models.pike_boss.shapes;

  it('gives the Marshal his thorn fan, behind the body', () => {
    expect(marshal.filter((s) => s.part === 'gesture').length).toBeGreaterThanOrEqual(5);
    expect(study.some((s) => s.part === 'gesture')).toBe(false);
  });

  it('wears no crown and no royal gold', () => {
    for (const shapes of [marshal, study]) {
      expect(shapes.some((s) => s.fill === 'playerAccent' || s.stroke === 'playerAccent')).toBe(
        false,
      );
    }
  });

  it('gives the Marshal a visor and leaves the control faceless', () => {
    const visorOf = (shapes: typeof marshal) =>
      shapes.filter((s) => s.part === 'head' && s.stroke === 'floor');
    expect(visorOf(marshal).length).toBeGreaterThan(0);
    expect(visorOf(study)).toHaveLength(0);
  });

  it('arms both with a pole that leaves the silhouette', () => {
    for (const shapes of [marshal, study]) {
      const reach = shapes
        .filter((s) => s.part === 'weapon' && s.points !== undefined)
        .flatMap((s) => s.points ?? [])
        .reduce((max, [x]) => Math.max(max, x), 0);
      expect(reach).toBeGreaterThan(1.5);
    }
  });
});
