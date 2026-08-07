
import type { ModelBank, ModelDef, ModelShape } from './models';
import type { Palette } from './palette';
import type { PaletteLayers } from './palette';
import { transformPalette } from './palette';

export type KingIdentityId =
  | 'ivory_heir'
  | 'crimson_oath'
  | 'azure_envoy'
  | 'verdant_watch'
  | 'violet_seal'
  | 'ember_pilgrim'
  | 'silver_mourner'
  | 'rose_duelist';

export interface KingIdentity {
  id: KingIdentityId;
  name: string;
  cloak: string;
  cloth?: string;
  accessory: readonly ModelShape[];
}

const poly = (
  points: Array<[number, number]>,
  fill: string,
  opts: Partial<ModelShape> = {},
): ModelShape => ({ kind: 'poly', points, fill, stroke: 'outline', width: 1.25, ...opts });

const line = (
  points: Array<[number, number]>,
  stroke: string,
  width: number,
  opts: Partial<ModelShape> = {},
): ModelShape => ({ kind: 'line', points, fill: null, stroke, width, ...opts });

const ellipse = (
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  fill: string,
  opts: Partial<ModelShape> = {},
): ModelShape => ({ kind: 'ellipse', cx, cy, rx, ry, fill, stroke: 'outline', width: 1.25, ...opts });




const hood = (): ModelShape[] => [
  poly(
    [[-0.3, 0.72], [-0.32, 0.94], [-0.16, 1.02], [0.16, 1.02], [0.32, 0.94], [0.3, 0.72]],
    'player',
    { side: 'front', shade: 0.72 },
  ),
  poly(
    [[-0.3, 0.72], [-0.32, 0.96], [-0.14, 1.04], [0.14, 1.04], [0.32, 0.96], [0.3, 0.72]],
    'player',
    { side: 'back', shade: 0.8 },
  ),
  poly(
    [[-0.22, 0.72], [-0.26, 0.96], [-0.06, 1.03], [0.14, 0.96], [0.12, 0.73]],
    'player',
    { side: 'profile', shade: 0.76 },
  ),
];

