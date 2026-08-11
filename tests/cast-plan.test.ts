import { describe, expect, it } from 'vitest';

import { CAST_MESH_IDS } from '../src/render/cast-meshes-lab';
// @ts-expect-error — plain `.mjs` beside the pack it describes; see that file's header.
import { BODIES, ROLE_ACTIONS, UNKNOWN } from '../assets-cast/manifest.mjs';
// @ts-expect-error — the planner is `.mjs` under `scripts/`, typed by `tsconfig.scripts.json`.
import { PROVENANCE_FIELDS, planCast, validateCast } from '../scripts/lib/cast-plan.mjs';

describe('the manifest and the registry describe the same cast', () => {
  it('has an entry for every registered body', () => {
    const claimed = Object.values(BODIES).map((b: any) => b.castId).sort();
    expect(claimed).toEqual([...CAST_MESH_IDS].sort());
  });

  it('passes its own validator', () => {
    expect(validateCast(BODIES, CAST_MESH_IDS, ROLE_ACTIONS)).toEqual([]);
  });

  it('answers every provenance field, even where the answer is unknown', () => {
    for (const [name, body] of Object.entries(BODIES) as [string, any][]) {
      for (const field of PROVENANCE_FIELDS) {
        expect(body[field], `${name}.${field}`).toBeDefined();
      }
    }
  });
});

describe('a guessed provenance field is refused', () => {
  const withBody = (patch: object) => ({ ...BODIES, king: { ...(BODIES as any).king, ...patch } });
  const reasons = (bodies: object) =>
    validateCast(bodies, CAST_MESH_IDS, ROLE_ACTIONS).map((p: any) => p.reason).join(' | ');

  it('refuses a licence that reads as a conclusion rather than a citation', () => {
    expect(reasons(withBody({ licence: 'probably fine, we only ship a runtime-only bake' })))
      .toMatch(/conclusion, not a citation/);
    expect(reasons(withBody({ licence: 'CC-BY-4.0, read 2026-08-10' }))).not.toMatch(/conclusion/);
  });

  it('refuses a prompt that is really the brief written afterwards', () => {
    const king: any = (BODIES as any).king;
    expect(king.briefIsRecord, 'the five existing bodies have no recorded prompt').toBe(false);
    expect(reasons(withBody({ prompt: king.brief }))).toMatch(/guess wearing a fact/);
  });

  it('refuses a timestamp that is neither a date nor unknown', () => {
    expect(reasons(withBody({ generatedAt: 'that afternoon' }))).toMatch(/neither a timestamp/);
  });

  it('refuses a stated timestamp with nothing saying how it is known', () => {
    expect(reasons(withBody({ generatedAt: '2026-08-06T21:47:17', evidence: undefined })))
      .toMatch(/evidence does not say how it is known/);
  });

  it('refuses a castId the registry does not know', () => {
    expect(reasons(withBody({ castId: 'king' })))
      .toMatch(/not registered/);
  });

  it('leaves an honest unknown alone', () => {
    expect((BODIES as any).king.prompt).toBe(
      'none — image-to-3d used the recorded reference image',
    );
    expect((BODIES as any).king.prompt).not.toBe((BODIES as any).king.brief);
    for (const [name, body] of Object.entries(BODIES) as [string, any][]) {
      if (name === 'king') continue;
      if (body.prompt === UNKNOWN) continue;
      expect.unreachable('a body has acquired a prompt — update this test with how it is known');
    }
  });
});

describe('the plan says what a run would cost before it costs it', () => {
  it('prices a body at five credits for the rig plus three per clip', () => {
    const plan = planCast(BODIES, CAST_MESH_IDS, ROLE_ACTIONS, { only: ['guard'] });
    expect(plan.entries).toHaveLength(1);
    expect(plan.entries[0].credits).toBe(5 + Object.keys(ROLE_ACTIONS).length * 3);
    expect(plan.credits).toBe(plan.entries[0].credits);
  });

  it('narrows to the roles asked for', () => {
    const plan = planCast(BODIES, CAST_MESH_IDS, ROLE_ACTIONS, { only: ['guard'], roles: ['idle'] });
    expect(plan.entries[0].roles.map((r: any) => r.role)).toEqual(['idle']);
    expect(plan.entries[0].credits).toBe(8);
  });

  it('names a body that is not in the manifest instead of silently planning nothing', () => {
    const plan = planCast(BODIES, CAST_MESH_IDS, ROLE_ACTIONS, { only: ['pike_novice'] });
    expect(plan.problems.map((p: any) => p.reason).join(' ')).toMatch(/no such body/);
  });

  it('asks for no combat clip, because a scrubbed swing needs a known contact', () => {
    expect(Object.keys(ROLE_ACTIONS)).not.toContain('attackLight');
    expect(Object.keys(ROLE_ACTIONS)).not.toContain('attackHeavy');
    expect(Object.keys(ROLE_ACTIONS)).not.toContain('parry');
  });

  it('gives a body its own roles without leaking them to the rest of the cast', () => {
    const plan = planCast(BODIES, CAST_MESH_IDS, ROLE_ACTIONS, { only: ['glass_regent', 'guard'] });
    const roles = Object.fromEntries(plan.entries.map((e: any) => [e.body, e.roles.map((r: any) => r.role)]));
    expect(roles.glass_regent).toEqual(expect.arrayContaining(['attackLight', 'attackHeavy', 'roar', 'idle']));
    expect(roles.guard).not.toContain('attackLight');
    const regent = plan.entries.find((e: any) => e.body === 'glass_regent');
    expect(regent.credits).toBe(5 + regent.roles.length * 3);
  });

  it('holds a body’s own roles to the shared bar for action ids', () => {
    const bodies = {
      ...BODIES,
      glass_regent: {
        ...(BODIES as any).glass_regent,
        roleActions: { attackLight: { actionId: 'mage_soell_cast', action: 'mage_soell_cast' } },
      },
    };
    expect(validateCast(bodies, CAST_MESH_IDS, ROLE_ACTIONS).map((p: any) => p.reason).join(' '))
      .toMatch(/attackLight has no usable actionId/);
  });
});
