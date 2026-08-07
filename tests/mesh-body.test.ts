
import { describe, expect, it } from 'vitest';

import { buildMeshBody } from '../src/render/mesh-body-lab';
import { bodyModelMatrix } from '../src/render/mesh-webgl-lab';
import { measureForwardFacing } from '../src/render/mesh-pose-lab';
import { CAST_MESHES, CAST_MESH_IDS, bodyScale, heightUnits, modelTopUnits } from '../src/render/cast-meshes-lab';
import { buildSkinnedFixture } from './support/skinned-glb';

const mesh = buildMeshBody(buildSkinnedFixture().glb);

const MEASURED = measureForwardFacing(mesh);
const FORWARD = MEASURED.facing;
const FORWARD_GLTF: readonly [number, number, number] = MEASURED.gltf;

describe('the coordinate map, which the loader deliberately does not apply', () => {
  it('leaves geometry and normals in the file\'s own space', () => {
    for (let v = 0; v < mesh.vertexCount; v++) {
      expect(mesh.nrm[v * 3]).toBeCloseTo(0, 6);
      expect(mesh.nrm[v * 3 + 1]).toBeCloseTo(0, 6);
      expect(mesh.nrm[v * 3 + 2]).toBeCloseTo(1, 6);
    }
    const top = Math.max(...Array.from({ length: mesh.vertexCount }, (_, v) => mesh.pos[v * 3 + 1]));
    expect(top).toBeCloseTo(2, 6);
  });

  it('leaves the triangle order alone', () => {
    expect([...mesh.index]).toEqual([0, 1, 2, 2, 1, 3]);
  });
});

const apply = (m: Float32Array, v: readonly [number, number, number]) => ({
  x: m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12],
  y: m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13],
  z: m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14],
});

describe('the model matrix, which is where the axis change lives', () => {
  const SCALE = 1.3;

  it('stands the model up: glTF +Y becomes the runtime\'s elevation', () => {
    const m = bodyModelMatrix({ x: 0, y: 0 }, FORWARD, 0, SCALE, 0);
    const head = apply(m, [0, 1, 0]);
    expect(head.x).toBeCloseTo(0, 6);
    expect(head.y).toBeCloseTo(0, 6);
    expect(head.z).toBeCloseTo(SCALE, 6);
  });

  it('is a rotation and not a reflection, so winding survives untouched', () => {
    for (const facing of [0, 0.7, Math.PI, -2.4]) {
      const m = bodyModelMatrix({ x: 3, y: -2 }, FORWARD, facing, SCALE, 0);
      const det =
        m[0] * (m[5] * m[10] - m[9] * m[6]) -
        m[4] * (m[1] * m[10] - m[9] * m[2]) +
        m[8] * (m[1] * m[6] - m[5] * m[2]);
      expect(det).toBeCloseTo(SCALE ** 3, 6);
    }
  });

  it('points the model where the simulation says the king is facing', () => {
    const forward = FORWARD_GLTF;
    const at = { x: 0, y: 0 };
    const nose = apply(bodyModelMatrix(at, 0, FORWARD, 1, 0), forward);
    expect(nose.x).toBeCloseTo(1, 6);
    expect(nose.y).toBeCloseTo(0, 6);
    expect(nose.z).toBeCloseTo(0, 6);

    const quarter = apply(bodyModelMatrix(at, Math.PI / 2, FORWARD, 1, 0), forward);
    expect(quarter.x).toBeCloseTo(0, 6);
    expect(quarter.y).toBeCloseTo(1, 6);

    for (const facing of [0.3, 1.9, -2.7, Math.PI]) {
      const p = apply(bodyModelMatrix(at, facing, FORWARD, 1, 0), forward);
      expect(p.x).toBeCloseTo(Math.cos(facing), 6);
      expect(p.y).toBeCloseTo(Math.sin(facing), 6);
    }
  });

  it('keeps the model\'s left on the runtime\'s left', () => {
    const left = apply(bodyModelMatrix({ x: 0, y: 0 }, FORWARD, 0, 1, 0), [1, 0, 0]);
    expect(left.x).toBeCloseTo(0, 6);
    expect(left.y).toBeCloseTo(1, 6);
  });

  it('puts the soles on the floor, wherever the generator put the origin', () => {
    const sunk = bodyModelMatrix({ x: 0, y: 0 }, FORWARD, 0, SCALE, 0.4);
    expect(apply(sunk, [0, 0.4, 0]).z).toBeCloseTo(0, 6);
  });

  it('stands him at the position the simulation gives, on the floor', () => {
    const m = bodyModelMatrix({ x: -4.25, y: 1.5 }, FORWARD, 1.1, SCALE, 0);
    const feet = apply(m, [0, 0, 0]);
    expect(feet.x).toBeCloseTo(-4.25, 6);
    expect(feet.y).toBeCloseTo(1.5, 6);
    expect(feet.z).toBeCloseTo(0, 6);
  });
});

