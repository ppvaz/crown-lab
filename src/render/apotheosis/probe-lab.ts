
import type { ApotheosisConfig, ApotheosisTier } from './config';
import {
  APOTHEOSIS_FULL,
  APOTHEOSIS_OFF,
  APOTHEOSIS_OPTIMIZED_LV3,
} from './config';

const PROBE_PARTS: Readonly<Record<string, keyof Omit<ApotheosisConfig, 'tier'>>> = {
  arch: 'architecture',
  floor: 'floorMaterial',
  light: 'actorLighting',
  fx: 'combatFx',
  post: 'postProcessing',
  chrome: 'interfaceChrome',
  opt1: 'cachedFloorDetail',
  opt2: 'lowResBloomBlur',
  opt3: 'cachedContactShadow',
};

const PROBE_PREFIX = 'probe-';

export const apotheosisProbe = (value: string): ApotheosisConfig | null => {
  if (!value.startsWith(PROBE_PREFIX)) return null;
  const parts = value.slice(PROBE_PREFIX.length).split('+');
  if (parts.length === 0 || parts.some((part) => PROBE_PARTS[part] === undefined)) return null;
  const enabled: Partial<Record<keyof Omit<ApotheosisConfig, 'tier'>, boolean>> = {};
  for (const part of parts) enabled[PROBE_PARTS[part]] = true;
  return Object.freeze({
    ...APOTHEOSIS_OFF,
    tier: value as ApotheosisTier,
    ...enabled,
  });
};

const ABLATION: readonly string[] = [
  'probe-arch',
  'probe-floor',
  'probe-light',
  'probe-post',
  'probe-arch+floor',
  'probe-light+post',
];

export const LAB_APOTHEOSIS_CYCLE: readonly ApotheosisConfig[] = Object.freeze([
  APOTHEOSIS_OFF,
  ...ABLATION.map((probe) => {
    const config = apotheosisProbe(probe);
    if (config === null) throw new Error(`unknown apotheosis probe: ${probe}`);
    return config;
  }),
  APOTHEOSIS_OPTIMIZED_LV3,
  APOTHEOSIS_FULL,
]);

export const nextLabApotheosis = (
  current: ApotheosisConfig,
  direction = 1,
): ApotheosisConfig => {
  const index = LAB_APOTHEOSIS_CYCLE.findIndex((config) => config.tier === current.tier);
  const length = LAB_APOTHEOSIS_CYCLE.length;
  if (index < 0) return LAB_APOTHEOSIS_CYCLE[direction >= 0 ? 0 : length - 1];
  return LAB_APOTHEOSIS_CYCLE[(index + direction + length) % length];
};
