
export type ApotheosisTier =
  | 'off'
  | 'effects'
  | 'optimized_lv1'
  | 'optimized_lv2'
  | 'optimized_lv3'
  | 'full';

export interface ApotheosisConfig {
  readonly tier: ApotheosisTier;
  readonly architecture: boolean;
  readonly floorMaterial: boolean;
  readonly actorLighting: boolean;
  readonly combatFx: boolean;
  readonly postProcessing: boolean;
  readonly interfaceChrome: boolean;
  readonly cachedFloorDetail: boolean;
  readonly lowResBloomBlur: boolean;
  readonly cachedContactShadow: boolean;
}

const preset = (
  tier: ApotheosisTier,
  enabled: Partial<Omit<ApotheosisConfig, 'tier'>> = {},
): ApotheosisConfig =>
  Object.freeze({
    tier,
    architecture: false,
    floorMaterial: false,
    actorLighting: false,
    combatFx: false,
    postProcessing: false,
    interfaceChrome: false,
    cachedFloorDetail: false,
    lowResBloomBlur: false,
    cachedContactShadow: false,
    ...enabled,
  });

export const APOTHEOSIS_OFF = preset('off');

export const APOTHEOSIS_EFFECTS = preset('effects', {
  combatFx: true,
});

export const APOTHEOSIS_FULL = preset('full', {
  architecture: true,
  floorMaterial: true,
  actorLighting: true,
  combatFx: true,
  postProcessing: true,
  interfaceChrome: true,
});

export const APOTHEOSIS_OPTIMIZED_LV1 = preset('optimized_lv1', {
  architecture: true,
  floorMaterial: true,
  actorLighting: true,
  combatFx: true,
  postProcessing: true,
  interfaceChrome: true,
  cachedFloorDetail: true,
});

export const APOTHEOSIS_OPTIMIZED_LV2 = preset('optimized_lv2', {
  architecture: true,
  floorMaterial: true,
  actorLighting: true,
  combatFx: true,
  postProcessing: true,
  interfaceChrome: true,
  cachedFloorDetail: true,
  lowResBloomBlur: true,
});

export const APOTHEOSIS_OPTIMIZED_LV3 = preset('optimized_lv3', {
  architecture: true,
  floorMaterial: true,
  actorLighting: true,
  combatFx: true,
  postProcessing: true,
  interfaceChrome: true,
  cachedFloorDetail: true,
  lowResBloomBlur: true,
  cachedContactShadow: true,
});

export const APOTHEOSIS_BY_TIER: Readonly<Record<ApotheosisTier, ApotheosisConfig>> =
  Object.freeze({
    off: APOTHEOSIS_OFF,
    effects: APOTHEOSIS_EFFECTS,
    optimized_lv1: APOTHEOSIS_OPTIMIZED_LV1,
    optimized_lv2: APOTHEOSIS_OPTIMIZED_LV2,
    optimized_lv3: APOTHEOSIS_OPTIMIZED_LV3,
    full: APOTHEOSIS_FULL,
  });

export const apotheosisFromSearch = (search: string): ApotheosisConfig => {
  const params = new URLSearchParams(search);
  if (!params.has('apotheosis')) return APOTHEOSIS_OFF;
  const value = params.get('apotheosis')?.trim().toLowerCase() ?? '';
  if (value === '' || value === '1' || value === 'on' || value === 'true' || value === 'full') {
    return APOTHEOSIS_FULL;
  }
  if (value === 'effects') return APOTHEOSIS_EFFECTS;
  if (value === 'optimized_lv1' || value === 'optimized-lv1') return APOTHEOSIS_OPTIMIZED_LV1;
  if (value === 'optimized_lv2' || value === 'optimized-lv2') return APOTHEOSIS_OPTIMIZED_LV2;
  if (value === 'optimized_lv3' || value === 'optimized-lv3') return APOTHEOSIS_OPTIMIZED_LV3;
  return APOTHEOSIS_OFF;
};

const TIER_ORDER: readonly ApotheosisTier[] = [
  'off',
  'effects',
  'optimized_lv1',
  'optimized_lv2',
  'optimized_lv3',
  'full',
];

export const nextApotheosis = (
  current: ApotheosisConfig,
  direction = 1,
): ApotheosisConfig => {
  const index = TIER_ORDER.indexOf(current.tier);
  const next = (index + direction + TIER_ORDER.length) % TIER_ORDER.length;
  return APOTHEOSIS_BY_TIER[TIER_ORDER[next]];
};
