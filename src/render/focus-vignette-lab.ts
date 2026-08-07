
import type { Camera } from './iso';
import { worldToScreen } from './iso';
import { withAlpha } from './palette';
import { ambienceFor, hashNoise } from './atmosphere';
import type { RoomRegistry } from './rooms/theme';
import type { World } from '../sim/types';
import type { VignetteLayer } from '../lab/presentation';

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

const BREATH_PERIOD_MS = 4200;
const BREATH_SCALE = 0.04;
const CHAIN_TIGHTEN_SCALE = 0.1;
const CHAIN_FULL_STREAK = 8;
const PULSE_MS = 160;
const PULSE_SCALE = 0.05;

export interface VignetteDriveInput {
  dtMs: number;
  layer: VignetteLayer;
  override: number | null;
  streak: number;
  simTimeMs: number;
}

export class FocusVignetteDrive {
  private eased = -1;
  private lastStreak = 0;
  private pulseLeftMs = 0;
  private reliefLeftMs = 0;

  reset(): void {
    this.eased = -1;
    this.lastStreak = 0;
    this.pulseLeftMs = 0;
    this.reliefLeftMs = 0;
  }

  get amount(): number {
    return Math.max(0, this.eased);
  }

  advance(input: VignetteDriveInput): number {
    const { dtMs, layer, override, streak, simTimeMs } = input;
    let target = clamp01(override ?? layer.amount);

    if (streak === 0 && this.lastStreak > 0) this.reliefLeftMs = layer.openMs;
    if (streak > this.lastStreak && layer.pulseWithTiming) this.pulseLeftMs = PULSE_MS;
    this.lastStreak = streak;

    if (this.reliefLeftMs > 0) {
      this.reliefLeftMs = Math.max(0, this.reliefLeftMs - dtMs);
      target *= 1 - clamp01(layer.rhythmRelief);
    }

    if (this.eased < 0) {
      this.eased = target;
    } else if (target > this.eased) {
      this.eased = Math.min(target, this.eased + dtMs / Math.max(1, layer.closeMs));
    } else {
      this.eased = Math.max(target, this.eased - dtMs / Math.max(1, layer.openMs));
    }

    if (this.eased <= 0) return 0;

    const breath = Math.sin((simTimeMs / BREATH_PERIOD_MS) * Math.PI * 2) * layer.breath * BREATH_SCALE;
    const chain = Math.min(streak, CHAIN_FULL_STREAK) / CHAIN_FULL_STREAK;
    const tighten = chain * layer.breath * CHAIN_TIGHTEN_SCALE;
    if (this.pulseLeftMs > 0) this.pulseLeftMs = Math.max(0, this.pulseLeftMs - dtMs);
    const pulse = (this.pulseLeftMs / PULSE_MS) * layer.breath * PULSE_SCALE;

    return clamp01(this.eased + breath + tighten + pulse);
  }
}

export interface VignetteGeometry {
  clearRadius: number;
  edgeRadius: number;
  alpha: number;
  reach: number;
}

export const vignetteGeometry = (
  effective: number,
  layer: VignetteLayer,
  width: number,
  height: number,
): VignetteGeometry => {
  const reach = Math.hypot(width, height) / 2;
  const cover = clamp01(effective) * clamp01(layer.maxCoverage);
  const clearRadius = reach * (1 - cover);
  const featherWidth = reach * clamp01(layer.feather) * (0.35 + 0.65 * clamp01(effective));
  return {
    clearRadius,
    edgeRadius: Math.max(clearRadius + 1, Math.min(reach * 1.05, clearRadius + featherWidth)),
    alpha: 0.9 * clamp01(effective),
    reach,
  };
};

const paintRadial = (
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  g: VignetteGeometry,
  tone: string,
  width: number,
  height: number,
  alphaScale = 1,
): void => {
  const gradient = ctx.createRadialGradient(cx, cy, g.clearRadius, cx, cy, g.edgeRadius);
  gradient.addColorStop(0, withAlpha(tone, 0));
  gradient.addColorStop(1, withAlpha(tone, g.alpha * alphaScale));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  if (g.edgeRadius < Math.hypot(width, height) / 2 + 1) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, width, height);
    ctx.arc(cx, cy, g.edgeRadius, 0, Math.PI * 2, true);
    ctx.fillStyle = withAlpha(tone, g.alpha * alphaScale);
    ctx.fill('evenodd');
    ctx.restore();
  }
};

