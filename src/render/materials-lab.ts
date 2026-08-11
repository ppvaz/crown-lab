
import {
  ARCANE_SAMPLES,
  FORGED_SAMPLES_LAB,
  HOLLOW_SAMPLES,
  TEMPERED_SAMPLES,
} from './asset-registry-lab';
import { EMPTY_MATERIAL_PACK, packUrlsFrom } from './soundbank';
import type { MaterialPack } from './soundbank';

const FORGED_MATERIAL: MaterialPack = {
  id: 'forged',
  description: 'Steel, leather, bell and body.',
  urls: packUrlsFrom(FORGED_SAMPLES_LAB),
};

export const DEFAULT_MATERIAL: MaterialPack = {
  id: 'tempered',
  description: 'Steel, iron, oak and stone, close and loud. The pack with the punch in it.',
  urls: packUrlsFrom(TEMPERED_SAMPLES),
};

export const MATERIAL_PACKS: Record<string, MaterialPack> = {
  none: EMPTY_MATERIAL_PACK,
  forged: FORGED_MATERIAL,
  arcane: {
    id: 'arcane',
    description: 'Synthetic material. The wrong-theme control — does the fantasy survive it?',
    urls: packUrlsFrom(ARCANE_SAMPLES),
  },
  hollow: {
    id: 'hollow',
    description: 'Bone, oak, stone and grit. The world with no ring in it — is the fight still read?',
    urls: packUrlsFrom(HOLLOW_SAMPLES),
  },
  tempered: DEFAULT_MATERIAL,
};
