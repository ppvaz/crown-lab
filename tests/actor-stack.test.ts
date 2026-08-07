
import { describe, expect, it } from 'vitest';

import {
  attachment,
  attachmentOffset,
  compilePartOrder,
  composeActor,
  drawCommands,
} from '../src/render/actor-stack';
import type { ActorCommand } from '../src/render/actor-stack';

const AT = { x: 3, y: 2 };

const log = (): { seen: string[]; command: (slot: ActorCommand['slot'], label: string, bias?: number) => ActorCommand } => {
  const seen: string[] = [];
  return {
    seen,
    command: (slot, label, bias) => ({ slot, depthBias: bias, draw: () => seen.push(label) }),
  };
};

describe('composeActor', () => {
  it('executes the five slots in semantic order regardless of submission order', () => {
    const { seen, command } = log();
    composeActor(AT, [
      command('frontEffects', 'fe'),
      command('body', 'b'),
      command('rearEffects', 're'),
      command('frontAttachments', 'fa'),
      command('rearAttachments', 'ra'),
    ]).draw();
    expect(seen).toEqual(['re', 'ra', 'b', 'fa', 'fe']);
  });

  it('orders within a slot by local depth and keeps submission order on ties', () => {
    const { seen, command } = log();
    composeActor(AT, [
      command('rearEffects', 'far', -0.2),
      command('rearEffects', 'near', -0.05),
      command('rearEffects', 'first-tie'),
      command('rearEffects', 'second-tie'),
    ]).draw();
    expect(seen).toEqual(['far', 'near', 'first-tie', 'second-tie']);
  });

  it('contributes exactly one occupant, at the actor depth, never the attachment depth', () => {
    const composed = composeActor(AT, [
      attachment({ facing: 0, forward: 5, draw: () => undefined }),
    ]);
    expect(composed.depth).toBe(AT.x + AT.y);
  });

  it('runs a part-tagged command and a plain callback through the same ordering', () => {
    const { seen, command } = log();
    const part: ActorCommand = { slot: 'body', part: 'weapon', depthBias: 1, draw: () => seen.push('weapon') };
    composeActor(AT, [part, command('body', 'aura', 2), command('body', 'torso', 0)]).draw();
    expect(seen).toEqual(['torso', 'weapon', 'aura']);
  });
});

describe('attachment slot resolution', () => {
  const shield = (facing: number): ActorCommand =>
    attachment({ facing, forward: 0.45 + 0.24, draw: () => undefined });

  it('puts a forward anchor in front when the actor faces the camera', () => {
    expect(shield(0).slot).toBe('frontAttachments');
    expect(shield(Math.PI / 2).slot).toBe('frontAttachments');
  });

  it('puts the same anchor behind when the actor faces away — the shield bug, retired', () => {
    expect(shield(Math.PI).slot).toBe('rearAttachments');
    expect(shield(-Math.PI / 2).slot).toBe('rearAttachments');
  });

  it('resolves profile deterministically without a caller choosing a branch', () => {
    for (const facing of [Math.PI / 2, -Math.PI / 2, (3 * Math.PI) / 4, (-3 * Math.PI) / 4]) {
      expect(shield(facing).slot).toBe(shield(facing).slot);
      expect(['frontAttachments', 'rearAttachments']).toContain(shield(facing).slot);
    }
  });

  it('interleaves an attachment with the body by the order the slots imply', () => {
    const { seen, command } = log();
    const drawShield = (facing: number): string[] => {
      seen.length = 0;
      const cmd = attachment({ facing, forward: 0.69, draw: () => seen.push('shield') });
      drawCommands([command('body', 'body'), cmd]);
      return [...seen];
    };
    expect(drawShield(0)).toEqual(['body', 'shield']);
    expect(drawShield(Math.PI)).toEqual(['shield', 'body']);
  });

  it('offsets with the same rotation the sim vocabulary uses', () => {
    const offset = attachmentOffset(Math.PI / 2, 2, 1);
    expect(offset.x).toBeCloseTo(-1, 12);
    expect(offset.y).toBeCloseTo(2, 12);
  });
});

describe('native parts and attachments in one stack', () => {
  it('keeps slot order dominant over part rank, so an attachment lands outside every body part', () => {
    const { seen, command } = log();
    const weapon: ActorCommand = { slot: 'body', part: 'weapon', depthBias: 0, draw: () => seen.push('weapon') };
    const torso: ActorCommand = { slot: 'body', part: 'body', depthBias: 5, draw: () => seen.push('torso') };
    drawCommands([
      torso,
      attachment({ facing: Math.PI, forward: 0.69, draw: () => seen.push('rear-shield') }),
      weapon,
      command('frontEffects', 'glow'),
    ]);
    expect(seen).toEqual(['rear-shield', 'weapon', 'torso', 'glow']);
  });
});

describe('compilePartOrder', () => {
  const back = compilePartOrder(['weapon', 'shield', 'legTrail', 'legLead', 'body', 'head']);

  it('ranks the authored order and treats an untagged command as body', () => {
    expect(back('weapon')).toBeLessThan(back('body'));
    expect(back(undefined)).toBe(back('body'));
  });

  it('lands unknown parts after every listed one, as the models sort does', () => {
    const partial = compilePartOrder(['weapon', 'body']);
    expect(partial('head')).toBe(2);
    expect(partial('weapon')).toBe(0);
  });
});
