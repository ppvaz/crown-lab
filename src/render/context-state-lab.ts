
export type LabCompositing = 'none' | 'plain' | 'nofilter' | 'nocomposite';

const MODES: readonly LabCompositing[] = ['none', 'plain', 'nofilter', 'nocomposite'];

export const labCompositingFromSearch = (search: string): LabCompositing => {
  const raw = new URLSearchParams(search).get('labCompositing')?.trim().toLowerCase() ?? '';
  return (MODES as readonly string[]).includes(raw) ? (raw as LabCompositing) : 'none';
};

export const neutralizeContextState = (
  ctx: CanvasRenderingContext2D,
  mode: LabCompositing,
): number => {
  if (mode === 'none') return 0;
  const shadowed: [keyof CanvasRenderingContext2D, string][] = [];
  if (mode === 'plain' || mode === 'nofilter') shadowed.push(['filter', 'none']);
  if (mode === 'plain' || mode === 'nocomposite') {
    shadowed.push(['globalCompositeOperation', 'source-over']);
  }
  for (const [property, value] of shadowed) {
    Object.defineProperty(ctx, property, {
      configurable: true,
      get: () => value,
      set: () => {},
    });
  }
  return shadowed.length;
};

export const restoreContextState = (ctx: CanvasRenderingContext2D): void => {
  for (const property of ['filter', 'globalCompositeOperation'] as const) {
    if (Object.prototype.hasOwnProperty.call(ctx, property)) {
      delete (ctx as unknown as Record<string, unknown>)[property];
    }
  }
};