export const KING_IDENTITIES: readonly KingIdentity[] = [
  {
    id: 'ivory_heir',
    name: 'Ivory Heir',
    cloak: '#efeae0',
    accessory: [],
  },

  {
    id: 'crimson_oath',
    name: 'Crimson Oath',
    cloak: '#e38355',
    accessory: [
      poly([[-0.3, 0.78], [-0.15, 0.8], [0.24, 0.33], [0.12, 0.28]], 'playerAccent', {
        side: 'front',
        shade: 0.92,
      }),
      poly([[-0.34, 0.68], [-0.34, 0.82], [-0.2, 0.82], [-0.2, 0.68]], 'playerAccent', {
        side: 'front',
      }),
      poly([[-0.26, 0.76], [-0.12, 0.79], [0.22, 0.32], [0.11, 0.28]], 'playerAccent', {
        side: 'back',
        shade: 0.82,
      }),
      poly([[-0.16, 0.77], [-0.04, 0.79], [0.16, 0.34], [0.06, 0.31]], 'playerAccent', {
        side: 'profile',
        shade: 0.86,
      }),
    ],
  },

  {
    id: 'azure_envoy',
    name: 'Azure Envoy',
    cloak: '#a9d5f1',
    cloth: '#24405f',
    accessory: [
      poly([[-0.19, 0.72], [-0.19, 0.16], [0, 0.09], [0.19, 0.16], [0.19, 0.72]], 'identityCloth', {
        side: 'front',
      }),
      poly([[-0.16, 0.7], [-0.16, 0.14], [0, 0.08], [0.16, 0.14], [0.16, 0.7]], 'identityCloth', {
        side: 'back',
        shade: 0.84,
      }),
      poly([[-0.1, 0.7], [-0.1, 0.15], [0.02, 0.1], [0.14, 0.16], [0.14, 0.7]], 'identityCloth', {
        side: 'profile',
        shade: 0.88,
      }),
    ],
  },

  {
    id: 'verdant_watch',
    name: 'Verdant Watch',
    cloak: '#7da15a',
    accessory: [
      ...hood(),
      line([[0.3, 0.44], [0.3, 0.34]], 'playerAccent', 2, {}),
      poly([[0.22, 0.34], [0.22, 0.16], [0.3, 0.1], [0.38, 0.16], [0.38, 0.34]], 'playerAccent', {
        shade: 0.86,
      }),
      poly([[0.25, 0.31], [0.25, 0.19], [0.35, 0.19], [0.35, 0.31]], 'parryFlash', {
        stroke: null,
      }),
    ],
  },

  {
    id: 'violet_seal',
    name: 'Violet Seal',
    cloak: '#da63e5',
    cloth: '#e6e2d8',
    accessory: [
      poly([[-0.5, 0.78], [-0.44, 0.6], [0.44, 0.6], [0.5, 0.78], [0.28, 0.84], [-0.28, 0.84]], 'player', {
        shade: 0.66,
      }),
      line([[-0.45, 0.61], [0.45, 0.61]], 'playerAccent', 2.2, {}),
      ...[0.54, 0.44, 0.34].map((y) =>
        poly([[0, y + 0.055], [0.055, y], [0, y - 0.055], [-0.055, y]], 'identityCloth', {
          side: 'front',
          stroke: 'playerAccent',
          width: 1.4,
        }),
      ),
    ],
  },

  {
    id: 'ember_pilgrim',
    name: 'Ember Pilgrim',
    cloak: '#eac18b',
    cloth: '#6b4a30',
    accessory: [
      ...hood(),
      poly([[0.18, 0.44], [0.18, 0.24], [0.42, 0.24], [0.42, 0.44]], 'identityCloth', {}),
      poly([[0.16, 0.46], [0.16, 0.36], [0.44, 0.36], [0.44, 0.46]], 'identityCloth', {
        shade: 0.78,
      }),
      line([[0.3, 0.44], [0.3, 0.62]], 'identityCloth', 2.4, { shade: 0.7 }),
    ],
  },

  {
    id: 'silver_mourner',
    name: 'Silver Mourner',
    cloak: '#9b95b8',
    cloth: '#e4e8f0',
    accessory: [
      poly([[-0.26, 0.96], [-0.36, 0.62], [-0.22, 0.6], [-0.16, 0.94]], 'identityCloth', {
        part: 'head',
        side: 'front',
        shade: 0.9,
      }),
      poly([[0.26, 0.96], [0.36, 0.62], [0.22, 0.6], [0.16, 0.94]], 'identityCloth', {
        part: 'head',
        side: 'front',
        shade: 0.76,
      }),
      poly([[-0.28, 0.96], [-0.34, 0.6], [0.34, 0.6], [0.28, 0.96]], 'identityCloth', {
        part: 'head',
        side: 'back',
        shade: 0.82,
      }),
      poly([[-0.2, 0.95], [-0.3, 0.6], [-0.14, 0.58], [-0.08, 0.93]], 'identityCloth', {
        part: 'head',
        side: 'profile',
        shade: 0.84,
      }),
      ellipse(0, 0.72, 0.09, 0.06, 'identityCloth', {
        side: 'front',
        stroke: 'playerAccent',
        width: 1.6,
      }),
    ],
  },

  {
    id: 'rose_duelist',
    name: 'Rose Duelist',
    cloak: '#ee98a6',
    cloth: '#a4425f',
    accessory: [
      poly([[-0.32, 0.5], [-0.32, 0.38], [0.32, 0.38], [0.32, 0.5]], 'identityCloth', {}),
      poly([[-0.12, 0.52], [-0.12, 0.36], [0.12, 0.36], [0.12, 0.52]], 'identityCloth', {
        shade: 0.82,
      }),
      poly([[-0.1, 0.38], [-0.16, 0.14], [-0.04, 0.12], [0.01, 0.37]], 'identityCloth', {
        side: 'front',
        shade: 0.9,
      }),
      poly([[0.03, 0.37], [0.06, 0.12], [0.18, 0.14], [0.11, 0.38]], 'identityCloth', {
        side: 'front',
        shade: 0.74,
      }),
    ],
  },
];

const BY_ID = new Map(KING_IDENTITIES.map((identity) => [identity.id, identity]));

export const identityAt = (seat: number): KingIdentity =>
  KING_IDENTITIES[((seat % KING_IDENTITIES.length) + KING_IDENTITIES.length) % KING_IDENTITIES.length];

export const identityById = (id: KingIdentityId): KingIdentity => {
  const found = BY_ID.get(id);
  return found ?? KING_IDENTITIES[0];
};

export const identityPalette = (
  pal: Palette,
  identity: KingIdentity,
  vis: PaletteLayers,
  preserveThreat: boolean,
): Palette => {
  if (identity.accessory.length === 0 && identity.cloth === undefined && identity.cloak === pal.player) {
    return pal;
  }
  const patch = transformPalette(
    { player: identity.cloak, identityCloth: identity.cloth ?? pal.identityCloth },
    vis,
    preserveThreat,
  );
  return { ...pal, player: patch.player, identityCloth: patch.identityCloth };
};

const bankCache = new Map<string, ModelBank>();

export const identityModels = (bank: ModelBank, identity: KingIdentity): ModelBank => {
  const king = bank.models.player;
  if (identity.accessory.length === 0 || king.mesh !== undefined) {
    return bank;
  }
  const key = `${bank.id}:${identity.id}`;
  const cached = bankCache.get(key);
  if (cached !== undefined) return cached;
  const dressed: ModelDef = { ...king, shapes: [...king.shapes, ...identity.accessory] };
  const made: ModelBank = {
    id: bank.id,
    description: bank.description,
    models: { ...bank.models, player: dressed },
  };
  bankCache.set(key, made);
  return made;
};
