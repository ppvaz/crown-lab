
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildRoomMesh, type RoomMeshManifest } from '../src/render/room-mesh-lab';
import { arenaVertices } from '../src/sim/arena';
import { ENCOUNTERS } from '../src/lab/encounters';
import { createWorld } from '../src/sim/encounter';
import { DEFAULT_COMBAT } from '../src/lab/config';

const dir = resolve(import.meta.dirname, '../src/assets/rooms/concept-lantern-cloister/mesh');
const manifest = JSON.parse(
  readFileSync(resolve(dir, 'room-mesh.json'), 'utf8'),
) as RoomMeshManifest;
const glb = ((): ArrayBuffer => {
  const file = readFileSync(resolve(dir, 'concept_lantern_cloister.glb'));
  return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
})();

const notes: string[] = [];
const room = buildRoomMesh(glb, manifest, (note) => notes.push(note));

const guardDir = resolve(import.meta.dirname, '../src/assets/rooms/kernel-guard/mesh');
const guardManifest = JSON.parse(
  readFileSync(resolve(guardDir, 'room-mesh.json'), 'utf8'),
) as RoomMeshManifest;
const guardFile = readFileSync(resolve(guardDir, 'kernel_guard.glb'));
const guardNotes: string[] = [];
const guardRoom = buildRoomMesh(
  guardFile.buffer.slice(guardFile.byteOffset, guardFile.byteOffset + guardFile.byteLength) as ArrayBuffer,
  guardManifest,
  (note) => guardNotes.push(note),
);

const vertex = (i: number): [number, number, number] =>
  [room.pos[i * 3], room.pos[i * 3 + 1], room.pos[i * 3 + 2]];
const normal = (i: number): [number, number, number] =>
  [room.nrm[i * 3], room.nrm[i * 3 + 1], room.nrm[i * 3 + 2]];

describe('the baked room reads back into the runtime\'s own space', () => {
  it('loads without a note, which is the only way a surface can be silently wrong', () => {
    expect(notes).toEqual([]);
    expect(room.lightExposure).toBe(manifest.lightExposure ?? 1);
  });

  it('stands on the arena the simulation is running', () => {
    const world = createWorld(ENCOUNTERS.concept_lantern_cloister_live, DEFAULT_COMBAT, 7);
    const live = arenaVertices(world.arena);
    expect(manifest.arena.vertices).toHaveLength(live.length);
    manifest.arena.vertices?.forEach((baked, i) => {
      expect(baked.x).toBeCloseTo(live[i].x, 6);
      expect(baked.y).toBeCloseTo(live[i].y, 6);
    });
  });

  it('puts the wall top back at the contract\'s wallUnits', () => {
    let top = -Infinity;
    for (let i = 0; i < room.pos.length; i += 3) top = Math.max(top, room.pos[i + 2]);
    expect(top).toBeCloseTo(manifest.projection.wallUnits, 3);
    expect(manifest.space.heightScale).toBeCloseTo(Math.sqrt(2 / 3), 6);
    expect(top * manifest.space.heightScale).toBeLessThan(manifest.projection.wallUnits);
  });

  it('keeps the floor inside the arena and the slab under it', () => {
    const live = arenaVertices(
      createWorld(ENCOUNTERS.concept_lantern_cloister_live, DEFAULT_COMBAT, 7).arena,
    );
    const reach = Math.max(...live.map((v) => Math.max(Math.abs(v.x), Math.abs(v.y))));
    let low = Infinity;
    let wide = 0;
    for (let i = 0; i < room.pos.length; i += 3) {
      low = Math.min(low, room.pos[i + 2]);
      wide = Math.max(wide, Math.abs(room.pos[i]), Math.abs(room.pos[i + 1]));
    }
    expect(low).toBeLessThan(0);
    expect(low).toBeGreaterThan(-2);
    expect(wide).toBeGreaterThan(reach);
    expect(wide).toBeLessThan(reach + 2);
  });

  it('winds every triangle to agree with the normal it was given', () => {
    let checked = 0;
    let disagreeing = 0;
    for (let i = 0; i + 2 < room.pos.length / 3; i += 3) {
      const [ax, ay, az] = vertex(i);
      const [bx, by, bz] = vertex(i + 1);
      const [cx, cy, cz] = vertex(i + 2);
      const ux = bx - ax;
      const uy = by - ay;
      const uz = bz - az;
      const vx = cx - ax;
      const vy = cy - ay;
      const vz = cz - az;
      const gx = uy * vz - uz * vy;
      const gy = uz * vx - ux * vz;
      const gz = ux * vy - uy * vx;
      const area = Math.hypot(gx, gy, gz);
      if (area < 1e-9) continue;
      const [nx, ny, nz] = normal(i);
      checked++;
      if ((gx * nx + gy * ny + gz * nz) / area < 0.5) disagreeing++;
    }
    expect(checked).toBeGreaterThan(1000);
    expect(disagreeing).toBe(0);
  });

  it('keeps every normal a unit vector after the inverse-transpose', () => {
    for (let i = 0; i < room.nrm.length; i += 3) {
      const length = Math.hypot(room.nrm[i], room.nrm[i + 1], room.nrm[i + 2]);
      expect(length).toBeCloseTo(1, 5);
    }
  });

  it('leaves a slanted face pointing where its own geometry says', () => {
    const k = manifest.space.heightScale;
    let slanted = 0;
    let correct = 0;
    let naive = 0;
    for (let i = 0; i + 2 < room.pos.length / 3; i += 3) {
      const [nx, ny, nz] = normal(i);
      if (Math.hypot(nx, ny) < 0.2 || Math.abs(nz) < 0.2) continue;
      const [ax, ay, az] = vertex(i);
      const [bx, by, bz] = vertex(i + 1);
      const [cx, cy, cz] = vertex(i + 2);
      const gx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
      const gy = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
      const gz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      const area = Math.hypot(gx, gy, gz);
      if (area < 1e-9) continue;
      slanted++;
      correct += (gx * nx + gy * ny + gz * nz) / area;
      const wz = nz / (k * k);
      const length = Math.hypot(nx, ny, wz);
      naive += (gx * nx + gy * ny + gz * wz) / (area * length);
    }
    expect(slanted).toBeGreaterThan(50);
    expect(correct / slanted).toBeGreaterThan(0.99);
    expect(correct / slanted - naive / slanted).toBeGreaterThan(0.005);
  });
});

