
import { describe, expect, it } from 'vitest';

// @ts-expect-error — Node tooling is plain `.mjs`, checked by tsconfig.scripts.json.
import { planConcepts, PROVENANCE_FIELDS, validateConceptManifest } from '../scripts/lib/concept-plan.mjs';

const common = (kind: 'character' | 'prop' | 'room') => ({
  kind,
  title: `A ${kind}`,
  status: 'draft',
  brief: 'A compact, buildable reference whose panels explain behavior.',
  prompt: 'Exact recorded prompt for this generation.',
  output: `.crown-private/concept-art/${kind === 'character' ? 'cast' : kind === 'prop' ? 'props' : 'rooms'}/sample.png`,
  references: [{ path: '.crown-private/concept-art/references/style.png', role: 'shape language' }],
  sources: ['src/lab/source.ts'],
  panels: [{
    id: 'hero', order: 1, region: 'large left', state: 'neutral',
    description: 'The identity and resting silhouette.', cues: ['compact primitive body'],
    invariants: ['same proportions in every panel'],
  }],
  downstream: {
    pipeline: kind === 'character' ? 'cast' : kind,
    target: 'sample',
    handoff: `.crown-private/concept-art/handoffs/${kind}/sample.json`,
  },
  provenance: {
    service: 'unknown', modelVersion: 'unknown', generationId: 'unknown',
    generatedAt: 'unknown', licence: 'unknown', evidence: 'unknown',
  },
});

const fixture = () => ({
  version: 1,
  styleGuide: '.crown-private/concept-art/CHARACTER-REFERENCE.md',
  entries: {
    character: {
      ...common('character'),
      character: { behaviorSources: ['src/lab/enemies/first-blade.ts'] },
    },
    prop: {
      ...common('prop'),
      prop: {
        scaleOwner: 'the wielder hand and world units', attachment: 'right hand',
        runtimeRole: 'readable attack tool', requiredViews: ['front', 'side', 'in-hand'],
      },
    },
    room: {
      ...common('room'),
      room: {
        encounter: 'sample', standing: 'look-only', geometrySource: 'src/lab/rooms/sample.json',
        cameraContract: 'runtime projection, verified before measurement',
        layerIntent: ['playableFloor', 'solidProps', 'lighting'],
      },
    },
  },
});

const reasons = (manifest: any) => validateConceptManifest(manifest)
  .map((problem: any) => `${problem.id}.${problem.field}: ${problem.reason}`).join(' | ');

describe('the shared concept source handles all three asset families', () => {
  it('accepts complete character, prop, and room entries', () => {
    expect(validateConceptManifest(fixture())).toEqual([]);
    expect(planConcepts(fixture()).entries.map((entry: any) => entry.kind))
      .toEqual(['character', 'prop', 'room']);
  });

  it('requires every provenance answer, including honest unknowns', () => {
    const manifest: any = fixture();
    delete manifest.entries.character.provenance.licence;
    expect(reasons(manifest)).toMatch(/provenance\.licence.*mandatory/);
    expect(PROVENANCE_FIELDS).toContain('licence');
  });

  it('does not generate a new image from a reconstructed prompt', () => {
    const manifest: any = fixture();
    manifest.entries.character.prompt = 'unknown';
    expect(reasons(manifest)).toMatch(/cannot plan a new generation from unknown/);
    manifest.entries.character.status = 'approved';
    expect(reasons(manifest)).not.toMatch(/cannot plan a new generation from unknown/);
  });

  it('requires an authored state mapping rather than unlabeled thumbnails', () => {
    const manifest: any = fixture();
    manifest.entries.character.panels[0].state = '';
    expect(reasons(manifest)).toMatch(/panels\[0\]\.state/);
    manifest.entries.character.panels.push({ ...manifest.entries.character.panels[0], state: 'attack' });
    expect(reasons(manifest)).toMatch(/duplicates panel id.*duplicates reading order/);
  });

  it('refuses transient clipboard and capture references', () => {
    const manifest: any = fixture();
    manifest.entries.character.references[0].path = 'captures/cast/front.png';
    expect(reasons(manifest)).toMatch(/must be stable/);
  });

  it('requires build information unique to props and rooms', () => {
    const manifest: any = fixture();
    delete manifest.entries.prop.prop.scaleOwner;
    manifest.entries.room.room.standing = 'perspective-ish';
    expect(reasons(manifest)).toMatch(/prop\.scaleOwner.*room\.standing/);
  });

  it('keeps every output and handoff in the private tree', () => {
    const manifest: any = fixture();
    manifest.entries.room.output = 'src/assets/room.png';
    manifest.entries.room.downstream.handoff = 'src/render/room.json';
    expect(reasons(manifest)).toMatch(/explicit PNG under.*private concept handoff tree/);
  });
});