const paintEyelid = (
  ctx: CanvasRenderingContext2D,
  cy: number,
  g: VignetteGeometry,
  layer: VignetteLayer,
  effective: number,
  tone: string,
  width: number,
  height: number,
): void => {
  const cover = clamp01(effective) * clamp01(layer.maxCoverage);
  const lid = (height / 2) * cover;
  const feather = (height / 2) * clamp01(layer.feather) * (0.35 + 0.65 * clamp01(effective));
  const top = ctx.createLinearGradient(0, cy - height / 2, 0, cy - height / 2 + lid + feather);
  top.addColorStop(0, withAlpha(tone, g.alpha));
  top.addColorStop(Math.min(1, lid / (lid + feather)), withAlpha(tone, g.alpha * 0.55));
  top.addColorStop(1, withAlpha(tone, 0));
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, width, height);
  const bottom = ctx.createLinearGradient(0, cy + height / 2, 0, cy + height / 2 - lid - feather);
  bottom.addColorStop(0, withAlpha(tone, g.alpha));
  bottom.addColorStop(Math.min(1, lid / (lid + feather)), withAlpha(tone, g.alpha * 0.55));
  bottom.addColorStop(1, withAlpha(tone, 0));
  ctx.fillStyle = bottom;
  ctx.fillRect(0, 0, width, height);
};

export class FocusVignette {
  readonly drive = new FocusVignetteDrive();
  private windowCanvas: HTMLCanvasElement | null = null;

  get amount(): number {
    return this.drive.amount;
  }

  reset(): void {
    this.drive.reset();
  }

  draw(
    ctx: CanvasRenderingContext2D,
    cam: Camera,
    world: World,
    localPlayer: number,
    rooms: RoomRegistry,
    input: Omit<VignetteDriveInput, 'streak'>,
  ): void {
    const king = world.players[localPlayer] ?? world.players[0];
    const effective = this.drive.advance({ ...input, streak: king.parryStreak });
    if (effective <= 0.001) return;

    const { layer } = input;
    const width = cam.width;
    const height = cam.height;
    const cx = width / 2 + cam.offset.x;
    const cy = height / 2 + cam.offset.y;
    const tone = ambienceFor(rooms, world.encounter.defId).skyLow;
    const g = vignetteGeometry(effective, layer, width, height);

    const target = layer.threatWindows ? this.windowContext(width, height) : ctx;
    if (target !== ctx) target.clearRect(0, 0, width, height);

    if (layer.shape === 'eyelid') {
      paintEyelid(target, cy, g, layer, effective, tone, width, height);
    } else if (layer.shape === 'irregular') {
      for (let i = 0; i < 3; i++) {
        const dx = (hashNoise(i, 21) - 0.5) * g.reach * 0.22;
        const dy = (hashNoise(i, 33) - 0.5) * g.reach * 0.18;
        paintRadial(target, cx + dx, cy + dy, g, tone, width, height, 0.5);
      }
    } else {
      paintRadial(target, cx, cy, g, tone, width, height);
    }

    if (layer.threatWindows && target !== ctx) {
      target.save();
      target.globalCompositeOperation = 'destination-out';
      const windowRadius = g.reach * 0.12;
      for (const enemy of world.enemies) {
        if (enemy.hp <= 0) continue;
        const at = worldToScreen(cam, enemy.pos);
        const fromCentre = Math.hypot(at.x - cx, at.y - cy);
        if (fromCentre <= g.clearRadius) continue;
        const hole = target.createRadialGradient(at.x, at.y, 0, at.x, at.y, windowRadius);
        hole.addColorStop(0, 'rgba(0,0,0,1)');
        hole.addColorStop(0.6, 'rgba(0,0,0,0.85)');
        hole.addColorStop(1, 'rgba(0,0,0,0)');
        target.fillStyle = hole;
        target.fillRect(at.x - windowRadius, at.y - windowRadius, windowRadius * 2, windowRadius * 2);
      }
      target.restore();
      ctx.drawImage(this.windowCanvas as HTMLCanvasElement, 0, 0, width, height);
    }
  }

  private windowContext(width: number, height: number): CanvasRenderingContext2D {
    if (this.windowCanvas === null) this.windowCanvas = document.createElement('canvas');
    const c = this.windowCanvas;
    if (c.width !== Math.ceil(width) || c.height !== Math.ceil(height)) {
      c.width = Math.ceil(width);
      c.height = Math.ceil(height);
    }
    return c.getContext('2d') as CanvasRenderingContext2D;
  }
}
