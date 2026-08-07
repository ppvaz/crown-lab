
import type { Palette } from './palette';
import type { Camera } from './iso';
import { worldToScreen } from './iso';
import type { TravelNpc, TravelState } from '../game/travel';
import { reportUiText } from './ui-probe';
import { drawWrappedText } from './text';
import { drawDialogue } from './dialogue';
import { AFFORDANCE_ROWS, regionRow, type LayoutFrame } from './layout';
import type { SceneBody } from './draw';

const TAU = Math.PI * 2;

export const travelNpcBody = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  pal: Palette,
  npc: TravelNpc,
): SceneBody => ({
  at: npc.at,
  draw: () => {
    const at = worldToScreen(cam, npc.at);
    const r = 13 * cam.zoom;
    ctx.save();
    ctx.fillStyle = pal.projectileReflected;
    ctx.strokeStyle = pal.hudText;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(at.x, at.y - 24 * cam.zoom, r * 0.45, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(at.x - r * 0.7, at.y);
    ctx.lineTo(at.x - r * 0.45, at.y - 20 * cam.zoom);
    ctx.lineTo(at.x + r * 0.45, at.y - 20 * cam.zoom);
    ctx.lineTo(at.x + r * 0.7, at.y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  },
});

export const drawTravel = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  pal: Palette,
  frame: LayoutFrame,
  npc: TravelNpc,
  state: TravelState,
  prompt: string | null,
): void => {
  const type = frame.type;
  const at = worldToScreen(cam, npc.at);

  ctx.save();
  ctx.fillStyle = pal.hudText;
  ctx.font = `${Math.max(type.base, type.base * cam.zoom)}px ui-monospace, monospace`;
  ctx.textAlign = 'center';
  ctx.fillText(npc.name, at.x, at.y - 43 * cam.zoom);
  reportUiText(ctx, 'world.npc.name', npc.name, at.x, at.y - 43 * cam.zoom);
  ctx.restore();

  const affordance = frame.regions.affordance;
  if (prompt !== null && !state.open && affordance !== undefined) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = pal.hudText;
    ctx.font = `${type.base}px ui-monospace, monospace`;
    drawWrappedText(
      ctx,
      'travel.prompt.text',
      prompt,
      affordance.w,
      AFFORDANCE_ROWS,
      affordance.x + affordance.w / 2,
      (row) => regionRow(frame, affordance, row, type.base),
    );
    ctx.restore();
  }

  const narration = frame.regions.narration;
  if (state.open && narration !== undefined) {
    ctx.save();
    drawDialogue(ctx, pal, frame, {
      id: 'travel.dialogue',
      region: narration,
      speaker: npc.name,
      body: { kind: 'line', line: npc.line },
      hint: prompt,
    });
    ctx.restore();
  }
};
