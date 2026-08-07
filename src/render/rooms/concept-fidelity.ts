import type { RoomTheme } from './theme';

export const CONCEPT_FALLEN_CROWN: RoomTheme = {
  props: [
    ['column', 0.03, 0],
    ['arch', 0.15, 1],
    ['banner', 0.27, 2],
    ['brazier', 0.42, 3],
    ['arch', 0.58, 4],
    ['banner', 0.73, 5],
    ['column', 0.88, 6],
    ['brazier', 0.97, 7],
  ],
  floorDress: { kind: 'medallion', alpha: 0.018 },
  surface: { pattern: 'ceremonial', spacing: 2.15, alpha: 0.09 },
  air: { kind: 'draft', count: 7, at: { x: 0, y: -0.25 }, spread: { x: 6, y: 2 } },
  markings: () => undefined,
  accent: (pal) => pal.playerAccent,
};

export const CONCEPT_UNBOUND: RoomTheme = {
  props: [
    ['rubble', 0.04, 1],
    ['column', 0.19, 0],
    ['banner', 0.35, 2],
    ['brazier', 0.52, 3],
    ['rubble', 0.68, 4],
    ['column', 0.83, 5],
    ['brazier', 0.96, 6],
  ],
  floorDress: { kind: 'patches', alpha: 0.014 },
  surface: { pattern: 'patchwork', spacing: 2.8, alpha: 0.06 },
  air: { kind: 'mortar', count: 9, at: { x: 0, y: 0 }, spread: { x: 8, y: 5 } },
  markings: () => undefined,
  accent: (pal) => pal.playerAccent,
};
