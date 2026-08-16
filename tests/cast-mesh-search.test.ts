import { describe, expect, it } from 'vitest';
import { castMeshFromSearch } from '../src/app/lab-cast-mesh';
import { CAST_MESHES } from '../src/render/cast-meshes-lab';

describe('asking for the skinned cast from the address bar', () => {
  it('defaults to the primitive arm', () => {
    expect(castMeshFromSearch('')).toBe(false);
    expect(castMeshFromSearch('?capture=arena-training')).toBe(false);
  });

  it('still reaches the mesh arm by asking for it', () => {
    expect(castMeshFromSearch('?cast=mesh')).toBe(true);
    expect(castMeshFromSearch('?cast')).toBe(true);
    expect(castMeshFromSearch('?cast=on')).toBe(true);
  });

  it('accepts an explicit primitive arm and refuses unknown arms', () => {
    expect(castMeshFromSearch('?cast=meshh')).toBe(false);
    expect(castMeshFromSearch('?cast=off')).toBe(false);
    expect(castMeshFromSearch('?cast=silhouette')).toBe(false);
  });

  it('accepts the canonical spelling and the ones a hand-typed URL actually gets', () => {
    for (const search of ['?cast=mesh', '?cast', '?cast=1', '?cast=on', '?cast=true', '?cast=MESH']) {
      expect(castMeshFromSearch(search)).toBe(true);
    }
  });

  it('survives the other parameters a benchmark run carries', () => {
    expect(castMeshFromSearch('?capture=arena-training&cast=mesh&apotheosis=full')).toBe(true);
  });



  it('reaches a cast that is not empty', () => {
    expect(Object.keys(CAST_MESHES).length).toBeGreaterThan(0);
  });
});
