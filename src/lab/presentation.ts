


export type HudLevel = 'full' | 'reduced' | 'minimal' | 'none';

const HUD_RANK: Record<HudLevel, number> = { none: 0, minimal: 1, reduced: 2, full: 3 };
const HUD_BY_RANK: HudLevel[] = ['none', 'minimal', 'reduced', 'full'];

export interface HudLayers {
  level: HudLevel;
  health: boolean;
  stamina: boolean;
  comboCounter: boolean;
  enemyHealth: boolean;
  damageNumbers: boolean;
  prompts: boolean;
  peripheral: boolean;
}

export interface VisualLayers {
  saturation: number;
  contrast: number;
  particleDensity: number;
  screenEffects: number;
  cameraEffects: number;
  floorGrid: boolean;
  telegraphs: boolean;
  facingMarks: boolean;
}

export type VignetteShape = 'circular' | 'eyelid' | 'irregular';

export interface VignetteLayer {
  amount: number;
  shape: VignetteShape;
  maxCoverage: number;
  feather: number;
  closeMs: number;
  openMs: number;
  breath: number;
  pulseWithTiming: boolean;
  rhythmRelief: number;
  threatWindows: boolean;
}

export interface MusicStems {
  strings: boolean;
  choir: boolean;
  organ: boolean;
  percussion: boolean;
}

export const MUSIC_STEM_KEYS: readonly (keyof MusicStems)[] = [
  'strings',
  'choir',
  'organ',
  'percussion',
];

export interface AudioLayers {
  density: number;
  essentialCues: boolean;
  material: boolean;
  transient: boolean;
  tonal: boolean;
  pitchVariation: boolean;
  stereo: boolean;
  music: boolean;
  stems: MusicStems;
}

export interface AccessibilityFloor {
  enabled: boolean;
  minSaturation: number;
  minContrast: number;
  minHud: HudLevel;
  preserveThreatColors: boolean;
  forceTelegraphs: boolean;
  forceFacingMarks: boolean;
  audioEquivalents: boolean;
  minParticleDensity: number;
  maxVignetteCoverage: number;
}

export interface PresentationConfig {
  id: string;
  description: string;
  hud: HudLayers;
  visual: VisualLayers;
  audio: AudioLayers;
  vignette: VignetteLayer;
  accessibility: AccessibilityFloor;
}

export interface ResolvedPresentation {
  id: string;
  hud: HudLayers;
  visual: VisualLayers;
  audio: AudioLayers;
  vignette: VignetteLayer;
  preserveThreatColors: boolean;
  audioEquivalents: boolean;
}


const atLeast = (a: number, b: number): number => (a < b ? b : a);

export const resolve = (cfg: PresentationConfig): ResolvedPresentation => {
  const a = cfg.accessibility;
  if (!a.enabled) {
    return {
      id: cfg.id,
      hud: { ...cfg.hud },
      visual: { ...cfg.visual },
      audio: { ...cfg.audio, stems: { ...cfg.audio.stems } },
      vignette: { ...cfg.vignette },
      preserveThreatColors: false,
      audioEquivalents: false,
    };
  }

  const level = HUD_BY_RANK[Math.max(HUD_RANK[cfg.hud.level], HUD_RANK[a.minHud])];
  const showAll = HUD_RANK[level] >= HUD_RANK[a.minHud] && HUD_RANK[a.minHud] > 0;

  return {
    id: cfg.id,
    hud: {
      ...cfg.hud,
      level,
      health: cfg.hud.health || showAll,
    },
    visual: {
      ...cfg.visual,
      saturation: atLeast(cfg.visual.saturation, a.minSaturation),
      contrast: atLeast(cfg.visual.contrast, a.minContrast),
      particleDensity: atLeast(cfg.visual.particleDensity, a.minParticleDensity),
      telegraphs: cfg.visual.telegraphs || a.forceTelegraphs,
      facingMarks: cfg.visual.facingMarks || a.forceFacingMarks,
    },
    audio: {
      ...cfg.audio,
      stems: { ...cfg.audio.stems },
      essentialCues: cfg.audio.essentialCues || a.audioEquivalents,
    },
    vignette: {
      ...cfg.vignette,
      maxCoverage: Math.min(cfg.vignette.maxCoverage, a.maxVignetteCoverage),
    },
    preserveThreatColors: a.preserveThreatColors,
    audioEquivalents: a.audioEquivalents,
  };
};


