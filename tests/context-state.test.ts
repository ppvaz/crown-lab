
import { describe, expect, it } from 'vitest';

import {
  labCompositingFromSearch,
  neutralizeContextState,
} from '../src/render/context-state-lab';

const makeContext = (): CanvasRenderingContext2D => {
  const state = { filter: 'none', globalCompositeOperation: 'source-over', lineWidth: 1 };
  return state as unknown as CanvasRenderingContext2D;
};

describe('the compositing probe URL', () => {
  it('leaves the context alone unless a mode is named', () => {
    expect(labCompositingFromSearch('')).toBe('none');
    expect(labCompositingFromSearch('?apotheosis=full')).toBe('none');
    expect(labCompositingFromSearch('?labCompositing=nonsense')).toBe('none');
  });

  it('takes the three modes that split the hypothesis', () => {
    expect(labCompositingFromSearch('?labCompositing=plain')).toBe('plain');
    expect(labCompositingFromSearch('?labCompositing=nofilter')).toBe('nofilter');
    expect(labCompositingFromSearch('?labCompositing=NoComposite')).toBe('nocomposite');
  });
});

describe('neutralizing canvas state', () => {
  it('does nothing, and says it did nothing, when off', () => {
    const ctx = makeContext();
    expect(neutralizeContextState(ctx, 'none')).toBe(0);
    ctx.filter = 'blur(4px)';
    expect(ctx.filter).toBe('blur(4px)');
  });

  it('swallows both switches in plain, and keeps reporting the defaults', () => {
    const ctx = makeContext();
    expect(neutralizeContextState(ctx, 'plain')).toBe(2);
    ctx.filter = 'blur(9px)';
    ctx.globalCompositeOperation = 'soft-light';
    expect(ctx.filter).toBe('none');
    expect(ctx.globalCompositeOperation).toBe('source-over');
  });

  it('swallows only what its mode names', () => {
    const filters = makeContext();
    expect(neutralizeContextState(filters, 'nofilter')).toBe(1);
    filters.filter = 'blur(9px)';
    filters.globalCompositeOperation = 'screen';
    expect(filters.filter).toBe('none');
    expect(filters.globalCompositeOperation).toBe('screen');

    const composites = makeContext();
    expect(neutralizeContextState(composites, 'nocomposite')).toBe(1);
    composites.filter = 'blur(9px)';
    composites.globalCompositeOperation = 'screen';
    expect(composites.filter).toBe('blur(9px)');
    expect(composites.globalCompositeOperation).toBe('source-over');
  });

  it('leaves every other piece of context state alone', () => {
    const ctx = makeContext();
    neutralizeContextState(ctx, 'plain');
    ctx.lineWidth = 3;
    expect(ctx.lineWidth).toBe(3);
  });
});
