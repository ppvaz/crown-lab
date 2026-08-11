import { describe, expect, it } from 'vitest';

// @ts-expect-error — plain `.mjs` beside the pack it describes; see that file's header.
import { ROLE_ACTIONS } from '../assets-cast/manifest.mjs';
// @ts-expect-error — the planner is `.mjs` under `scripts/`, typed by `tsconfig.scripts.json`.
import { CONFIDENCE, RATES, expandAsk, formatBudget, planBudget } from '../scripts/lib/budget.mjs';
// @ts-expect-error — same.
import { CLIP_CREDITS, RIG_CREDITS } from '../scripts/lib/cast-plan.mjs';

const roles = Object.keys(ROLE_ACTIONS).length;
const context = { clipRoles: roles };

describe('an ask expands into the tasks that would actually be sent', () => {
  it('prices a body as one rig plus one clip per role the manifest declares', () => {
    const budget = planBudget({ body: 1 }, context);
    const meshy = budget.vendors.find((v: any) => v.vendor === 'meshy');
    expect(meshy.credits).toBe(RIG_CREDITS + roles * CLIP_CREDITS);
    expect(meshy.unpriced).toBe(0);
  });

  it('takes the role count from the caller, not from a number written here', () => {
    const seven = planBudget({ body: 1 }, { clipRoles: roles + 1 });
    const meshy = seven.vendors.find((v: any) => v.vendor === 'meshy');
    expect(meshy.credits).toBe(RIG_CREDITS + (roles + 1) * CLIP_CREDITS);
  });

  it('multiplies cues by rolls, because a kept take is never the first one', () => {
    const [entry] = expandAsk({ cue: 14, rolls: 3 }, context);
    expect(entry.count).toBe(42);
  });

  it('sends a cue to the provider that would actually generate it', () => {
    expect(expandAsk({ cue: 1 }, context)[0].task).toBe('elevenlabs.sample');
    expect(expandAsk({ cue: 1, provider: 'suno' }, context)[0].task).toBe('suno.sound');
  });
});

describe('an unpriced task is never absorbed into a total', () => {
  it('counts it beside the credits instead of adding zero to them', () => {
    const budget = planBudget({ body: 1, cue: 14 }, context);
    const meshy = budget.vendors.find((v: any) => v.vendor === 'meshy');
    const eleven = budget.vendors.find((v: any) => v.vendor === 'elevenlabs');
    expect(meshy.credits).toBe(RIG_CREDITS + roles * CLIP_CREDITS);
    expect(eleven.credits).toBe(0);
    expect(eleven.priced).toBe(0);
    expect(eleven.unpriced).toBe(14);
  });

  it('names every unpriced task in the printed report', () => {
    const printed = formatBudget(planBudget({ cue: 2, track: 1 }, context));
    expect(printed).toContain('elevenlabs.sample');
    expect(printed).toContain('suno.track');
    expect(printed).toContain('NOT in any total above');
  });

  it('says how each unpriced task would be priced, since two of them cost nothing to price', () => {
    for (const [task, rate] of Object.entries(RATES) as [string, any][]) {
      if (rate.credits === null) expect(rate.howToPrice, task).toBeTruthy();
    }
  });
});

describe('a rate carries how it is known, and a vendor line reports the weakest', () => {
  it('states a confidence this module recognises for every rate', () => {
    for (const [task, rate] of Object.entries(RATES) as [string, any][]) {
      expect(CONFIDENCE, task).toContain(rate.confidence);
      expect(rate.evidence, task).toBeTruthy();
    }
  });

  it('never claims a receipt for a figure read off a vendor page', () => {
    const budget = planBudget({ cue: 3, provider: 'suno' }, context);
    const suno = budget.vendors.find((v: any) => v.vendor === 'suno');
    expect(suno.confidence).toBe('advertised');
    expect(suno.usd).toBeCloseTo(0.03);
    expect(suno.credits).toBe(0);
  });

  it('prices only what a receipt covers', () => {
    const receipts = Object.entries(RATES).filter(([, r]: any) => r.credits !== null);
    expect(receipts.map(([task]) => task)).toEqual(['meshy.rig', 'meshy.clip', 'meshy.mesh']);
    for (const [task, rate] of receipts as [string, any][]) {
      expect(rate.confidence, task).toBe('receipt');
    }
  });
});
