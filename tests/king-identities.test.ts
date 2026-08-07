
import { KING_IDENTITIES, identityAt, identityById, identityModels, identityPalette } from '../src/render/king-identities';
import type { KingIdentity } from '../src/render/king-identities';
import { seatIdentities } from '../src/app/coop-world';
import { MODEL_BANKS } from '../src/render/cast/banks-lab';
import { DEFAULT_MODELS } from '../src/render/cast/index-lab';
import { POLISHED_KING } from '../src/render/cast/king';
import { PALETTE } from '../src/render/palette';
import { LAB_FULL_PALETTE } from '../src/render/palette-lab';
import { resolve, PRESENTATION_PRESETS } from '../src/lab/presentation';

const channel = (v: number): number => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

const luminance = (hex: string): number => {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
};

const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const toLab = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [channel((n >> 16) & 255), channel((n >> 8) & 255), channel(n & 255)];
  const f = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.9505);
  const y = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.089);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
};

const distance = (a: string, b: string): number => {
  const [p, q] = [toLab(a), toLab(b)];
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
};

const SWARM: string[] = [
  PALETTE.guard,
  PALETTE.duelist,
  PALETTE.archer,
  LAB_FULL_PALETTE.eliteGuard ?? PALETTE.guard,
];

const SEPARATION = 26;

describe('the co-op identities', () => {
  it('leaves the king himself untouched', () => {
    expect(DEFAULT_MODELS.models.player).toBe(POLISHED_KING);
    expect(POLISHED_KING.shapes.some((s) => s.fill === 'identityCloth')).toBe(false);
  });

  it('seats the first player as the default white king', () => {
    expect(KING_IDENTITIES[0].id).toBe('ivory_heir');
    expect(KING_IDENTITIES[0].cloak).toBe(PALETTE.player);
    expect(KING_IDENTITIES[0].accessory).toHaveLength(0);
    expect(identityAt(0).id).toBe('ivory_heir');
  });

  it('costs a solo screen nothing at all', () => {
    const pres = resolve(PRESENTATION_PRESETS.Full ?? Object.values(PRESENTATION_PRESETS)[0]);
    const pal = { ...PALETTE };
    expect(identityPalette(pal, identityById('ivory_heir'), pres.visual, pres.preserveThreatColors)).toBe(pal);
    expect(identityModels(DEFAULT_MODELS, identityById('ivory_heir'))).toBe(DEFAULT_MODELS);
  });

  it('gives every cloak enough value to be there at all', () => {
    for (const identity of KING_IDENTITIES) {
      expect(contrast(identity.cloak, PALETTE.floor), `${identity.id} against the floor`)
        .toBeGreaterThanOrEqual(3.06);
    }
  });

  it('keeps every two kings tellable apart', () => {
    for (let i = 0; i < KING_IDENTITIES.length; i++) {
      for (let j = i + 1; j < KING_IDENTITIES.length; j++) {
        const [a, b] = [KING_IDENTITIES[i], KING_IDENTITIES[j]];
        expect(distance(a.cloak, b.cloak), `${a.id} vs ${b.id}`).toBeGreaterThanOrEqual(SEPARATION);
      }
    }
  });

  it('keeps every king clear of the enemies that arrive in numbers', () => {
    for (const identity of KING_IDENTITIES) {
      for (const enemy of SWARM) {
        expect(distance(identity.cloak, enemy), `${identity.id} vs enemy ${enemy}`)
          .toBeGreaterThanOrEqual(SEPARATION);
      }
    }
  });

  it('keeps every accessory readable on the cloak it is worn over', () => {
    for (const identity of KING_IDENTITIES) {
      if (identity.cloth !== undefined) {
        expect(distance(identity.cloth, identity.cloak), `${identity.id} cloth on cloak`)
          .toBeGreaterThanOrEqual(20);
      }
      if (identity.accessory.some((s) => s.fill === 'playerAccent' || s.stroke === 'playerAccent')) {
        expect(distance(PALETTE.playerAccent, identity.cloak), `${identity.id} trim on cloak`)
          .toBeGreaterThanOrEqual(20);
      }
    }
  });

  it('names a cloth colour exactly when an accessory draws with one', () => {
    for (const identity of KING_IDENTITIES) {
      const uses = identity.accessory.some(
        (shape) => shape.fill === 'identityCloth' || shape.stroke === 'identityCloth',
      );
      expect(uses, `${identity.id} declares a cloth it never draws, or draws one it never declared`)
        .toBe(identity.cloth !== undefined);
    }
  });

  it('authors every accessory for the view it can be seen from', () => {
    for (const identity of KING_IDENTITIES) {
      if (identity.accessory.length === 0) continue;
      const sides = new Set(identity.accessory.map((shape) => shape.side ?? 'all'));
      const covered = sides.has('all') || (sides.has('front') && sides.has('back') && sides.has('profile'));
      expect(covered, `${identity.id} is not drawn from every facing: ${[...sides].join(', ')}`).toBe(true);
    }
  });

  it('desaturates with the rest of the palette', () => {
    const flat = Object.values(PRESENTATION_PRESETS).find((preset) => resolve(preset).visual.saturation < 1);
    expect(flat, 'no preset desaturates, so this claim cannot be checked').toBeDefined();
    const vis = resolve(flat!);
    const dressed = identityPalette({ ...PALETTE }, identityById('verdant_watch'), vis.visual, vis.preserveThreatColors);
    expect(dressed.player).not.toBe(identityById('verdant_watch').cloak);
  });

  it('attaches accessories to the flat king and to no other bank', () => {
    const identity = identityById('verdant_watch');
    const flat = identityModels(DEFAULT_MODELS, identity);
    expect(flat.models.player.shapes.length).toBe(POLISHED_KING.shapes.length + identity.accessory.length);
    for (const id of ['mesh']) {
      const bank = MODEL_BANKS[id];
      if (bank === undefined) continue;
      expect(identityModels(bank, identity), `${id} grew geometry`).toBe(bank);
    }
  });

  it('rebuilds no geometry per frame', () => {
    const identity = identityById('crimson_oath');
    expect(identityModels(DEFAULT_MODELS, identity)).toBe(identityModels(DEFAULT_MODELS, identity));
  });
});

describe('dealing identities to a room', () => {
  it('always gives seat zero the white king', () => {
    for (const room of ['ABC234', 'ZZZZZZ', 'QRSTUV', '']) {
      expect(seatIdentities(room, 4)[0]).toBe('ivory_heir');
    }
  });

  it('gives no two seats the same king', () => {
    for (const room of ['ABC234', 'MNPQRS', 'KLMNPQ']) {
      const seats = seatIdentities(room, KING_IDENTITIES.length);
      expect(new Set(seats).size).toBe(seats.length);
    }
  });

  it('reaches the same answer twice, so both peers agree without asking', () => {
    expect(seatIdentities('ABC234', 4)).toEqual(seatIdentities('ABC234', 4));
  });

  it('deals a different party for a different room', () => {
    const a = seatIdentities('ABC234', 4).slice(1);
    const b = seatIdentities('XYZ789', 4).slice(1);
    expect(a).not.toEqual(b);
  });

  it('seats a party larger than the table rather than seating nobody', () => {
    const seats = seatIdentities('ABC234', KING_IDENTITIES.length + 3);
    expect(seats).toHaveLength(KING_IDENTITIES.length + 3);
    expect(seats.every((id: string) => KING_IDENTITIES.some((k: KingIdentity) => k.id === id))).toBe(true);
  });
});
