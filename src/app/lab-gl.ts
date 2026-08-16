
import type { World } from '../sim/types';
import type { RoomLayerPainter } from '../render/room-package-lab';
import type { GlBackend } from '../render/gl/backend';
import { createGlBackend, glRoomLayer } from '../render/gl/room-layer';
import type { SunkBody } from '../render/gl/sink';
import type { Palette } from '../render/palette';
import { loadSelections, saveSelections } from './prefs';

export const RENDERER_IDS = ['canvas2d', 'three'] as const;

export type RendererId = (typeof RENDERER_IDS)[number];

const DEFAULT_RENDERER: RendererId = 'canvas2d';

let current: RendererId = DEFAULT_RENDERER;

let backend: GlBackend | null = null;

export const restoreRenderer = (): RendererId => {
  const stored = loadSelections()?.rendererId;
  current = RENDERER_IDS.find((id) => id === stored) ?? DEFAULT_RENDERER;
  return current;
};

export const rendererId = (): RendererId => current;

export const glRendererEnabled = (): boolean => current === 'three';

export const setRenderer = (next: RendererId): void => {
  if (next === current) return;
  current = next;
  if (next !== 'three') {
    backend?.dispose();
    backend = null;
  }
  const stored = loadSelections() ?? {};
  saveSelections({ ...stored, rendererId: next });
};

export const resetRenderer = (): void => setRenderer(DEFAULT_RENDERER);

export const glRoomFor = (
  liveWorld: () => World,
  pal: Palette,
  collected: SunkBody[],
): RoomLayerPainter | null => {
  if (!glRendererEnabled()) return null;
  backend ??= createGlBackend();
  if (backend === null) return null;
  return glRoomLayer(backend, liveWorld, pal, collected);
};

export const rendererFromSearch = (search: string): RendererId => {
  const params = new URLSearchParams(search);
  if (!params.has('renderer')) return DEFAULT_RENDERER;
  const value = params.get('renderer')?.trim().toLowerCase() ?? '';
  return RENDERER_IDS.find((id) => id === value) ?? DEFAULT_RENDERER;
};

export const applyRendererFromSearch = (search: string): RendererId => {
  current = rendererFromSearch(search);
  if (current !== 'three') {
    backend?.dispose();
    backend = null;
  }
  return current;
};

export const rendererLabel = (id: RendererId = current): string =>
  id === 'three' ? 'three.js (one scene)' : 'canvas2d (control)';
