import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: {
    __CROWN_LAB__: 'true',

    __CROWN_ASSET_BYTES__: JSON.stringify({
      blocking: 700_000,
      heavy: { music: 16_000_000, meshes: 4_700_000 },
      total: 21_400_000,
    }),
    __CROWN_SIGNALING_URL__: JSON.stringify(''),
    __CROWN_WATERMARK__: JSON.stringify({
      version: 1,
      recipient: 'vitest',
      commit: 'test',
      sourceDigest: 'test',
      dirty: true,
      issuedAt: 'test',
      nonce: 'test',
      id: 'lab-vitest',
      signature: 'test',
      signed: false,
    }),
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 20_000,
  },
});
