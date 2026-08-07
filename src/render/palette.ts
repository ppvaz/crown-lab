
import type { EnemyArchetype } from '../sim/types';


export const PALETTE = {
  floor: '#14141a',
  floorGrid: '#1e1e27',
  wall: '#2a2a35',
  garment: '#626270',
  player: '#efeae0',
  playerFace: '#efeae0',
  playerAccent: '#c8a94a',
  identityCloth: '#e6e2d8',
  guard: '#c2444a',
  duelist: '#4a7fc2',
  archer: '#9a6fc4',
  firstBlade: '#b7864e',

  captain: '#c94450',
  chancellor: '#a961e8',

  queen: '#c04a6e',
  glassRegent: '#5bb8cf',
  thornMarshal: '#8f9663',
  projectile: '#e0c04a',
  projectileReflected: '#7fe0a0',
  lightning: '#7fd4ff',
  lightningStrained: '#a86fe0',
  lightningOvercast: '#ff4d5a',
  telegraph: '#e05a4a',
  unparryable: '#ff2f6d',
  parryFlash: '#ffd873',
  hit: '#ffffff',
  stagger: '#7de0d0',
  hudDim: '#4a4a56',
  hudText: '#d8d4cc',
  danger: '#c2444a',
  stamina: '#6fc28a',
} as const;

export type LabPaletteKey =
  | 'captain'
  | 'rainBoss'
  | 'eliteGuard'
  | 'chancellor'
  | 'pikeNovice'
  | 'pikeBoss';

export type Palette = { -readonly [K in keyof typeof PALETTE]: string } & {
  [K in LabPaletteKey]?: string;
};

export type ArchetypeColor = (archetype: EnemyArchetype) => string;

export const publicArchetypeColor: ArchetypeColor = (archetype) => {
  if (archetype === 'guard') return PALETTE.guard;
  if (archetype === 'duelist') return PALETTE.duelist;
  if (archetype === 'archer') return PALETTE.archer;
  if (archetype === 'first_blade') return PALETTE.firstBlade;
  if (archetype === 'captain') return PALETTE.captain;
  if (archetype === 'chancellor') return PALETTE.chancellor;
  if (archetype === 'queen') return PALETTE.queen;
  if (archetype === 'glass_regent') return PALETTE.glassRegent;
  if (archetype === 'thorn_marshal') return PALETTE.thornMarshal;
  return PALETTE.playerAccent;
};




interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface PaletteLayers {
  saturation: number;
  contrast: number;
}
const hexToRgb = (hex: string): Rgb => {
  const v = parseInt(hex.slice(1), 16);
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
};

const clamp255 = (n: number): number => (n < 0 ? 0 : n > 255 ? 255 : Math.round(n));

const rgbToHex = ({ r, g, b }: Rgb): string =>
  `#${((clamp255(r) << 16) | (clamp255(g) << 8) | clamp255(b)).toString(16).padStart(6, '0')}`;

const luma = ({ r, g, b }: Rgb): number => 0.2126 * r + 0.7152 * g + 0.0722 * b;

export const saturate = (hex: string, amount: number): string => {
  const c = hexToRgb(hex);
  const l = luma(c);
  return rgbToHex({
    r: l + (c.r - l) * amount,
    g: l + (c.g - l) * amount,
    b: l + (c.b - l) * amount,
  });
};

export const contrast = (hex: string, amount: number): string => {
  const c = hexToRgb(hex);
  return rgbToHex({
    r: 128 + (c.r - 128) * amount,
    g: 128 + (c.g - 128) * amount,
    b: 128 + (c.b - 128) * amount,
  });
};

export const shade = (hex: string, amount: number): string => {
  const value = Number.parseInt(hex.slice(1), 16);
  const channel = (shift: number): number => {
    const c = (value >> shift) & 255;
    return Math.max(
      0,
      Math.min(255, Math.round(amount > 1 ? c + (255 - c) * (amount - 1) : c * amount)),
    );
  };
  return `#${((channel(16) << 16) | (channel(8) << 8) | channel(0)).toString(16).padStart(6, '0')}`;
};

export const withAlpha = (hex: string, alpha: number): string => {
  const value = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
};

export const THREAT_KEYS = [
  'telegraph',
  'unparryable',
  'parryFlash',
  'danger',
  'stagger',
] as const;

export const transformPalette = <T extends Record<string, string>>(
  palette: T,
  vis: PaletteLayers,
  preserveThreat: boolean,
): T => {
  if (vis.saturation === 1 && vis.contrast === 1) return palette;
  const out: Record<string, string> = {};
  const threat = new Set<string>(THREAT_KEYS);
  for (const [key, value] of Object.entries(palette)) {
    if (preserveThreat && threat.has(key)) {
      out[key] = value;
      continue;
    }
    out[key] = contrast(saturate(value, vis.saturation), vis.contrast);
  }
  return out as T;
};
