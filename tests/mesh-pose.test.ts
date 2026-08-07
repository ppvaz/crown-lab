
import { describe, expect, it } from 'vitest';

import { buildMeshBody } from '../src/render/mesh-body-lab';
import {
  blendPoses,
  createPose,
  createScratch,
  jointMatrices,
  samplePose,
} from '../src/render/mesh-pose-lab';
import { buildSkinnedFixture, multiply4, quatAbout } from './support/skinned-glb';

const posed = (
  mesh: ReturnType<typeof buildMeshBody>,
  clip: number | null,
  seconds: number,
): Float32Array => {
  const pose = createPose(mesh.skeleton);
  if (clip !== null) samplePose(pose, mesh.skeleton, mesh.clips[clip], seconds);
  const out = new Float32Array(mesh.skeleton.jointNode.length * 16);
  jointMatrices(out, mesh.skeleton, pose, createScratch(mesh.skeleton));
  return out;
};

const skin = (mesh: ReturnType<typeof buildMeshBody>, matrices: Float32Array, vertex: number) => {
  const out = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < 4; i++) {
    const weight = mesh.weight[vertex * 4 + i];
    if (weight === 0) continue;
    const m = mesh.joint[vertex * 4 + i] * 16;
    const p = vertex * 3;
    const x = mesh.pos[p];
    const y = mesh.pos[p + 1];
    const z = mesh.pos[p + 2];
    out.x += weight * (matrices[m] * x + matrices[m + 4] * y + matrices[m + 8] * z + matrices[m + 12]);
    out.y += weight * (matrices[m + 1] * x + matrices[m + 5] * y + matrices[m + 9] * z + matrices[m + 13]);
    out.z += weight * (matrices[m + 2] * x + matrices[m + 6] * y + matrices[m + 10] * z + matrices[m + 14]);
  }
  return out;
};

describe('the bind pose is the identity, which is what an inverse bind matrix means', () => {
  const mesh = buildMeshBody(buildSkinnedFixture().glb);

  it('resolves every joint to the identity with no clip applied', () => {
    const matrices = posed(mesh, null, 0);
    for (let joint = 0; joint < mesh.skeleton.jointNode.length; joint++) {
      for (let i = 0; i < 16; i++) {
        expect(matrices[joint * 16 + i]).toBeCloseTo(i % 5 === 0 ? 1 : 0, 5);
      }
    }
  });

  it('leaves every vertex exactly where the file put it', () => {
    const matrices = posed(mesh, null, 0);
    for (let vertex = 0; vertex < mesh.vertexCount; vertex++) {
      const skinned = skin(mesh, matrices, vertex);
      expect(skinned.x).toBeCloseTo(mesh.pos[vertex * 3], 5);
      expect(skinned.y).toBeCloseTo(mesh.pos[vertex * 3 + 1], 5);
      expect(skinned.z).toBeCloseTo(mesh.pos[vertex * 3 + 2], 5);
    }
  });

  it('keeps the armature scale, which a walk starting at the first bone would drop', () => {
    const scaled = buildMeshBody(buildSkinnedFixture({ armatureScale: 0.01 }).glb);
    const matrices = posed(scaled, 0, 1);
    const tip = skin(scaled, matrices, 2);
    expect(Math.hypot(tip.x, tip.y, tip.z)).toBeLessThan(4);
  });

  it('refuses a node carrying a baked matrix rather than decomposing one', () => {
    const { glb } = buildSkinnedFixture();
    const text = new TextDecoder().decode(new Uint8Array(glb, 20, 200));
    expect(text).toContain('Armature');
    expect(() => buildMeshBody(withNodeMatrix(glb))).toThrow(/matrix/);
  });
});

const withNodeMatrix = (glb: ArrayBuffer): ArrayBuffer => {
  const view = new DataView(glb);
  const jsonLength = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(glb, 20, jsonLength))) as
    { nodes: Record<string, unknown>[] };
  json.nodes[0] = { name: 'Armature', matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], children: [1, 3] };
  const bytes = new TextEncoder().encode(JSON.stringify(json));
  const padded = new Uint8Array(bytes.byteLength + ((4 - (bytes.byteLength % 4)) % 4));
  padded.fill(0x20);
  padded.set(bytes);
  const binHeaderAt = 20 + jsonLength;
  const binLength = view.getUint32(binHeaderAt, true);
  const bin = new Uint8Array(glb, binHeaderAt + 8, binLength);

  const total = 12 + 8 + padded.byteLength + 8 + binLength;
  const out = new ArrayBuffer(total);
  const outView = new DataView(out);
  const outBytes = new Uint8Array(out);
  outView.setUint32(0, 0x46546c67, true);
  outView.setUint32(4, 2, true);
  outView.setUint32(8, total, true);
  outView.setUint32(12, padded.byteLength, true);
  outView.setUint32(16, 0x4e4f534a, true);
  outBytes.set(padded, 20);
  outView.setUint32(20 + padded.byteLength, binLength, true);
  outView.setUint32(24 + padded.byteLength, 0x004e4942, true);
  outBytes.set(bin, 28 + padded.byteLength);
  return out;
};

