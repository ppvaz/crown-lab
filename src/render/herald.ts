
import type { Vec2 } from '../sim/types';
import type { Palette } from './palette';
import {
  HERALD,
  HERALD_RADIUS,
  heraldHint,
  heraldSpeaker,
  type HeraldHintCopy,
  type HeraldOffer,
  type HeraldState,
} from '../game/herald';
import type { Camera } from './iso';
import { drawMessenger } from './messenger';
import { drawSpeakerLabel } from './speaker-label';
import { drawDialogue } from './dialogue';
import type { LayoutFrame } from './layout';

export const drawHerald = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  pal: Palette,
  timeMs: number,
): void => drawMessenger(ctx, cam, pal, timeMs, HERALD.at, HERALD_RADIUS, pal.garment);

export const drawHeraldLine = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  pal: Palette,
  frame: LayoutFrame,
  playerAt: Vec2,
  prompt: string | null,
): void => {
  if (prompt === null) return;
  drawSpeakerLabel(ctx, cam, pal, frame, {
    at: HERALD.at,
    name: HERALD.name,
    line: HERALD.line,
    prompt,
    ids: { name: 'herald.name', line: 'herald.line', prompt: 'herald.prompt' },
  });
};

export const drawHeraldDialogue = (
  ctx: CanvasRenderingContext2D,
  pal: Palette,
  frame: LayoutFrame,
  state: HeraldState,
  offers: readonly HeraldOffer[],
  controls: { move: string; interact: string },
  words: HeraldHintCopy,
): void => {
  const narration = frame.regions.narration;
  if (narration === undefined || offers.length === 0) return;
  ctx.save();
  drawDialogue(ctx, pal, frame, {
    id: 'herald.dialogue',
    region: narration,
    speaker: heraldSpeaker(state, offers),
    body: {
      kind: 'choices',
      labels: offers.map((offer) => offer.label),
      selected: Math.min(state.selected, offers.length - 1),
    },
    hint: heraldHint(offers, controls.move, controls.interact, words),
  });
  ctx.restore();
};

