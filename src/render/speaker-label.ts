
import type { Vec2 } from '../sim/types';
import type { Palette } from './palette';
import type { Camera } from './iso';
import { worldToScreen } from './iso';
import type { LayoutFrame } from './layout';
import { drawFloatingLabel } from './text';
import type { UiElementId } from './ui-elements';

export interface SpeakerLabel {
  at: Vec2;
  name: string;
  line: string | null;
  prompt: string | null;
  ids: { name: UiElementId; line: UiElementId; prompt: UiElementId };
}

const LIFT = 84;

export const drawSpeakerLabel = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  pal: Palette,
  frame: LayoutFrame,
  speaker: SpeakerLabel,
): void => {
  const p = worldToScreen(cam, speaker.at);
  const z = cam.zoom;
  const type = frame.type;
  const y = p.y - LIFT * z;
  const box = frame.content;
  const row = (id: typeof speaker.ids.name, text: string, at: number): void =>
    drawFloatingLabel(ctx, id, text, box, p.x, at);

  ctx.save();
  ctx.textAlign = 'center';

  ctx.font = `${Math.max(type.base, type.base * z)}px ui-monospace, monospace`;
  ctx.fillStyle = pal.hudText;
  row(speaker.ids.name, speaker.name, y);

  if (speaker.line !== null) {
    ctx.font = `${Math.max(type.small, type.small * z)}px ui-monospace, monospace`;

    ctx.fillStyle = pal.playerAccent;
    row(speaker.ids.line, speaker.line, y + type.base * 1.3);
  }

  if (speaker.prompt !== null) {
    ctx.font = `${Math.max(type.base, type.base * z)}px ui-monospace, monospace`;
    ctx.fillStyle = pal.hudText;
    row(speaker.ids.prompt, speaker.prompt, y + type.base * 2.6);
  }
  ctx.restore();
};
