
import { depthOf } from './iso';
import type { ModelView, ShapePart } from './models';
import type { Vec2 } from '../sim/types';

export type ActorView = ModelView;

export type ActorSlot =
  | 'rearEffects'
  | 'rearAttachments'
  | 'body'
  | 'frontAttachments'
  | 'frontEffects';

export const SLOT_ORDER: readonly ActorSlot[] = [
  'rearEffects',
  'rearAttachments',
  'body',
  'frontAttachments',
  'frontEffects',
];

export interface ActorCommand {
  slot: ActorSlot;
  depthBias?: number;
  part?: ShapePart;
  draw: () => void;
}

export interface ComposedActor {
  depth: number;
  draw: () => void;
}

export const attachmentOffset = (facing: number, forward: number, side = 0): Vec2 => ({
  x: Math.cos(facing) * forward - Math.sin(facing) * side,
  y: Math.sin(facing) * forward + Math.cos(facing) * side,
});

export const attachment = (opts: {
  facing: number;
  forward?: number;
  side?: number;
  part?: ShapePart;
  draw: () => void;
}): ActorCommand => {
  const bias = depthOf(attachmentOffset(opts.facing, opts.forward ?? 0, opts.side ?? 0));
  return {
    slot: bias >= 0 ? 'frontAttachments' : 'rearAttachments',
    depthBias: bias,
    part: opts.part,
    draw: opts.draw,
  };
};

export const compilePartOrder = (
  order: readonly ShapePart[],
): ((part: ShapePart | undefined) => number) => {
  return (part) => {
    const index = order.indexOf(part ?? 'body');
    return index < 0 ? order.length : index;
  };
};

export const drawCommands = (commands: readonly ActorCommand[]): void => {
  const ranked = commands.map((command, index) => ({ command, index }));
  ranked.sort((a, b) => {
    const slot = SLOT_ORDER.indexOf(a.command.slot) - SLOT_ORDER.indexOf(b.command.slot);
    if (slot !== 0) return slot;
    const bias = (a.command.depthBias ?? 0) - (b.command.depthBias ?? 0);
    if (bias !== 0) return bias;
    return a.index - b.index;
  });
  for (const { command } of ranked) command.draw();
};

export const composeActor = (actorAt: Vec2, commands: readonly ActorCommand[]): ComposedActor => ({
  depth: depthOf(actorAt),
  draw: () => drawCommands(commands),
});
