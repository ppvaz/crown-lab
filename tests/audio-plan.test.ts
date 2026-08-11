
import { describe, expect, it } from 'vitest';

import {
  cueSpecsFrom,
  formatPlan,
  planPack,
  presetFor,
  validatePrompt,
} from '../scripts/lib/audio-plan.mjs';
import { PACKS } from '../src/assets/audio/manifest.mjs';
import { ALL_CUES, CUES, ESSENTIAL_CUES } from '../src/render/soundbank';

const specs = cueSpecsFrom(CUES, ESSENTIAL_CUES as ReadonlySet<string>);

describe('the cue specs the plan is derived from', () => {
  it('covers every cue that takes a material layer, and no other', () => {
    const withMaterial = ALL_CUES.filter((c) => CUES[c].material !== null).sort();
    expect(Object.keys(specs).sort()).toEqual(withMaterial);
  });

  it('excludes telegraph and roar', () => {
    expect(specs.telegraph).toBeUndefined();
    expect(specs.roar).toBeUndefined();
  });

  it('carries the filename the soundbank spells out rather than the cue name', () => {
    for (const [cue, spec] of Object.entries(specs)) {
      expect(spec.file).toBe(CUES[cue as keyof typeof CUES].material);
    }
  });
});

describe('a prompt', () => {
  it('is refused for naming what it must not sound like', () => {
    const problems = validatePrompt('two bone blades cracking together, no anime ping');
    expect(problems.map((p) => p.kind)).toContain('negation');
    expect(problems.map((p) => p.kind)).toContain('tainted');
  });

  it('is refused for the unparryable cue’s version of the same mistake', () => {
    const problems = validatePrompt('a stone slab dropped flat, not a cartoon whoosh');
    expect(problems.some((p) => p.kind === 'negation')).toBe(true);
    expect(problems.some((p) => p.kind === 'tainted')).toBe(true);
  });

  it('passes when it describes object and material only', () => {
    expect(validatePrompt('an oak mallet on an oak block, close mic')).toEqual([]);
  });

  it('is refused for a word that arrives with its own artefact', () => {
    expect(validatePrompt('a gavel on a wooden block').map((p) => p.kind)).toEqual(['tainted']);
  });

  it('does not fire on a word that merely contains a marker', () => {
    expect(validatePrompt('another cannonade of stone on stone')).toEqual([]);
  });

  it('refuses an empty prompt rather than paying for silence', () => {
    expect(validatePrompt('   ').map((p) => p.kind)).toEqual(['empty']);
  });
});

describe('a preset', () => {
  it('gives an essential cue adherence over plausibility', () => {
    expect(presetFor(specs.parry).promptInfluence).toBeGreaterThan(
      presetFor(specs.hit).promptInfluence,
    );
    expect(presetFor(specs.parry).basis).toBe('essential');
  });

  it('gives a long cue plausibility over adherence', () => {
    expect(presetFor(specs.wave).basis).toBe('texture');
    expect(presetFor(specs.wave).promptInfluence).toBeLessThan(
      presetFor(specs.hit).promptInfluence,
    );
  });

  it('derives its length from the layers the sample plays under', () => {
    expect(presetFor(specs.death).durationSeconds).toBeCloseTo(0.7, 6);
  });

  it('clamps a short cue up to the endpoint’s floor', () => {
    expect(presetFor(specs.light).durationSeconds).toBe(0.5);
  });
});

describe('the hollow pack', () => {
  const plan = planPack(PACKS, 'hollow', specs);

  it('plans a runnable batch', () => {
    expect(plan.problems).toEqual([]);
    expect(plan.entries).toHaveLength(Object.keys(specs).length);
    expect(plan.totalSeconds).toBeGreaterThan(0);
  });

  it('writes every sample into its own pack directory', () => {
    for (const entry of plan.entries) {
      expect(entry.outPath).toBe(`src/assets/audio/hollow/${entry.file}`);
    }
  });

  it('keeps the derived value beside an authored override, with its reason', () => {
    const slowmo = plan.entries.find((e) => e.cue === 'slowmo');
    expect(slowmo?.durationSeconds).toBe(2.5);
    expect(slowmo?.derived.durationSeconds).toBe(0.8);
    expect(slowmo?.overrides.duration).toMatch(/texture/);
    expect(formatPlan(plan)).toContain('derived 0.8s');
  });
});

describe('a pack that would fall back to synthesis without saying so', () => {
  it('is refused for a cue it left out', () => {
    const thin = { hollow: { id: 'hollow', description: '', prompts: { light: 'a pole in air' } } };
    const plan = planPack(thin, 'hollow', specs);
    expect(plan.problems.some((p) => p.kind === 'missing-cue' && p.cue === 'parry')).toBe(true);
  });

  it('is refused for a cue that does not take a material layer', () => {
    const packs = {
      hollow: {
        id: 'hollow',
        description: '',
        prompts: { ...PACKS.hollow.prompts, telegraph: 'a low stone hum rising' },
      },
    };
    const plan = planPack(packs, 'hollow', specs);
    expect(plan.problems.some((p) => p.kind === 'unknown-cue' && p.cue === 'telegraph')).toBe(true);
  });

  it('is refused for an override with no reason', () => {
    const packs = {
      hollow: {
        id: 'hollow',
        description: '',
        prompts: { ...PACKS.hollow.prompts, hit: { prompt: 'a staff on bone plate', durationSeconds: 4 } },
      },
    };
    const plan = planPack(packs, 'hollow', specs);
    expect(plan.problems.some((p) => p.kind === 'unexplained-override' && p.cue === 'hit')).toBe(
      true,
    );
  });

  it('names a pack the manifest does not have', () => {
    expect(planPack(PACKS, 'brazen', specs).problems[0]?.kind).toBe('unknown-pack');
  });
});