const FLOOR: AccessibilityFloor = {
  enabled: true,
  minSaturation: 0.25,
  minContrast: 0.85,
  minHud: 'minimal',
  preserveThreatColors: true,
  forceTelegraphs: true,
  forceFacingMarks: true,
  audioEquivalents: true,
  minParticleDensity: 0,
  maxVignetteCoverage: 0.55,
};

const VIGNETTE_OFF: VignetteLayer = {
  amount: 0,
  shape: 'circular',
  maxCoverage: 0.45,
  feather: 0.55,
  closeMs: 2600,
  openMs: 700,
  breath: 0.5,
  pulseWithTiming: true,
  rhythmRelief: 0.6,
  threatWindows: false,
};

const FULL: PresentationConfig = {
  id: 'Full',
  description: 'Everything on. The control condition for every subtraction experiment.',
  hud: {
    level: 'full',
    health: true,
    stamina: true,
    comboCounter: true,
    enemyHealth: true,
    damageNumbers: true,
    prompts: true,
    peripheral: true,
  },
  visual: {
    saturation: 1,
    contrast: 1,
    particleDensity: 1,
    screenEffects: 1,
    cameraEffects: 1,
    floorGrid: true,
    telegraphs: true,
    facingMarks: true,
  },
  audio: {
    density: 1,
    essentialCues: true,
    material: true,
    transient: true,
    tonal: true,
    pitchVariation: true,
    stereo: true,
    music: true,
    stems: { strings: true, choir: true, organ: true, percussion: true },
  },
  vignette: { ...VIGNETTE_OFF },
  accessibility: { ...FLOOR },
};

export const DEFAULT_PRESENTATION: ResolvedPresentation = {
  id: 'Full',
  hud: {
    level: 'full',
    health: true,
    stamina: true,
    comboCounter: true,
    enemyHealth: true,
    damageNumbers: true,
    prompts: true,
    peripheral: true,
  },
  visual: {
    saturation: 1,
    contrast: 1,
    particleDensity: 1,
    screenEffects: 1,
    cameraEffects: 1,
    floorGrid: true,
    telegraphs: true,
    facingMarks: true,
  },
  audio: {
    density: 1,
    essentialCues: true,
    material: true,
    transient: true,
    tonal: true,
    pitchVariation: true,
    stereo: true,
    music: true,
    stems: { strings: true, choir: true, organ: true, percussion: true },
  },
  vignette: {
    amount: 0,
    shape: 'circular',
    maxCoverage: 0.45,
    feather: 0.55,
    closeMs: 2600,
    openMs: 700,
    breath: 0.5,
    pulseWithTiming: true,
    rhythmRelief: 0.6,
    threatWindows: false,
  },
  preserveThreatColors: true,
  audioEquivalents: true,
};

const from = (
  id: string,
  description: string,
  mutate: (c: PresentationConfig) => void,
): PresentationConfig => {
  const c = structuredClone(FULL);
  c.id = id;
  c.description = description;
  mutate(c);
  return c;
};

