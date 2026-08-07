
import type { Arena, CombatConfig, Vec2, World } from '../sim/types';
import type { Camera } from '../render/iso';
import {
  READABLE_ZOOM,
  arenaExceedsScreen,
  clampCameraToArena,
  fitZoom,
  gameplayViewMargin,
  rosterLook,
  rosterZoom,
} from '../render/iso';
import { ActionCamera, actionShot } from '../render/action-camera';
import type { CameraShot } from '../render/action-camera';
import { ROOM_WALL_HEIGHT } from '../render/atmosphere';
import { arenaViewMargin } from '../render/arena-decor';
import type { RoomRegistry } from '../render/rooms/theme';
import type { CaptureShot } from './capture';

export type CameraMotion = 'action' | 'static';

export const captureCameraFramesAction = (search: string): boolean =>
  new URLSearchParams(search).get('captureCamera')?.trim().toLowerCase() === 'action';

interface Box {
  w: number;
  h: number;
}

export interface LabCameraHost {
  cam: Camera;
  rooms: RoomRegistry;
  captureShot: CaptureShot | null;
  world(): World;
  combat(): CombatConfig;
  touchActive(): boolean;
  showcaseActive(): boolean;
}

export class LabCamera {
  motion: CameraMotion = 'action';
  private readonly action = new ActionCamera();

  constructor(private readonly host: LabCameraHost) {}

  margin(id: string): number {
    const authored = arenaViewMargin(this.host.rooms, id);
    return gameplayViewMargin(authored, this.host.touchActive());
  }

  zoomFor(arena: Arena, id: string, box: Box): number {
    const { cam, captureShot } = this.host;
    const margin = this.margin(id);
    const roomFit = fitZoom(cam, arena, margin, box);
    if (captureShot?.inspection !== undefined) {
      return roomFit * captureShot.inspection.zoomScale;
    }
    const preferred = arenaExceedsScreen(arena) ? READABLE_ZOOM : roomFit;
    return rosterZoom(this.framedKings(), preferred, roomFit, margin, box);
  }

  look(box: Box): Vec2 {
    const { cam, captureShot } = this.host;
    if (captureShot?.inspection !== undefined) return captureShot.inspection.focus;
    const look = rosterLook(this.framedKings());
    const world = this.host.world();
    if (arenaExceedsScreen(world.arena)) {
      return clampCameraToArena(world.arena, look, cam.zoom, box, ROOM_WALL_HEIGHT);
    }
    const lead = 0.3;
    return { x: look.x * lead, y: look.y * lead };
  }

  rest(box: Box): CameraShot {
    const world = this.host.world();
    return {
      zoom: this.zoomFor(world.arena, world.encounter.defId, box),
      focus: this.look(box),
    };
  }

  target(box: Box): CameraShot {
    const { cam } = this.host;
    const world = this.host.world();
    return actionShot(
      cam,
      world,
      this.host.combat(),
      this.framedKings(),
      this.rest(box),
      this.margin(world.encounter.defId),
      box,
    );
  }

  eases(): boolean {
    return (
      this.motion === 'action' &&
      this.host.captureShot === null &&
      !this.host.showcaseActive()
    );
  }

  private framesActionUnderCapture = false;

  frameCapturesAsAction(next: boolean): void {
    this.framesActionUnderCapture = next;
  }

  cutsToAction(): boolean {
    return this.framesActionUnderCapture && this.host.captureShot !== null;
  }

  cutToAction(box: Box): void {
    const to = this.target(box);
    this.action.cut(to);
    this.action.advance(this.host.cam, to, 0);
  }

  cut(box: Box): void {
    this.action.cut(this.target(box));
  }

  advance(box: Box, dtRealMs: number): void {
    this.action.advance(this.host.cam, this.target(box), dtRealMs);
  }

  private framedKings(): Vec2[] {
    return this.host.world().players.map((player) => player.pos);
  }
}
