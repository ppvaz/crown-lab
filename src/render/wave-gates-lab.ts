
import type { Camera } from './iso';
import { worldToScreen } from './iso';
import type { EncounterDef, World } from '../sim/types';
import type { Palette } from './palette';
import type { FloorPad } from './draw';

export const GATE_LEAD_MS = 2200;

const GATE_RADIUS = 0.72;

const TAU = Math.PI * 2;

export const waveGatePads = (
  ctx: CanvasRenderingContext2D,
  world: World,
  cam: Camera,
  pal: Palette,
  def: EncounterDef,
): FloorPad[] => {
  const wave = def.waves[world.encounter.nextWave];
  if (wave === undefined || wave.atMs === null) return [];
  const remaining = wave.atMs - world.encounter.elapsedMs;
  if (remaining > GATE_LEAD_MS || remaining < 0) return [];

  const urgency = 1 - remaining / GATE_LEAD_MS;


  const seen = new Set<string>();
  const pads: FloorPad[] = [];
  for (const spawn of wave.spawns) {
    const key = `${spawn.at.x},${spawn.at.y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pads.push({
      at: spawn.at,
      draw: () => {
        const p = worldToScreen(cam, spawn.at);
        const rx = GATE_RADIUS * 32 * cam.zoom;
        const ry = rx * 0.5;
        const alpha = ctx.globalAlpha;
        ctx.strokeStyle = pal.telegraph;
        ctx.globalAlpha = (0.18 + urgency * 0.5) * alpha;
        ctx.lineWidth = Math.max(1, (1 + urgency * 1.6) * cam.zoom);
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, rx, ry, 0, 0, TAU);
        ctx.stroke();
        ctx.globalAlpha = (0.12 + urgency * 0.38) * alpha;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, rx * urgency, ry * urgency, 0, 0, TAU);
        ctx.stroke();
        ctx.globalAlpha = alpha;
      },
    });
  }
  return pads;
};
