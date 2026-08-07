
import type { Arena, World } from '../sim/types';
import { LAB_ROOM_MESHES, LAB_ROOM_PACKAGES } from '../render/asset-registry-lab';
import {
  loadRoomPackage,
  type RoomLayerPainter,
  type SortedOccluder,
} from '../render/room-package-lab';
import {
  createWebglRoom,
  ROOM_ABLATION_AXES,
  type RoomAblationAxis,
} from '../render/room-webgl-lab';
import { warmParallax } from '../render/sky';

export const roomAblationFromSearch = (search: string): readonly RoomAblationAxis[] => {
  const raw = new URLSearchParams(search).get('roomAblate');
  if (raw === null) return [];
  const axes: RoomAblationAxis[] = [];
  for (const part of raw.split(',').map((s) => s.trim()).filter(Boolean)) {
    if ((ROOM_ABLATION_AXES as readonly string[]).includes(part)) {
      axes.push(part as RoomAblationAxis);
    } else {
      console.warn(`[rooms] unknown ablation axis dropped: ${part}`);
    }
  }
  return axes;
};

const roomPainters = new Map<string, { painter: RoomLayerPainter; occluders: SortedOccluder[] }>();
const roomPackagesAttempted = new Set<string>();
export const roomPackagesPending = new Set<string>();

export const roomPainterFor = (
  encounterId: string,
  liveWorld?: () => World,
): { painter: RoomLayerPainter; occluders: SortedOccluder[] } | null => {
  const ready = roomPainters.get(encounterId);
  if (ready !== undefined) return ready;
  if (roomPackagesAttempted.has(encounterId)) return null;
  const source = LAB_ROOM_PACKAGES[encounterId];
  if (source === undefined) {
    roomPackagesAttempted.add(encounterId);
    return null;
  }
  roomPackagesAttempted.add(encounterId);
  roomPackagesPending.add(encounterId);
  void loadRoomPackage(source, (reason) => {
    console.warn(`[rooms] ${encounterId} package not composited: ${reason}`);
  }, liveWorld).then((loaded) => {
    if (loaded !== null) {
      roomPainters.set(encounterId, { painter: loaded.painter, occluders: loaded.occluders });
    }
    roomPackagesPending.delete(encounterId);
  });
  return null;
};

const webglRooms = new Map<string, { painter: RoomLayerPainter; occluders: SortedOccluder[] }>();
const webglRoomsAttempted = new Set<string>();
export const webglRoomsPending = new Set<string>();

let roomMsaaOff = false;
export const roomMsaaEnabled = (): boolean => !roomMsaaOff;
export const setRoomMsaa = (enabled: boolean): void => {
  if (roomMsaaOff === !enabled) return;
  roomMsaaOff = !enabled;
  webglRooms.clear();
  webglRoomsAttempted.clear();
};

export const webglRoomFor = (
  encounterId: string,
  arena: Arena,
  liveWorld: () => World,
): { painter: RoomLayerPainter; occluders: SortedOccluder[] } | null => {
  const ready = webglRooms.get(encounterId);
  if (ready !== undefined) return ready;
  if (webglRoomsAttempted.has(encounterId)) return null;
  webglRoomsAttempted.add(encounterId);
  const source = LAB_ROOM_MESHES[encounterId];
  if (source === undefined) return null;
  webglRoomsPending.add(encounterId);
  const ablate = [...roomAblationFromSearch(location.search)];
  if (roomMsaaOff && !ablate.includes('msaa')) ablate.push('msaa');
  void createWebglRoom(source, arena, {
    world: liveWorld,
    ablate,
    onFailure: (reason) => {
      console.warn(`[rooms] ${encounterId} live room not drawn: ${reason}`);
    },
  }).then((built) => {
    if (built !== null) {
      webglRooms.set(encounterId, built);
      if (new URLSearchParams(location.search).has('roomAblate')) {
        document.documentElement.dataset.captureRoomAblate = ablate.join(',');
      }
    }
    webglRoomsPending.delete(encounterId);
  });
  return null;
};

export const warmRoom = (
  encounterId: string,
  arena: Arena,
  liveWorld: () => World,
): void => {
  webglRoomFor(encounterId, arena, liveWorld);
  roomPainterFor(encounterId, liveWorld);
  warmParallax();
};