describe('the promoted Guardroom bake satisfies the live reader', () => {
  it('loads the generated props without a transformed node or unknown material', () => {
    expect(guardNotes).toEqual([]);
  });

  it('keeps the gold court above the floor and facing the camera', () => {
    const gold = guardRoom.surfaces.findIndex((surface) => surface.name === 'guard-gold');
    expect(gold).toBeGreaterThanOrEqual(0);
    let floorGold = 0;
    for (let i = 0; i < guardRoom.srf.length; i++) {
      if (guardRoom.srf[i] !== gold || guardRoom.pos[i * 3 + 2] > 0.1) continue;
      floorGold++;
      expect(guardRoom.nrm[i * 3 + 2]).toBeGreaterThan(0.9);
    }
    expect(floorGold).toBeGreaterThan(1000);
  });
});

describe('the promoted Dog-leg Passage bake satisfies the live reader', () => {
  const duelDir = resolve(import.meta.dirname, '../src/assets/rooms/kernel-duelist/mesh');
  const duelManifest = JSON.parse(
    readFileSync(resolve(duelDir, 'room-mesh.json'), 'utf8'),
  ) as RoomMeshManifest;
  const duelFile = readFileSync(resolve(duelDir, 'kernel_duelist.glb'));
  const duelNotes: string[] = [];
  const duelRoom = buildRoomMesh(
    duelFile.buffer.slice(duelFile.byteOffset, duelFile.byteOffset + duelFile.byteLength) as ArrayBuffer,
    duelManifest,
    (note) => duelNotes.push(note),
  );

  it('loads without a transformed node or unknown material', () => {
    expect(duelNotes).toEqual([]);
  });

  it('stands on the arena the simulation is running', () => {
    const live = arenaVertices(createWorld(ENCOUNTERS.kernel_duelist, DEFAULT_COMBAT, 7).arena);
    expect(duelManifest.arena.vertices).toHaveLength(live.length);
    duelManifest.arena.vertices?.forEach((baked, i) => {
      expect(baked.x).toBeCloseTo(live[i].x, 6);
      expect(baked.y).toBeCloseTo(live[i].y, 6);
    });
  });

  it('puts the wall top back at the contract\'s wallUnits', () => {
    let top = -Infinity;
    for (let i = 0; i < duelRoom.pos.length; i += 3) top = Math.max(top, duelRoom.pos[i + 2]);
    expect(top).toBeCloseTo(duelManifest.projection.wallUnits + 0.2, 3);
  });

  it('keeps the gold diamond court above the floor and facing the camera', () => {
    const gold = duelRoom.surfaces.findIndex((surface) => surface.name === 'duel-gold');
    expect(gold).toBeGreaterThanOrEqual(0);
    let floorGold = 0;
    for (let i = 0; i < duelRoom.srf.length; i++) {
      if (duelRoom.srf[i] !== gold || duelRoom.pos[i * 3 + 2] > 0.1) continue;
      floorGold++;
      expect(duelRoom.nrm[i * 3 + 2]).toBeGreaterThan(0.9);
    }
    expect(floorGold).toBeGreaterThan(50);
  });
});

