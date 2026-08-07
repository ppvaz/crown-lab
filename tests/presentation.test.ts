
import { PALETTE } from '../src/render/palette';
import type { PresentationConfig } from '../src/lab/presentation';
import {
  DEFAULT_PRESENTATION_ID,
  PRESENTATION_PRESETS,
  THREAT_KEYS,
  contrast,
  resolve,
  saturate,
  transformPalette,
} from '../src/lab/presentation';

const preset = (id: string): PresentationConfig => structuredClone(PRESENTATION_PRESETS[id]);

describe('colour transforms', () => {
  it('collapses to luminance at zero saturation and is identity at one', () => {
    expect(saturate('#c2444a', 1)).toBe('#c2444a');
    const grey = saturate('#c2444a', 0);
    const { r, g, b } = { r: parseInt(grey.slice(1, 3), 16), g: parseInt(grey.slice(3, 5), 16), b: parseInt(grey.slice(5, 7), 16) };
    expect(Math.abs(r - g)).toBeLessThanOrEqual(1);
    expect(Math.abs(g - b)).toBeLessThanOrEqual(1);
  });

  it('uses perceptual luma rather than a channel average', () => {
    const grey = saturate('#ff0000', 0);
    const r = parseInt(grey.slice(1, 3), 16);
    expect(r).toBeGreaterThan(40);
    expect(r).toBeLessThan(70);
  });

  it('pivots contrast around mid grey', () => {
    expect(contrast('#808080', 2)).toBe('#808080');
    expect(contrast('#ffffff', 1)).toBe('#ffffff');
  });
});

describe('the accessibility floor', () => {
  it('clamps saturation, contrast and particles up to the floor', () => {
    const cfg = preset('Subtracted_All');
    cfg.accessibility.minSaturation = 0.4;
    cfg.accessibility.minContrast = 1.0;
    cfg.accessibility.minParticleDensity = 0.5;

    const r = resolve(cfg);

    expect(r.visual.saturation).toBe(0.4);
    expect(r.visual.contrast).toBe(1.0);
    expect(r.visual.particleDensity).toBe(0.5);
  });

  it('never lowers a layer that was already above the floor', () => {
    const cfg = preset('Full');
    cfg.accessibility.minSaturation = 0.25;
    expect(resolve(cfg).visual.saturation).toBe(1);
  });

  it('forces telegraphs back on', () => {
    const cfg = preset('Full');
    cfg.visual.telegraphs = false;

    expect(resolve(cfg).visual.telegraphs).toBe(true);
  });

  it('restores a minimum HUD level and the health readout', () => {
    const cfg = preset('Hud_None');
    const r = resolve(cfg);

    expect(r.hud.level).toBe('minimal');
    expect(r.hud.health).toBe(true);
  });

  it('keeps the essential audio cues audible', () => {
    const cfg = preset('Full');
    cfg.audio.essentialCues = false;
    cfg.accessibility.audioEquivalents = true;

    expect(resolve(cfg).audio.essentialCues).toBe(true);
  });

  it('applies to every shipped preset except the one built to measure its cost', () => {
    for (const [id, cfg] of Object.entries(PRESENTATION_PRESETS)) {
      const r = resolve(structuredClone(cfg));
      if (id === 'Unclamped') {
        expect(r.visual.telegraphs).toBe(false);
        continue;
      }
      expect(r.visual.telegraphs, `${id} lost its telegraphs`).toBe(true);
      expect(r.visual.saturation, `${id} went below the saturation floor`).toBeGreaterThanOrEqual(
        cfg.accessibility.minSaturation,
      );
      expect(r.hud.health, `${id} hid the health readout`).toBe(true);
    }
  });

  it('can be disabled, and then subtracts without limit', () => {
    const r = resolve(preset('Unclamped'));
    expect(r.visual.saturation).toBe(0);
    expect(r.hud.level).toBe('none');
    expect(r.audio.essentialCues).toBe(false);
  });
});

describe('threat colours', () => {
  it('survive the saturation pass untouched', () => {
    const cfg = preset('Color_Drained');
    const r = resolve(cfg);
    const pal = transformPalette({ ...PALETTE }, r.visual, r.preserveThreatColors);

    for (const key of THREAT_KEYS) {
      expect(pal[key], `${key} was desaturated`).toBe(PALETTE[key]);
    }
  });

  it('still transform everything else', () => {
    const cfg = preset('Color_Drained');
    const r = resolve(cfg);
    const pal = transformPalette({ ...PALETTE }, r.visual, r.preserveThreatColors);

    expect(pal.duelist).not.toBe(PALETTE.duelist);
    expect(pal.archer).not.toBe(PALETTE.archer);
  });

  it('are transformed when the floor is off', () => {
    const r = resolve(preset('Unclamped'));
    const pal = transformPalette({ ...PALETTE }, r.visual, r.preserveThreatColors);
    expect(pal.telegraph).not.toBe(PALETTE.telegraph);
  });
});

describe('preset discipline', () => {
  it('starts from a control condition with nothing removed', () => {
    const full = PRESENTATION_PRESETS[DEFAULT_PRESENTATION_ID];
    expect(full.visual.saturation).toBe(1);
    expect(full.hud.level).toBe('full');
    expect(full.audio.density).toBe(1);
    expect(full.audio.material).toBe(true);
    expect(full.audio.tonal).toBe(true);
  });

  it('moves one family of layers per preset', () => {
    const base = PRESENTATION_PRESETS.Full;
    const families = (c: PresentationConfig) => ({
      hud: JSON.stringify(c.hud),
      visual: JSON.stringify(c.visual),
      audio: JSON.stringify(c.audio),
      vignette: JSON.stringify(c.vignette),
    });
    const control = families(base);

    const bundles = new Set(['Full', 'Subtracted_All', 'Unclamped']);
    for (const [id, cfg] of Object.entries(PRESENTATION_PRESETS)) {
      if (bundles.has(id)) continue;
      const f = families(cfg);
      const moved = (['hud', 'visual', 'audio', 'vignette'] as const).filter(
        (k) => f[k] !== control[k],
      );
      expect(moved.length, `${id} moved ${moved.join(' and ')}`).toBe(1);
    }
  });

  it('leaves the audio layers independently removable', () => {
    const noMaterial = resolve(preset('Audio_NoMaterial'));
    expect(noMaterial.audio.material).toBe(false);
    expect(noMaterial.audio.tonal).toBe(true);

    const noTonal = resolve(preset('Audio_NoTonal'));
    expect(noTonal.audio.material).toBe(true);
    expect(noTonal.audio.tonal).toBe(false);
  });
});
