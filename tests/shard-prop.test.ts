import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildMeshBody } from '../src/render/mesh-body-lab';
import { bodyModelMatrix } from '../src/render/mesh-webgl-lab';
import { propModelMatrix } from '../src/render/prop-mesh-webgl-lab';

const bytes = readFileSync(resolve(__dirname, '../assets-cast/shard/shard.glb'));
const glb = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);

describe('the Regent’s shard, as the prop drawer will read it', () => {
  const mesh = buildMeshBody(glb);

  it('carries three fracture states as three joints', () => {
    const states = new Set<number>();
    for (const j of mesh.joint) states.add(j);
    expect([...states].sort()).toEqual([0, 1, 2]);
  });

  it('orders the states intact-first: each break has more vertices than the last', () => {
    const counts = [0, 0, 0];
    for (let i = 0; i < mesh.joint.length; i += 4) counts[mesh.joint[i]] += 1;
    expect(counts[0]).toBeGreaterThan(0);
    expect(counts[1]).toBeGreaterThan(counts[0]);
    expect(counts[2]).toBeGreaterThan(counts[1]);
  });

  it('binds every vertex wholly to one joint, so the state switch leaves no ghosts', () => {
    for (let i = 0; i < mesh.weight.length; i += 4) {
      expect(mesh.weight[i]).toBeCloseTo(1, 5);
      expect(mesh.weight[i + 1] + mesh.weight[i + 2] + mesh.weight[i + 3]).toBeCloseTo(0, 5);
    }
  });

  it('lies along glTF +X at unit length, the axis the drawer scales by', () => {
    let minX = Infinity;
    let maxX = -Infinity;
    for (let i = 0; i < mesh.pos.length; i += 3) {
      minX = Math.min(minX, mesh.pos[i]);
      maxX = Math.max(maxX, mesh.pos[i]);
    }
    expect(maxX - minX).toBeGreaterThan(0.95);
    expect(maxX - minX).toBeLessThan(1.2);
  });

  it('is flat-shaded on purpose, so the palette owns its colour', () => {
    expect(mesh.albedo).toBeNull();
  });

  it('has no clips, which is what makes it a prop and not a cast body', () => {
    expect(mesh.clips).toHaveLength(0);
  });

  it('is flat-shaded, so a facet break says solid at twenty pixels across', () => {
    expect(mesh.pos.length / 3).toBeGreaterThan(205);
  });
});

describe('the prop matrix, which is the body matrix plus the pitch a body never needs', () => {
  const apply = (m: Float32Array, v: readonly [number, number, number]) => ({
    x: m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12],
    y: m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13],
    z: m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14],
  });

  it('is exactly the body matrix when nothing is pitched', () => {
    for (const yaw of [0, 0.9, Math.PI, -2.1]) {
      const prop = propModelMatrix({ x: 2, y: -3 }, yaw, 0, 1.3, 0.25, 0);
      const body = bodyModelMatrix({ x: 2, y: -3 }, yaw, 0, 1.3, 0.25, 0);
      for (let i = 0; i < 16; i++) expect(prop[i]).toBeCloseTo(body[i], 6);
    }
  });

  it('tips the long axis out of the floor plane when pitched', () => {
    const m = propModelMatrix({ x: 0, y: 0 }, 0, Math.PI / 2, 1, 0, 0);
    const tip = apply(m, [1, 0, 0]);
    expect(tip.x).toBeCloseTo(0, 6);
    expect(tip.y).toBeCloseTo(0, 6);
    expect(tip.z).toBeCloseTo(-1, 6);
  });

  it('is a rotation and not a reflection, at every angle pair', () => {
    for (const [yaw, pitch] of [[0, 0], [0.7, 0.4], [Math.PI, -0.85], [-2.4, 0.85]]) {
      const s = 1.3;
      const m = propModelMatrix({ x: 3, y: -2 }, yaw, pitch, s, 0, 0);
      const det =
        m[0] * (m[5] * m[10] - m[9] * m[6]) -
        m[4] * (m[1] * m[10] - m[9] * m[2]) +
        m[8] * (m[1] * m[6] - m[5] * m[2]);
      expect(det).toBeCloseTo(s ** 3, 6);
    }
  });

  it('rides at the elevation it is given, whatever it is doing', () => {
    const m = propModelMatrix({ x: -1, y: 4 }, 1.2, 0.6, 1, 0, 1.05);
    expect(apply(m, [0, 0, 0]).z).toBeCloseTo(1.05, 6);
  });
});
