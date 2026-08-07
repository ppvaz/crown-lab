import { describe, expect, it } from 'vitest';
import { LAB_ROOM_MESHES, LAB_ROOM_PACKAGES } from '../src/render/asset-registry-lab';
import { ENCOUNTERS } from '../src/lab/encounters';
import { CAST_MESHES, CAST_MESH_IDS } from '../src/render/cast-meshes-lab';

describe('what the boot preload can actually reach', () => {
  it('has an encounter behind every baked room, or the preload quietly skips it', () => {
    const registered = [...Object.keys(LAB_ROOM_MESHES), ...Object.keys(LAB_ROOM_PACKAGES)];
    for (const id of registered) {
      expect(ENCOUNTERS[id], `no encounter for baked room ${id}`).toBeDefined();
      expect(ENCOUNTERS[id].arena, `encounter ${id} carries no arena`).toBeDefined();
    }
  });

  it('preloads every body the draw path can ask for', () => {
    expect([...CAST_MESH_IDS].sort()).toEqual(Object.keys(CAST_MESHES).sort());
  });
});
