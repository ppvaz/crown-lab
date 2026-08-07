
import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

import { blenderCandidates } from '../scripts/lib/blender.mjs';
import { pngSize } from '../scripts/lib/png.mjs';
import { REQUIRED_LAYERS, validateRoomPackage } from '../scripts/lib/room-package.mjs';

type RoomProblem = { code: string; message: string };

const png = (width: number, height: number): Buffer => {
  const chunk = (type: string, body: Buffer): Buffer => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(body.length);
    const typed = Buffer.concat([Buffer.from(type, 'ascii'), body]);
    let crc = ~0;
    for (const byte of typed) {
      crc ^= byte;
      for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE((~crc) >>> 0);
    return Buffer.concat([len, typed, crcBuf]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8);
  ihdr.writeUInt8(6, 9);
  const raw = Buffer.alloc(height * (1 + width * 4));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};

const CONTRACT = {
  room: 'concept_lantern_cloister',
  contentHash: 'abc123def456',
  projection: { isoX: 34, isoY: 17, elevationY: 34, wallUnits: 5.4 },
  raster: {
    widthPx: 2999,
    heightPx: 1976,
    effectiveScale: 2.594088622291022,
    origin: { x: 0, y: 0, elevation: 2.7 },
  },
  budget: { maxDrawsPerFrame: 4, decodedMbCeiling: 90, decodePeakMbCeiling: 181 },
};

const soundManifest = (): Record<string, any> => ({
  id: 'concept_lantern_cloister',
  contractHash: 'abc123def456',
  widthPx: 2999,
  heightPx: 1976,
  colorSpace: 'srgb',
  premultipliedAlpha: false,
  maxDrawsPerFrame: 4,
  collisionVersion: 'collision-v1',
  projection: {
    isoX: 34,
    isoY: 17,
    elevationY: 34,
    effectiveScale: 2.594088622291022,
    origin: { x: 0, y: 0, elevation: 2.7 },
  },
  layers: Object.fromEntries(REQUIRED_LAYERS.map((n) => [n, `${n}.png`])),
  composite: Object.fromEntries(
    REQUIRED_LAYERS.map((n) => [
      n,
      n === 'shadow' ? 'multiply' : n === 'lighting' ? 'lighter' : 'source-over',
    ]),
  ),
  staticLayersUnshadowed: true,
});

const allFound = (
  w = 2999,
  h = 1976,
): Record<string, { width: number; height: number; colorType: number; bytes: number } | null> =>
  Object.fromEntries(
    REQUIRED_LAYERS.map((n) => [
      n,
      { width: w, height: h, colorType: n === 'occlusionMask' ? 0 : 6, bytes: 1000 },
    ]),
  );

describe('the room package validator', () => {
  it('passes a sound hand-authored package', () => {
    expect(validateRoomPackage(soundManifest(), CONTRACT, allFound())).toEqual([]);
  });

  it('catches a missing foreground-occluders layer', () => {
    const manifest = soundManifest();
    delete manifest.layers.foregroundOccluders;
    const problems = validateRoomPackage(manifest, CONTRACT, allFound());
    expect(problems.map((p: RoomProblem) => p.code)).toContain('layer-undeclared');
  });

  it('catches a declared layer that is not on disk', () => {
    const found = allFound();
    found.shadow = null;
    const problems = validateRoomPackage(soundManifest(), CONTRACT, found);
    expect(problems.map((p: RoomProblem) => p.code)).toContain('layer-missing');
  });

  it('catches one layer exported at a different size', () => {
    const found = allFound();
    found.playableFloor = { width: 2998, height: 1976, colorType: 6, bytes: 1000 };
    const problems = validateRoomPackage(soundManifest(), CONTRACT, found);
    expect(problems.map((p: RoomProblem) => p.code)).toContain('layer-dimensions');
  });

  it('catches a package built against a stale camera contract', () => {
    const manifest = soundManifest();
    manifest.contractHash = 'an-older-hash';
    const problems = validateRoomPackage(manifest, CONTRACT, allFound());
    expect(problems.map((p: RoomProblem) => p.code)).toContain('stale-contract');
  });

  it('catches a raster that is not the contract’s', () => {
    const manifest = { ...soundManifest(), widthPx: 2577, heightPx: 1698 };
    const problems = validateRoomPackage(manifest, CONTRACT, allFound(2577, 1698));
    expect(problems.map((p: RoomProblem) => p.code)).toContain('raster-mismatch');
  });

  it('separates resident memory from decode peak', () => {
    expect(validateRoomPackage(soundManifest(), CONTRACT, allFound())).toEqual([]);
    const tight = { ...CONTRACT, budget: { ...CONTRACT.budget, decodePeakMbCeiling: 100 } };
    expect(
      validateRoomPackage(soundManifest(), tight, allFound()).map((p: RoomProblem) => p.code),
    ).toContain('decode-peak-over-budget');
  });

  it('enforces ADR-024’s draw budget', () => {
    const manifest = { ...soundManifest(), maxDrawsPerFrame: 8 };
    const problems = validateRoomPackage(manifest, CONTRACT, allFound());
    expect(problems.map((p: RoomProblem) => p.code)).toContain('draws-over-budget');
  });

  it('requires the draw budget to be declared at all', () => {
    const manifest = soundManifest();
    delete manifest.maxDrawsPerFrame;
    const problems = validateRoomPackage(manifest, CONTRACT, allFound());
    expect(problems.map((p: RoomProblem) => p.code)).toContain('draws-undeclared');
  });

  it('requires an alpha convention, because a mismatch is a halo nobody attributes', () => {
    const manifest = soundManifest();
    delete manifest.premultipliedAlpha;
    const problems = validateRoomPackage(manifest, CONTRACT, allFound());
    expect(problems.map((p: RoomProblem) => p.code)).toContain('alpha-convention');
  });

  it('requires a projection block, because the compositor may not re-derive one', () => {
    const manifest = soundManifest();
    delete manifest.projection;
    const codes = validateRoomPackage(manifest, CONTRACT, allFound()).map((p: RoomProblem) => p.code);
    expect(codes).toContain('projection-undeclared');
  });

  it('catches a raster origin that disagrees with the contract', () => {
    const manifest = soundManifest();
    manifest.projection.origin = { x: 0, y: 0, elevation: 0 };
    const problems = validateRoomPackage(manifest, CONTRACT, allFound());
    expect(problems.map((p: RoomProblem) => p.code)).toContain('projection-mismatch');
    const mismatch = problems.find((p: RoomProblem) => p.code === 'projection-mismatch');
    expect(mismatch?.message).toContain('origin');
  });

  it('catches a projection transcribed instead of copied', () => {
    const manifest = soundManifest();
    manifest.projection.isoY = 18;
    expect(validateRoomPackage(manifest, CONTRACT, allFound()).map((p: RoomProblem) => p.code)).toContain(
      'projection-mismatch',
    );
  });

  it('catches a coverage mask exported with three identical channels', () => {
    const found = allFound();
    found.occlusionMask = { width: 2999, height: 1976, colorType: 6, bytes: 1000 };
    expect(validateRoomPackage(soundManifest(), CONTRACT, found).map((p: RoomProblem) => p.code)).toContain(
      'mask-not-single-channel',
    );
  });

  it('catches a layer exported with no alpha at all', () => {
    const found = allFound();
    found.foregroundOccluders = { width: 2999, height: 1976, colorType: 2, bytes: 1000 };
    expect(validateRoomPackage(soundManifest(), CONTRACT, found).map((p: RoomProblem) => p.code)).toContain(
      'layer-without-alpha',
    );
  });

  it('requires the two light terms to say how they blend', () => {
    const manifest = soundManifest();
    delete manifest.composite.shadow;
    expect(validateRoomPackage(manifest, CONTRACT, allFound()).map((p) => p.code)).toContain(
      'composite-undeclared',
    );
  });

  it('asks nothing of an ordinary layer, because source-over is the only thing pixels can mean', () => {
    const manifest = soundManifest();
    manifest.composite = { shadow: 'multiply', lighting: 'lighter' };
    expect(validateRoomPackage(manifest, CONTRACT, allFound())).toEqual([]);
  });

  it('refuses a light term declared as an ordinary draw', () => {
    const manifest = soundManifest();
    manifest.composite.lighting = 'source-over';
    const problems = validateRoomPackage(manifest, CONTRACT, allFound());
    expect(problems.map((p) => p.code)).toContain('composite-wrong');
    expect(problems.find((p) => p.code === 'composite-wrong')?.message).toMatch(/lighter/);
  });

  it('refuses a shadow layer over statics that kept their own shadowing', () => {
    const manifest = soundManifest();
    delete manifest.staticLayersUnshadowed;
    expect(validateRoomPackage(manifest, CONTRACT, allFound()).map((p) => p.code)).toContain(
      'shadow-double-counted',
    );
  });

  it('asks nothing of a blockout that has no shadow layer to be wrong about', () => {
    const manifest = soundManifest();
    delete manifest.layers.shadow;
    delete manifest.layers.lighting;
    delete manifest.staticLayersUnshadowed;
    manifest.provenance = { preset: { engine: 'BLENDER_WORKBENCH' } };
    const found = allFound();
    delete found.shadow;
    delete found.lighting;
    const problems = validateRoomPackage(manifest, CONTRACT, found);
    expect(problems.every((p) => p.severity === 'warning')).toBe(true);
    expect(problems.map((p) => p.code)).not.toContain('shadow-double-counted');
  });

  it('requires a collision version, because stale collision traps the player', () => {
    const manifest = { ...soundManifest(), collisionVersion: '' };
    const problems = validateRoomPackage(manifest, CONTRACT, allFound());
    expect(problems.map((p: RoomProblem) => p.code)).toContain('collision-version');
  });
});

describe('png header reading', () => {
  it('reads dimensions from a real IHDR', () => {
    expect(pngSize(png(2999, 1976))).toMatchObject({ width: 2999, height: 1976 });
  });

  it('throws on a non-PNG rather than reporting 0x0', () => {
    expect(() => pngSize(Buffer.alloc(64))).toThrow(/not a PNG/);
    expect(() => pngSize(Buffer.alloc(8))).toThrow(/too short/);
  });
});

describe('locating Blender', () => {
  it('prefers $BLENDER_BIN, then PATH, then the macOS bundle', () => {
    const order = blenderCandidates({ BLENDER_BIN: '/custom/blender' }, 'darwin');
    expect(order.map((c: { path: string }) => c.path)).toEqual([
      '/custom/blender',
      'blender',
      '/Applications/Blender.app/Contents/MacOS/Blender',
    ]);
  });

  it('does not offer the macOS bundle off darwin', () => {
    expect(blenderCandidates({}, 'linux').map((c: { path: string }) => c.path)).toEqual(['blender']);
  });

  it('ignores an empty BLENDER_BIN instead of trying to execute it', () => {
    expect(blenderCandidates({ BLENDER_BIN: '' }, 'linux').map((c: { path: string }) => c.path)).toEqual(['blender']);
  });
});
