
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

export const SIM_DEFINE = { __CROWN_LAB__: 'true' };

/**
 * Where a bundled tool lands. Inside `node_modules/.cache`, so it is never a build input.
 * @param {string} name
 */
export const cachePath = (name) => resolve(root, 'node_modules/.cache/crown-lab', name);

/**
 * @param {{ entry: string, name: string, format?: import('esbuild').Format,
 *           platform?: import('esbuild').Platform, globalName?: string }} opts
 */
export const bundleSim = async ({
  entry,
  name,
  format = 'esm',
  platform = 'node',
  globalName = undefined,
}) => {
  const outfile = cachePath(name);
  await mkdir(dirname(outfile), { recursive: true });
  await build({
    entryPoints: [resolve(root, entry)],
    outfile,
    bundle: true,
    format,
    platform,
    globalName,
    target: format === 'iife' ? 'es2022' : 'node20',
    define: SIM_DEFINE,
    logLevel: 'warning',
  });
  return outfile;
};

/**
 * Bundle a `src/` entry and import it. The common case: a Node-side tool reading exports.
 * @param {string} entry
 * @param {string} name
 */
export const loadSim = async (entry, name) =>
  import(/* @vite-ignore */ `file://${await bundleSim({ entry, name: name.endsWith('.mjs') ? name : `${name}.mjs` })}`);
