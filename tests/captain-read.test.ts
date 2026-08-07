import { LAB_ROOMS } from '../src/render/rooms/index-lab';
import { describe, expect, it } from 'vitest';
import { ENCOUNTERS } from '../src/lab/encounters';
import { DEFAULT_COMBAT, SLOWMO_PRESETS } from '../src/lab/config';
import { NEUTRAL_INTENT } from '../src/sim/types';
import { LAB_FULL_PALETTE, labArchetypeColor } from '../src/render/palette-lab';
import type { Intent, SimEvent, World } from '../src/sim/types';
import { arenaThemeFor } from '../src/render/arena-decor';
import { bossMusicBedForEncounter } from '../src/render/music-route';
import { DEFAULT_MODELS } from '../src/render/cast/index-lab';
import { createWorld } from '../src/sim/encounter';
import { stepWorld } from '../src/sim/world';

const control = ENCOUNTERS.captain;
const treatment = ENCOUNTERS.captain_read;

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
    expect(control.waves[0].spawns[0].archetype).toBe('captain');
    expect(treatment.waves[0].spawns[0].archetype).toBe('captain_read');
  });

  it('differs in telegraph jitter and in no other statistic', () => {
    const strip = (cfg: typeof DEFAULT_COMBAT.enemies.captain) => {
      const { archetype: _a, boss: _b, attacks, ...rest } = cfg;
      return {
        ...rest,
        attacks: attacks.map(({ telegraphJitterMs: _j, ...attack }) => attack),
      };
    };

    expect(strip(DEFAULT_COMBAT.enemies.captain_read)).toEqual(
      strip(DEFAULT_COMBAT.enemies.captain),
    );

    expect(DEFAULT_COMBAT.enemies.captain_read.boss).toEqual(DEFAULT_COMBAT.enemies.captain.boss);
  });

  it('keeps the phrase, the order and the phase-two overflow identical', () => {
    expect(DEFAULT_COMBAT.enemies.captain_read.attackPattern).toEqual(
      DEFAULT_COMBAT.enemies.captain.attackPattern,
    );
    expect(DEFAULT_COMBAT.enemies.captain_read.attackPatternPhaseTwo).toEqual(
      DEFAULT_COMBAT.enemies.captain.attackPatternPhaseTwo,
    );
  });

  it("keeps the control's attack ids on the treatment arm", () => {
    expect(DEFAULT_COMBAT.enemies.captain_read.attacks.map((a) => a.id)).toEqual(
      DEFAULT_COMBAT.enemies.captain.attacks.map((a) => a.id),
    );
  });
});

describe('the two arms differ on the beat and on nothing the player can see', () => {
  it('moves the beat, and moves it on every attack', () => {
    const control = DEFAULT_COMBAT.enemies.captain.attacks;
    const treatment = DEFAULT_COMBAT.enemies.captain_read.attacks;

    expect(control.every((a) => a.telegraphJitterMs === 0)).toBe(true);
    expect(treatment.every((a) => a.telegraphJitterMs > 0)).toBe(true);
  });

  it('borrows the duelist’s own jitter rather than inventing a size', () => {
    const duelist = DEFAULT_COMBAT.enemies.duelist.attacks.map((a) => a.telegraphJitterMs);
    const treatment = DEFAULT_COMBAT.enemies.captain_read.attacks.map((a) => a.telegraphJitterMs);

    for (const jitter of treatment) expect(duelist).toContain(jitter);
  });

  it('gives the treatment arm the same room, silhouette, colour and bed', () => {
    expect(arenaThemeFor(LAB_ROOMS, 'captain_read')).toBe(arenaThemeFor(LAB_ROOMS, 'captain'));
    expect(DEFAULT_MODELS.models.captain_read).toEqual(DEFAULT_MODELS.models.captain);
    expect(labArchetypeColor('captain_read')).toBe(LAB_FULL_PALETTE.captain);
    expect(bossMusicBedForEncounter('captain_read')).toBe(bossMusicBedForEncounter('captain'));
  });
});

describe('the beat moves without moving the stamina arithmetic', () => {
  const blocksToEmptyBar = (encounterId: 'captain' | 'captain_read', seed: number): number => {
    const cfg = structuredClone(DEFAULT_COMBAT);
    const encounter = ENCOUNTERS[encounterId];
    const world: World = createWorld(encounter, cfg, seed);
    const held: Intent = {
      ...NEUTRAL_INTENT,
      facing: -Math.PI / 2,
      guardHeld: true,
      guardPressed: true,
    };
    let blocks = 0;

    for (let i = 0; i < 4000; i++) {
      stepWorld(world, [held], cfg, SLOWMO_PRESETS.none, encounter);
      held.guardPressed = false;
      for (const event of world.events as SimEvent[]) {
        if (event.type === 'guard_success') blocks += 1;
        if (event.type === 'guard_broken') return blocks;
      }
      if (world.players[0].stamina <= 0 && blocks > 0) return blocks;
    }
    throw new Error(`${encounterId} never emptied the bar at seed ${seed}`);
  };

  for (const seed of [11, 31, 97, 404]) {
    it(`spends the bar in the same number of blocks at seed ${seed}`, () => {
      expect(blocksToEmptyBar('captain_read', seed)).toBe(blocksToEmptyBar('captain', seed));
    });
  }
});