describe('the manifest carries what a mesh file cannot', () => {
  it('holds the whole rig, each light naming the lamp it comes out of', () => {
    expect(room.lights).toHaveLength(9);
    const energies = [...new Set(room.lights.map((light) => light.energy))].sort((a, b) => a - b);
    expect(energies).toHaveLength(2);
    const [lantern, torch] = energies;
    expect(torch).toBeGreaterThan(lantern);
    expect(room.lights.filter((light) => light.energy === lantern)).toHaveLength(6);
    expect(room.lights.filter((light) => light.energy === torch)).toHaveLength(3);
    expect(room.lights.every((light) => light.lamp >= 0)).toBe(true);
  });

  it('carries the fill, so the live room and the bake cannot be lit by two different skies', () => {
    expect(room.ambient).toHaveLength(3);
    expect(room.ambient.every((c) => c > 0)).toBe(true);
    expect(room.ambient[2]).toBeGreaterThan(room.ambient[0]);
  });

  it('gives every lamp body its own light index, so a lantern answers its own flame', () => {
    const lampSurfaces = new Set<number>();
    for (const value of room.srf) {
      if (value >= room.surfaces.length) lampSurfaces.add(value - room.surfaces.length);
    }
    expect([...lampSurfaces].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('describes every material the mesh actually paints with', () => {
    const kinds = new Set(room.surfaces.map((surface) => surface.kind));
    expect(kinds).toContain('ashlar');
    expect(kinds).toContain('flagstone');
    expect(kinds).toContain('metal');
    expect(kinds).toContain('flame');
    for (const surface of room.surfaces) {
      if (surface.kind !== 'ashlar' && surface.kind !== 'flagstone') continue;
      expect(surface.block?.[0]).toBeGreaterThan(0.1);
      expect(surface.block?.[0]).toBeLessThan(2);
      expect(surface.joint).toBeDefined();
    }
    const highest = Math.max(...room.srf);
    expect(highest).toBeLessThan(room.surfaces.length + room.lights.length);
  });

  it('lays the buffer out as the renderer draws it: behind first, then the masses', () => {
    expect(room.behind.first).toBe(0);
    expect(room.massesRange.first).toBe(room.behind.first + room.behind.count);
    expect(room.masses).toHaveLength(3);
    let next = room.massesRange.first;
    for (const mass of room.masses) {
      expect(mass.range.first).toBe(next);
      next += mass.range.count;
    }
    expect(next).toBe(room.massesRange.first + room.massesRange.count);
    expect(next).toBe(room.pos.length / 3);
  });

  it('bounds each mass around where it actually stands', () => {
    for (const mass of room.masses) {
      let minX = Infinity;
      let maxX = -Infinity;
      let top = -Infinity;
      for (let i = mass.range.first; i < mass.range.first + mass.range.count; i++) {
        minX = Math.min(minX, room.pos[i * 3]);
        maxX = Math.max(maxX, room.pos[i * 3]);
        top = Math.max(top, room.pos[i * 3 + 2]);
      }
      expect(mass.bounds.min.x).toBeLessThanOrEqual(minX + 1e-6);
      expect(mass.bounds.max.x).toBeGreaterThanOrEqual(maxX - 1e-6);
      expect(mass.bounds.top).toBeGreaterThanOrEqual(top - 1e-6);
      expect(mass.at.x).toBeGreaterThan(mass.bounds.min.x);
      expect(mass.at.x).toBeLessThan(mass.bounds.max.x);
    }
  });
});
