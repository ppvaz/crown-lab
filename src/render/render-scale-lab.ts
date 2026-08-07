
export const LAB_RENDER_SCALE_MIN = 0.25;
export const LAB_RENDER_SCALE_MAX = 1;

export const labRenderScaleFromSearch = (search: string): number => {
  const raw = new URLSearchParams(search).get('renderScale');
  if (raw === null) return 1;
  const value = Number(raw.trim());
  if (!Number.isFinite(value)) return 1;
  if (value < LAB_RENDER_SCALE_MIN || value > LAB_RENDER_SCALE_MAX) return 1;
  return value;
};
