
import { ARCANE_SAMPLES, FORGED_SAMPLES_LAB } from './asset-registry-lab';
import { EMPTY_MATERIAL_PACK, packUrlsFrom } from './soundbank';
import type { MaterialPack } from './soundbank';

export const DEFAULT_MATERIAL: MaterialPack = {
  id: 'forged',
  description: 'Steel, leather, bell and body.',
  urls: packUrlsFrom(FORGED_SAMPLES_LAB),
};

export const MATERIAL_PACKS: Record<string, MaterialPack> = {
  none: EMPTY_MATERIAL_PACK,
  forged: DEFAULT_MATERIAL,
  arcane: {
    id: 'arcane',
    description: 'Synthetic material. The wrong-theme control — does the fantasy survive it?',
    urls: packUrlsFrom(ARCANE_SAMPLES),
  },
};
