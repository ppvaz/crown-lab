import { describe, expect, it } from 'vitest';

import { BODY_CLIP_ROLES } from '../src/render/mesh-clips-lab';
// @ts-expect-error — the vocabulary is `.mjs` under `scripts/`, typed by `tsconfig.scripts.json`.
import * as poses from '../scripts/lib/cast-poses.mjs';

const { AUTHORED_ROLES, CLIPS, JOINTS, POSES, blendPoses, resolveClip, resolvePose } = poses;

describe('the vocabulary answers the runtime', () => {
  it('authors a clip for every role a body can be asked to draw', () => {
    expect([...AUTHORED_ROLES].sort()).toEqual([...BODY_CLIP_ROLES].sort());
  });

  it('names no joint the vocabulary does not define', () => {
    const known = new Set(Object.keys(JOINTS));
    for (const [name, pose] of Object.entries(POSES)) {
      for (const joint of Object.keys(pose as object)) {
        expect(known, `${name} names ${joint}`).toContain(joint);
      }
    }
  });

  it('keeps every clip’s keys inside the clip and in order', () => {
    for (const [role, clip] of Object.entries(CLIPS) as [string, { keys: { at: number }[] }][]) {
      const ats = clip.keys.map((k) => k.at);
      expect(ats, `${role} is out of order`).toEqual([...ats].sort((a, b) => a - b));
      expect(Math.min(...ats), role).toBeGreaterThanOrEqual(0);
      expect(Math.max(...ats), role).toBeLessThanOrEqual(1);
    }
  });

  it('raises the free hand for power while leaving the sword arm low', () => {
    const hold = resolveClip(CLIPS.power).keys.at(-1).bones;
    expect(hold.LeftArm.swing).toBeGreaterThan(100);
    expect(hold.RightArm.swing).toBeLessThan(0);
  });

  it('puts a swing’s contact before its settle', () => {
    for (const [role, clip] of Object.entries(CLIPS) as [string, { phases?: { contact: number, settle: number } }][]) {
      if (clip.phases === undefined) continue;
      expect(clip.phases.contact, role).toBeLessThan(clip.phases.settle);
    }
  });
});

describe('a term means the same thing wherever it is written', () => {
  it('distributes a chain’s angle so the total is the angle asked for', () => {
    const { bones } = resolvePose({ spine: { swing: 30 } });
    const total = Object.values(bones).reduce((sum: number, terms: any) => sum + terms.swing, 0);
    expect(total).toBeCloseTo(30, 6);
    expect(Object.keys(bones)).toHaveLength(3);
  });

  it('mirrors spread and turn for a joint on the body’s right, and never swing', () => {
    const left = resolvePose({ armL: { spread: 20, swing: 20 } }).bones.LeftArm;
    const right = resolvePose({ armR: { spread: 20, swing: 20 } }).bones.RightArm;
    expect(right.spread).toBeCloseTo(-left.spread, 6);
    expect(right.swing).toBeCloseTo(left.swing, 6);
  });

  it('bends a knee the opposite way to an elbow, which is the whole reason for the alias', () => {
    const elbow = resolvePose({ elbowR: { bend: 40 } }).bones.RightForeArm.swing;
    const knee = resolvePose({ kneeR: { bend: 40 } }).bones.RightLeg.swing;
    expect(Math.sign(elbow)).toBe(-Math.sign(knee));
    expect(Math.abs(elbow)).toBeCloseTo(Math.abs(knee), 6);
  });

  it('refuses a joint or a term it does not have, rather than posing nothing', () => {
    expect(() => resolvePose({ tail: { swing: 10 } })).toThrow(/no joint named tail/);
    expect(() => resolvePose({ armL: { flap: 10 } })).toThrow(/no term flap/);
    expect(() => resolvePose({ spine: { lift: 0.1 } })).toThrow(/does not translate/);
  });

  it('sums poses rather than replacing them, so a stance colours a clip instead of erasing it', () => {
    const blended = blendPoses({ spine: { swing: 10 } }, { spine: { swing: 4, turn: 6 } });
    expect(blended).toEqual({ spine: { swing: 14, turn: 6 } });
  });
});

describe('an overlay carries the whole clip with it', () => {
  const clip = CLIPS.attackHeavy;

  it('scales every rotation by the amplitude', () => {
    const full = resolveClip(clip, {});
    const half = resolveClip(clip, { amplitude: 0.5 });
    const bone = Object.keys(full.keys[1].bones)[0];
    expect(half.keys[1].bones[bone].swing).toBeCloseTo(full.keys[1].bones[bone].swing * 0.5, 6);
  });

  it('moves the phases with the keys, because the phases drive the swing', () => {
    const beaten = resolveClip(clip, { beat: (at: number) => at ** 1.3 });
    expect(beaten.phases.contact).toBeCloseTo(clip.phases.contact ** 1.3, 3);
    expect(beaten.phases.contact).toBeLessThan(clip.phases.contact);
    expect(beaten.phases.contact).toBeLessThan(beaten.phases.settle);

    const contactKey = clip.keys.findIndex((k: { at: number }) => k.at === clip.phases.contact);
    expect(contactKey, 'the contact key and the contact phase must be the same moment')
      .toBeGreaterThanOrEqual(0);
    expect(beaten.keys[contactKey].at).toBeCloseTo(beaten.phases.contact, 3);
  });

  it('keeps a beaten clip’s keys ordered and inside the clip', () => {
    for (const power of [0.6, 1, 1.3, 2]) {
      const beaten = resolveClip(clip, { beat: (at: number) => at ** power });
      const ats = beaten.keys.map((k: { at: number }) => k.at);
      expect(ats, `power ${power}`).toEqual([...ats].sort((a, b) => a - b));
      expect(Math.max(...ats)).toBeLessThanOrEqual(1);
      expect(Math.min(...ats)).toBeGreaterThanOrEqual(0);
    }
  });

  it('leaves plant alone, because no stance decides which foot is carrying the body', () => {
    const walk = resolveClip(CLIPS.walk, { amplitude: 0.4, stance: { hips: { swing: 20 } } });
    expect(walk.keys[0].plant).toEqual(['L', 'R']);
    expect(walk.keys[1].plant).toEqual(['L']);
  });
});