const createPresentationPresets = (): Record<string, PresentationConfig> => ({
  Full: FULL,

  Hud_Reduced: from('Hud_Reduced', 'HUD only: drop the derived readouts, keep the vitals.', (c) => {
    c.hud.level = 'reduced';
    c.hud.comboCounter = false;
    c.hud.damageNumbers = false;
    c.hud.enemyHealth = false;
  }),

  Hud_None: from('Hud_None', 'HUD only: nothing but the fight. Does the player still know?', (c) => {
    c.hud.level = 'none';
    c.hud.health = false;
    c.hud.stamina = false;
    c.hud.comboCounter = false;
    c.hud.enemyHealth = false;
    c.hud.damageNumbers = false;
    c.hud.prompts = false;
    c.hud.peripheral = false;
  }),

  Color_Drained: from('Color_Drained', 'Colour only: near-greyscale world, threat colours intact.', (c) => {
    c.visual.saturation = 0.15;
    c.visual.contrast = 1.1;
  }),

  Effects_Quiet: from('Effects_Quiet', 'Effects only: no particles, flashes or shake.', (c) => {
    c.visual.particleDensity = 0;
    c.visual.screenEffects = 0;
    c.visual.cameraEffects = 0;
  }),

  Audio_Sparse: from('Audio_Sparse', 'Audio only: essential cues survive, everything else thins.', (c) => {
    c.audio.density = 0.15;
    c.audio.music = false;
  }),

  Audio_NoMaterial: from(
    'Audio_NoMaterial',
    'Drop the samples. Abstract, but meaning survives — does the fight still read?',
    (c) => {
      c.audio.material = false;
    },
  ),
  Audio_NoTonal: from(
    'Audio_NoTonal',
    'Drop the synthesis. Realistic and meaningless — the opposite failure to NoMaterial.',
    (c) => {
      c.audio.tonal = false;
    },
  ),
  Audio_Flat: from(
    'Audio_Flat',
    'No pitch variation or stereo. Tests how much of "feel" is variation rather than content.',
    (c) => {
      c.audio.pitchVariation = false;
      c.audio.stereo = false;
    },
  ),

  Music_Off: from('Music_Off', 'Music only. The canon\'s "combo 20 removes music", as a dial.', (c) => {
    c.audio.music = false;
  }),

  Vignette_FormA: from('Vignette_FormA', 'Vignette only, held closed: the circular form.', (c) => {
    c.vignette.amount = 0.85;
    c.vignette.shape = 'circular';
  }),
  Vignette_FormB: from('Vignette_FormB', 'Vignette only, held closed: the horizontal-eyelid form.', (c) => {
    c.vignette.amount = 0.85;
    c.vignette.shape = 'eyelid';
  }),
  Vignette_FormC: from('Vignette_FormC', 'Vignette only, held closed: the irregular-shadow form.', (c) => {
    c.vignette.amount = 0.85;
    c.vignette.shape = 'irregular';
  }),
  Vignette_ThreatWindows: from(
    'Vignette_ThreatWindows',
    'Vignette only: circular form with the falloff receding around peripheral threats.',
    (c) => {
      c.vignette.amount = 0.85;
      c.vignette.shape = 'circular';
      c.vignette.threatWindows = true;
    },
  ),

  Subtracted_All: from('Subtracted_All', 'Everything subtracted at once. NOT component evidence.', (c) => {
    c.hud.level = 'minimal';
    c.hud.comboCounter = false;
    c.hud.enemyHealth = false;
    c.hud.damageNumbers = false;
    c.hud.peripheral = false;
    c.hud.prompts = false;
    c.visual.saturation = 0.12;
    c.visual.particleDensity = 0.2;
    c.visual.screenEffects = 0.3;
    c.audio.density = 0.3;
    c.audio.music = false;
  }),

  Unclamped: from('Unclamped', 'Accessibility floor disabled. Measurement only, never a session.', (c) => {
    c.accessibility.enabled = false;
    c.hud.level = 'none';
    c.hud.health = false;
    c.hud.stamina = false;
    c.hud.comboCounter = false;
    c.hud.enemyHealth = false;
    c.hud.damageNumbers = false;
    c.hud.prompts = false;
    c.hud.peripheral = false;
    c.visual.saturation = 0;
    c.visual.telegraphs = false;
    c.visual.facingMarks = false;
    c.visual.particleDensity = 0;
    c.visual.screenEffects = 0;
    c.visual.cameraEffects = 0;
    c.audio.density = 0;
    c.audio.essentialCues = false;
    c.audio.material = false;
    c.audio.transient = false;
    c.audio.tonal = false;
    c.audio.pitchVariation = false;
    c.audio.stereo = false;
    c.audio.music = false;
  }),
});

export const PRESENTATION_PRESETS: Record<string, PresentationConfig> =
  /* @__PURE__ */ createPresentationPresets();

export const DEFAULT_PRESENTATION_ID = 'Full';

export const presentationIdFromSearch = (search: string): string | null => {
  const raw = new URLSearchParams(search).get('presentation')?.trim();
  return raw === undefined || raw === '' ? null : raw;
};


export { THREAT_KEYS, contrast, saturate, transformPalette } from '../render/palette';

