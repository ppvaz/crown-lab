
import { describe, expect, it } from 'vitest';

import { APOTHEOSIS_FULL, APOTHEOSIS_OFF } from '../src/render/apotheosis/config';
import {
  LAB_APOTHEOSIS_CYCLE,
  apotheosisProbe,
  nextLabApotheosis,
} from '../src/render/apotheosis/probe-lab';
import {
  LAB_RENDER_SCALE_MAX,
  LAB_RENDER_SCALE_MIN,
  labRenderScaleFromSearch,
} from '../src/render/render-scale-lab';

describe('an apotheosis probe', () => {
  it('turns on exactly the painter it names, and nothing else', () => {
    const post = apotheosisProbe('probe-post');
    expect(post).not.toBeNull();
    expect(post?.postProcessing).toBe(true);
    expect(post?.actorLighting).toBe(false);
    expect(post?.architecture).toBe(false);
    expect(post?.floorMaterial).toBe(false);
    expect(post?.combatFx).toBe(false);
  });

  it('combines parts, so an interaction can be measured as well as an isolate', () => {
    const both = apotheosisProbe('probe-light+post');
    expect(both?.actorLighting).toBe(true);
    expect(both?.postProcessing).toBe(true);
    expect(both?.architecture).toBe(false);
  });

  it('names itself, so the page can be checked against what was requested', () => {
    expect(apotheosisProbe('probe-arch+floor')?.tier).toBe('probe-arch+floor');
  });

  it('is not a probe when it names a part that does not exist', () => {
    expect(apotheosisProbe('probe-bloom')).toBeNull();
    expect(apotheosisProbe('probe-post+nonsense')).toBeNull();
    expect(apotheosisProbe('full')).toBeNull();
    expect(apotheosisProbe('')).toBeNull();
  });
});

describe('the lab cycle', () => {
  it('brackets every probe with the two anchors a reading is judged against', () => {
    expect(LAB_APOTHEOSIS_CYCLE[0]).toBe(APOTHEOSIS_OFF);
    expect(LAB_APOTHEOSIS_CYCLE[LAB_APOTHEOSIS_CYCLE.length - 1]).toBe(APOTHEOSIS_FULL);
  });

  it('isolates every painter the ablation needs before it combines any', () => {
    const tiers: string[] = LAB_APOTHEOSIS_CYCLE.map((config) => config.tier);
    for (const isolate of ['probe-arch', 'probe-floor', 'probe-light', 'probe-post']) {
      expect(tiers, `${isolate} must be reachable by touch`).toContain(isolate);
    }
    expect(tiers.indexOf('probe-light+post')).toBeGreaterThan(tiers.indexOf('probe-post'));
  });

  it('walks the whole list in both directions and returns to where it started', () => {
    let config = LAB_APOTHEOSIS_CYCLE[0];
    const seen = new Set<string>();
    for (let step = 0; step < LAB_APOTHEOSIS_CYCLE.length; step += 1) {
      seen.add(config.tier);
      config = nextLabApotheosis(config);
    }
    expect(seen.size).toBe(LAB_APOTHEOSIS_CYCLE.length);
    expect(config).toBe(LAB_APOTHEOSIS_CYCLE[0]);
    expect(nextLabApotheosis(LAB_APOTHEOSIS_CYCLE[0], -1)).toBe(APOTHEOSIS_FULL);
  });

  it('steps an unlisted tier back onto the list', () => {
    const unlisted = apotheosisProbe('probe-chrome');
    expect(unlisted).not.toBeNull();
    expect(nextLabApotheosis(unlisted as never)).toBe(LAB_APOTHEOSIS_CYCLE[0]);
  });
});

describe('the lab render scale', () => {
  it('leaves the shared density policy alone unless asked', () => {
    expect(labRenderScaleFromSearch('')).toBe(1);
    expect(labRenderScaleFromSearch('?apotheosis=full')).toBe(1);
  });

  it('takes the multiplier a measurement asks for', () => {
    expect(labRenderScaleFromSearch('?renderScale=0.7')).toBeCloseTo(0.7, 6);
    expect(labRenderScaleFromSearch('?renderScale=0.5')).toBeCloseTo(0.5, 6);
  });

  it('ignores anything it cannot compare against the readings beside it', () => {
    expect(labRenderScaleFromSearch('?renderScale=0.05')).toBe(1);
    expect(labRenderScaleFromSearch('?renderScale=2')).toBe(1);
    expect(labRenderScaleFromSearch('?renderScale=nonsense')).toBe(1);
    expect(labRenderScaleFromSearch(`?renderScale=${LAB_RENDER_SCALE_MIN}`)).toBe(
      LAB_RENDER_SCALE_MIN,
    );
    expect(labRenderScaleFromSearch(`?renderScale=${LAB_RENDER_SCALE_MAX}`)).toBe(
      LAB_RENDER_SCALE_MAX,
    );
  });
});