describe('sampling a clip', () => {
  const mesh = buildMeshBody(buildSkinnedFixture({ clipRotation: Math.PI / 2 }).glb);

  it('is the bind pose at the first keyframe', () => {
    const matrices = posed(mesh, 0, 0);
    for (let i = 0; i < matrices.length; i++) {
      expect(matrices[i]).toBeCloseTo(i % 16 % 5 === 0 ? 1 : 0, 5);
    }
  });

  it('reaches the final keyframe exactly, and holds it past the end', () => {
    const atEnd = posed(mesh, 0, 1);
    const past = posed(mesh, 0, 9);
    expect([...past]).toEqual([...atEnd]);
  });

  it('interpolates between keyframes rather than snapping', () => {
    const start = skin(mesh, posed(mesh, 0, 0), 2);
    const half = skin(mesh, posed(mesh, 0, 0.5), 2);
    const end = skin(mesh, posed(mesh, 0, 1), 2);
    const spread = Math.hypot(end.x - start.x, end.y - start.y, end.z - start.z);
    expect(spread).toBeGreaterThan(0.1);
    expect(Math.hypot(half.x - start.x, half.y - start.y, half.z - start.z))
      .toBeGreaterThan(spread * 0.2);
    expect(Math.hypot(half.x - end.x, half.y - end.y, half.z - end.z))
      .toBeGreaterThan(spread * 0.2);
  });

  it('rotates a bone without shearing the vertices riding it', () => {
    const pairs: [number, number][] = [[0, 1], [2, 3]];
    const rest = posed(mesh, 0, 0);
    const restSpan = pairs.map(([a, b]) => {
      const va = skin(mesh, rest, a);
      const vb = skin(mesh, rest, b);
      return Math.hypot(va.x - vb.x, va.y - vb.y, va.z - vb.z);
    });
    for (const t of [0.25, 0.5, 0.75, 1]) {
      const matrices = posed(mesh, 0, t);
      pairs.forEach(([a, b], i) => {
        const va = skin(mesh, matrices, a);
        const vb = skin(mesh, matrices, b);
        expect(Math.hypot(va.x - vb.x, va.y - vb.y, va.z - vb.z)).toBeCloseTo(restSpan[i], 4);
      });
    }
  });

  it('moves the child bone away from the parent it is hinged on', () => {
    const rest = posed(mesh, 0, 0);
    const swung = posed(mesh, 0, 1);
    const restTip = skin(mesh, rest, 2);
    const swungTip = skin(mesh, swung, 2);
    expect(Math.hypot(swungTip.x - restTip.x, swungTip.y - restTip.y, swungTip.z - restTip.z))
      .toBeGreaterThan(0.5);
    const restRoot = skin(mesh, rest, 0);
    const swungRoot = skin(mesh, swung, 0);
    expect(swungRoot.x).toBeCloseTo(restRoot.x, 6);
    expect(swungRoot.y).toBeCloseTo(restRoot.y, 6);
    expect(swungRoot.z).toBeCloseTo(restRoot.z, 6);
  });

  it('holds a STEP track at its key instead of ramping toward the next', () => {
    const scaleTrack = mesh.clips[0].tracks.find((track) => track.path === 'scale');
    expect(scaleTrack?.step).toBe(true);
    expect(mesh.clips[0].tracks.find((track) => track.path === 'rotation')?.step).toBe(false);
  });
});

describe('cross-fading between two poses', () => {
  const mesh = buildMeshBody(buildSkinnedFixture({ clipRotation: Math.PI / 2 }).glb);

  it('is the endpoints exactly at 0 and 1', () => {
    const from = createPose(mesh.skeleton);
    samplePose(from, mesh.skeleton, mesh.clips[0], 0);
    const to = createPose(mesh.skeleton);
    samplePose(to, mesh.skeleton, mesh.clips[0], 1);

    const held = createPose(mesh.skeleton);
    samplePose(held, mesh.skeleton, mesh.clips[0], 0);
    blendPoses(held, to, 0);
    expect([...held.r]).toEqual([...from.r]);
    blendPoses(held, to, 1);
    expect([...held.r]).toEqual([...to.r]);
  });

  it('takes the shorter arc when the two quaternions have opposite signs', () => {
    const skeleton = mesh.skeleton;
    const node = skeleton.jointNode[0];
    const from = createPose(skeleton);
    const to = createPose(skeleton);
    const small = quatAbout([0, 0, 1], 0.1);
    from.r.set(small, node * 4);
    to.r.set(small.map((value) => -value), node * 4);
    blendPoses(from, to, 0.5);
    const dot = from.r[node * 4] * small[0] + from.r[node * 4 + 1] * small[1] +
      from.r[node * 4 + 2] * small[2] + from.r[node * 4 + 3] * small[3];
    expect(Math.abs(dot)).toBeCloseTo(1, 5);
  });

  it('keeps every blended quaternion a unit quaternion', () => {
    const from = createPose(mesh.skeleton);
    samplePose(from, mesh.skeleton, mesh.clips[0], 0);
    const to = createPose(mesh.skeleton);
    samplePose(to, mesh.skeleton, mesh.clips[0], 1);
    blendPoses(from, to, 0.37);
    for (let i = 0; i < from.r.length; i += 4) {
      expect(Math.hypot(from.r[i], from.r[i + 1], from.r[i + 2], from.r[i + 3])).toBeCloseTo(1, 5);
    }
  });
});

describe('the fixture itself', () => {
  it('states bind globals this file computed independently of the code under test', () => {
    const { bindGlobal } = buildSkinnedFixture({ armatureScale: 0.01 });
    expect(bindGlobal[0][12]).toBeCloseTo(0, 6);
    expect(bindGlobal[1][13]).toBeCloseTo(1, 6);
    expect(multiply4(bindGlobal[0], [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])[0])
      .toBeCloseTo(0.01, 6);
  });
});
