
import type { CombatConfig, EnemyArchetype, Vec2, World } from '../sim/types';
import type { Camera } from './iso';
import { ISO_X, ISO_Y, actionBounds, fitActionZoom, rosterLook } from './iso';

export interface CameraShot {
  zoom: number;
  focus: Vec2;
}

export const CAMERA_EASE = 3.4;

export const threatReach = (cfg: CombatConfig, archetype: EnemyArchetype): number => {
  const enemy = cfg.enemies[archetype];
  return (
    Math.max(
      enemy.attackRange,
      ...enemy.attacks.map((attack) => attack.range + attack.lungeDistance),
    ) + 1.2
  );
};

const framedThreat = (
  threat: { pos: Vec2; reach: number },
  resting: CameraShot,
  into: { w: number; h: number },
): boolean => {
  const dx = threat.pos.x - resting.focus.x;
  const dy = threat.pos.y - resting.focus.y;
  const pad = 2 * threat.reach;
  return (
    Math.abs(dx - dy) * ISO_X * resting.zoom <= into.w / 2 + pad * ISO_X * resting.zoom &&
    Math.abs(dx + dy) * ISO_Y * resting.zoom <= into.h / 2 + pad * ISO_Y * resting.zoom
  );
};

export const actionShot = (
  cam: Camera,
  world: World,
  cfg: CombatConfig,
  kings: readonly Vec2[],
  resting: CameraShot,
  marginPx: number,
  into: { w: number; h: number },
): CameraShot => {
  const threats = world.enemies
    .filter((enemy) => enemy.state.kind !== 'dead')
    .map((enemy) => ({ pos: enemy.pos, reach: threatReach(cfg, enemy.archetype) }))
    .filter((threat) => framedThreat(threat, resting, into));
  const bounds = actionBounds(kings, threats);
  if (bounds === null) return resting;
  const look = rosterLook(kings);
  return {
    zoom: fitActionZoom(cam, bounds, resting.zoom, marginPx, into),
    focus: {
      x: look.x * 0.6 + bounds.center.x * 0.4,
      y: look.y * 0.6 + bounds.center.y * 0.4,
    },
  };
};

export class ActionCamera {
  private shot: CameraShot = { zoom: 1, focus: { x: 0, y: 0 } };

  cut(to: CameraShot): void {
    this.shot = { zoom: to.zoom, focus: { x: to.focus.x, y: to.focus.y } };
  }

  advance(cam: Camera, to: CameraShot, dtRealMs: number): void {
    const k = 1 - Math.exp((-CAMERA_EASE * dtRealMs) / 1000);
    this.shot = {
      zoom: this.shot.zoom + (to.zoom - this.shot.zoom) * k,
      focus: {
        x: this.shot.focus.x + (to.focus.x - this.shot.focus.x) * k,
        y: this.shot.focus.y + (to.focus.y - this.shot.focus.y) * k,
      },
    };
    cam.zoom = this.shot.zoom;
    cam.center = this.shot.focus;
  }
}
