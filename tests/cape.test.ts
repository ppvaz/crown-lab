import { describe, expect, it } from 'vitest';

import { CAPE_SWAY, CAPE_SWAY_ORDER, driveCape, findCapeChain } from '../src/render/cape-lab';
import type { BodyPose } from '../src/render/mesh-pose-lab';
import type { BodySkeleton } from '../src/render/mesh-body-lab';

const skeleton = (names: string[]): BodySkeleton => ({
  names,
  parent: Int32Array.from(names.map((_, i) => i - 1)),
  order: Int32Array.from(names.map((_, i) => i)),
  restT: new Float32Array(names.length * 3),
  restR: Float32Array.from(names.flatMap(() => [0, 0, 0, 1])),
  restS: Float32Array.from(names.flatMap(() => [1, 1, 1])),
  jointNode: Int32Array.from(names.map((_, i) => i)),
  inverseBind: new Float32Array(names.length * 16),
} as BodySkeleton);

const RIG = skeleton(['Hips', 'Spine', 'Cape01', 'Cape02', 'Cape03']);
const BARE = skeleton(['Hips', 'Spine', 'LeftArm']);

const rest = (bones: number): BodyPose => ({
  t: new Float32Array(bones * 3),
  r: Float32Array.from(Array.from({ length: bones }, () => [0, 0, 0, 1]).flat()),
  s: Float32Array.from(Array.from({ length: bones }, () => [1, 1, 1]).flat()),
});

const RUNNING = { x: 3.2, y: 0 };

describe('the invariant the closed form exists to keep', () => {
  it('gives the same pose for the same tick, every time', () => {
    const a = rest(5);
    const b = rest(5);
    const chain = findCapeChain(RIG);
    driveCape(a, chain, 480, RUNNING, 0.7, CAPE_SWAY.full);
    driveCape(b, chain, 480, RUNNING, 0.7, CAPE_SWAY.full);
    expect([...a.r]).toEqual([...b.r]);
  });

  it('depends on the tick and nothing else that could drift', () => {
    const a = rest(5);
    const b = rest(5);
    const chain = findCapeChain(RIG);
    driveCape(a, chain, 0, null, 0, CAPE_SWAY.full);
    driveCape(b, chain, 51, null, 0, CAPE_SWAY.full);
    expect([...a.r]).not.toEqual([...b.r]);
  });
});

describe('what it does to a body', () => {
  const chain = findCapeChain(RIG);

  it('finds the chain by name, collar first', () => {
    expect(chain.nodes).toEqual([2, 3, 4]);
  });

  it('is a no-op on a body with no cloak, which is most of the cast', () => {
    const pose = rest(3);
    const before = [...pose.r];
    driveCape(pose, findCapeChain(BARE), 100, RUNNING, 0, CAPE_SWAY.full);
    expect([...pose.r]).toEqual(before);
  });

  it('leaves the pose untouched at zero sway, so `off` is the rigid arm exactly', () => {
    const pose = rest(5);
    const before = [...pose.r];
    driveCape(pose, chain, 100, RUNNING, 0, CAPE_SWAY.off);
    expect([...pose.r]).toEqual(before);
  });

  it('touches only the cape, never a bone a clip drives', () => {
    const pose = rest(5);
    driveCape(pose, chain, 100, RUNNING, 0, CAPE_SWAY.full);
    expect([...pose.r].slice(0, 8)).toEqual([0, 0, 0, 1, 0, 0, 0, 1]);
  });

  it('lags the hem more than the collar, which is the only thing standing in for cloth', () => {
    const pose = rest(5);
    driveCape(pose, chain, 0, RUNNING, 0, CAPE_SWAY.full);
    const angle = (node: number) => 2 * Math.acos(Math.min(1, Math.abs(pose.r[node * 4 + 3])));
    expect(angle(2)).toBeLessThan(angle(3));
    expect(angle(3)).toBeLessThan(angle(4));
  });

  it('trails harder the faster the body travels', () => {
    const slow = rest(5);
    const fast = rest(5);
    driveCape(slow, chain, 0, { x: 0.8, y: 0 }, 0, CAPE_SWAY.full);
    driveCape(fast, chain, 0, RUNNING, 0, CAPE_SWAY.full);
    const hem = (p: BodyPose) => 2 * Math.acos(Math.min(1, Math.abs(p.r[4 * 4 + 3])));
    expect(hem(slow)).toBeLessThan(hem(fast));
  });

  it('answers the body’s own heading, not the world’s', () => {
    const ahead = rest(5);
    const across = rest(5);
    driveCape(ahead, chain, 0, RUNNING, 0, CAPE_SWAY.full);
    driveCape(across, chain, 0, RUNNING, Math.PI / 2, CAPE_SWAY.full);
    expect([...ahead.r]).not.toEqual([...across.r]);
  });

  it('scales between its arms rather than switching between two looks', () => {
    const subtle = rest(5);
    const full = rest(5);
    driveCape(subtle, chain, 0, RUNNING, 0, CAPE_SWAY.subtle);
    driveCape(full, chain, 0, RUNNING, 0, CAPE_SWAY.full);
    const hem = (p: BodyPose) => 2 * Math.acos(Math.min(1, Math.abs(p.r[4 * 4 + 3])));
    expect(hem(subtle)).toBeGreaterThan(0);
    expect(hem(subtle)).toBeLessThan(hem(full));
  });

  it('starts the dial at the arm the archive was taken against', () => {
    expect(CAPE_SWAY_ORDER[0]).toBe('off');
    expect(CAPE_SWAY.off).toBe(0);
  });
});
