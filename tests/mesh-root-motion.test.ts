import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildMeshBodyFromCmb } from '../src/render/mesh-body-lab';
import {
  createPose, createScratch, jointMatrices, pinRootMotion, rootJoint, samplePose,
} from '../src/render/mesh-pose-lab';

const body = (name: string) => {
  const bytes = readFileSync(resolve(__dirname, `../assets-cast/${name}/${name}.cmb`));
  return buildMeshBodyFromCmb(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
  );
};

const travel = (mesh: ReturnType<typeof body>, clipIndex: number, pin: boolean) => {
  const pose = createPose(mesh.skeleton);
  const scratch = createScratch(mesh.skeleton);
  const matrices = new Float32Array(mesh.skeleton.jointNode.length * 16);
  const root = rootJoint(mesh.skeleton);
  const clip = mesh.clips[clipIndex];
  let start: { x: number; z: number } | null = null;
  let peak = 0;
  let end = 0;
  for (let i = 0; i <= 20; i++) {
    samplePose(pose, mesh.skeleton, clip, (i / 20) * clip.durationSec);
    if (pin) pinRootMotion(pose, mesh.skeleton, root);
    jointMatrices(matrices, mesh.skeleton, pose, scratch);
    const at = { x: scratch.global[root * 16 + 12], z: scratch.global[root * 16 + 14] };
    start ??= at;
    end = Math.hypot(at.x - start.x, at.z - start.z);
    peak = Math.max(peak, end);
  }
  return { peak, end };
};

describe('root motion is held, so the drawn body is where the hitbox is', () => {
  const mesh = body('glass_regent');
  const clipIndex = (name: string) => {
    const at = mesh.clips.findIndex((clip) => clip.name === name);
    expect(at, `the pack has a ${name} clip`).toBeGreaterThanOrEqual(0);
    return at;
  };

  it('reproduces the defect: the stagger walks the body away and leaves it there', () => {
    const loose = travel(mesh, clipIndex('stagger'), false);
    expect(loose.peak).toBeGreaterThan(1);
    expect(loose.end).toBeGreaterThan(1);
  });

  it('holds every clip within a step of where it started', () => {
    for (const [index, clip] of mesh.clips.entries()) {
      const held = travel(mesh, index, true);
      expect(held.peak, `${clip.name} peak`).toBeLessThan(0.25);
      expect(held.end, `${clip.name} end`).toBeLessThan(0.25);
    }
  });

  it('leaves the vertical alone, so a crouch still crouches', () => {
    const pose = createPose(mesh.skeleton);
    const root = rootJoint(mesh.skeleton);
    const stagger = mesh.clips[clipIndex('stagger')];
    let moved = 0;
    for (let i = 0; i <= 20; i++) {
      samplePose(pose, mesh.skeleton, stagger, (i / 20) * stagger.durationSec);
      pinRootMotion(pose, mesh.skeleton, root);
      moved = Math.max(moved, Math.abs(pose.t[root * 3 + 1] - mesh.skeleton.restT[root * 3 + 1]));
    }
    expect(moved).toBeGreaterThan(0.01);
  });

  it('finds the root by shape rather than by name', () => {
    const root = rootJoint(mesh.skeleton);
    const joints = new Set(mesh.skeleton.jointNode);
    expect(joints.has(root)).toBe(true);
    expect(joints.has(mesh.skeleton.parent[root])).toBe(false);
  });
});