describe('the bind measurements the renderer scales by', () => {
  it('reports the height and the sole from the geometry, not from a constant', () => {
    expect(mesh.bindHeight).toBeCloseTo(2, 6);
    expect(mesh.bindFoot).toBeCloseTo(0, 6);
  });

  it('takes its height from the primitive it replaces', () => {
    expect(heightUnits(CAST_MESHES.player)).toBeCloseTo(66 / 30, 6);
    expect(CAST_MESHES.player.heightPx).toBe(66);
    expect(CAST_MESHES.guard.heightPx).not.toBe(CAST_MESHES.player.heightPx);
  });

  it('scales a body by its own crown, so a halberd does not shrink the man holding it', () => {
    const bare = { ...CAST_MESHES.player, bodyTopFraction: undefined };
    expect(bodyScale(bare, 2)).toBeCloseTo(heightUnits(bare) / 2, 6);
    expect(modelTopUnits(bare)).toBeCloseTo(heightUnits(bare), 6);

    const geared = { ...CAST_MESHES.player, bodyTopFraction: 0.75 };
    const scale = bodyScale(geared, 2);
    expect(2 * 0.75 * scale).toBeCloseTo(heightUnits(geared), 6);
    expect(modelTopUnits(geared)).toBeCloseTo(heightUnits(geared) / 0.75, 6);
  });

  it('asks for the fraction only where the body is not the tallest thing in the file', () => {
    expect(CAST_MESHES.player.bodyTopFraction).toBeUndefined();
    expect(CAST_MESHES.guard.bodyTopFraction).toBeLessThan(1);
    expect(CAST_MESHES.guard.bodyTopFraction).toBeGreaterThan(0.5);
  });

  it('gives the guard no sockets, because his halberd is in the mesh', () => {
    expect(CAST_MESHES.guard.sockets).toBeUndefined();
  });

  it('keeps the id list and the registry in step', () => {
    expect([...CAST_MESH_IDS].sort()).toEqual(Object.keys(CAST_MESHES).sort());
    for (const id of CAST_MESH_IDS) {
      expect(CAST_MESHES[id].id).toBe(id);
    }


    const routes = CAST_MESH_IDS.map((id) => CAST_MESHES[id].glb);
    expect(new Set(routes).size).toBe(routes.length);
    for (const route of routes) {
      expect(route).toMatch(/^\/assets-cast\/([a-z][a-z0-9_-]*)\/\1\.cmb$/);
    }
  });

  it('leaves the king the only body that runs', () => {
    expect(CAST_MESHES.player.clipNames?.run).toBeUndefined();
    for (const id of CAST_MESH_IDS.filter((i) => i !== 'player')) {
      expect(CAST_MESHES[id].clipNames?.run).toEqual(['walking']);
    }
  });

  it('leaves the forward axis to the measurement', () => {
    for (const spec of Object.values(CAST_MESHES)) {
      expect(spec.forwardFacing).toBeUndefined();
    }
  });

  it('says what it measured the forward axis from, and never guesses in silence', () => {
    expect(MEASURED.evidence).toMatch(/landmark|marker|foot|torso/);
    expect(MEASURED.dissent).toEqual([]);
  });
});

describe('the skin', () => {
  it('reads a joint list that is not topologically sorted', () => {
    const { skeleton } = mesh;
    const position = new Map<number, number>();
    skeleton.order.forEach((node, i) => position.set(node, i));
    for (const node of skeleton.order) {
      const parent = skeleton.parent[node];
      if (parent === -1) continue;
      expect(position.get(parent)!).toBeLessThan(position.get(node)!);
    }
  });

  it('includes the armature above the joints, which carries the scale', () => {
    expect(mesh.skeleton.order.length).toBe(3);
    expect([...mesh.skeleton.order].map((node) => mesh.skeleton.names[node])).toContain('Armature');
  });

  it('renormalises weights, so a vertex cannot gain or lose mass', () => {
    const raw = buildMeshBody(buildSkinnedFixture({ rawWeights: true }).glb);
    for (let v = 0; v < raw.vertexCount; v++) {
      let sum = 0;
      for (let i = 0; i < 4; i++) sum += raw.weight[v * 4 + i];
      expect(sum).toBeCloseTo(1, 6);
    }
    expect(raw.weight[2 * 4]).toBeCloseTo(0.5, 6);
    expect(raw.weight[2 * 4 + 1]).toBeCloseTo(0.5, 6);
  });
});

describe('the clips and the albedo', () => {
  it('reads every clip with its own duration', () => {
    expect(mesh.clips).toHaveLength(1);
    expect(mesh.clips[0].name).toBe('Wave');
    expect(mesh.clips[0].durationSec).toBeCloseTo(1, 6);
  });

  it('takes the base colour and never the emissive', () => {
    expect(mesh.albedo?.mime).toBe('image/png');
    expect([...(mesh.albedo?.bytes ?? [])].slice(0, 4)).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it('tolerates a mesh with no texture coordinates', () => {
    const bare = buildMeshBody(buildSkinnedFixture({ withoutUv: true }).glb);
    expect(bare.uv).toHaveLength(bare.vertexCount * 2);
    expect([...bare.uv].every((value) => value === 0)).toBe(true);
  });
});
