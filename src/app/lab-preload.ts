
import type { Arena, World } from '../sim/types';
import { LAB_BLOCKING_AUDIO, LAB_ROOM_MESHES, LAB_ROOM_PACKAGES } from '../render/asset-registry-lab';
import { ENCOUNTERS } from '../lab/encounters';
import { createPreload, type Preload } from './preload';
import { castMeshPending, warmCastMeshes } from './lab-cast-mesh';
import {
  roomPackagesPending,
  roomPainterFor,
  webglRoomFor,
  webglRoomsPending,
} from './lab-rooms';

const roomArena = (encounterId: string): Arena | null =>
  ENCOUNTERS[encounterId]?.arena ?? null;

export const preloadLab = (liveWorld: () => World): Preload => {
  const shared = createPreload(LAB_BLOCKING_AUDIO);

  warmCastMeshes();

  for (const id of new Set([...Object.keys(LAB_ROOM_MESHES), ...Object.keys(LAB_ROOM_PACKAGES)])) {
    const arena = roomArena(id);
    if (arena === null) {
      console.warn(`[preload] no encounter for baked room ${id} — check asset-registry-lab.ts`);
      continue;
    }
    if (id === liveWorld().encounter.defId) webglRoomFor(id, arena, liveWorld);
    roomPainterFor(id, liveWorld);
  }

  return {
    done: () =>
      shared.done() &&
      webglRoomsPending.size === 0 &&
      roomPackagesPending.size === 0 &&
      castMeshPending.size === 0,
  };
};
