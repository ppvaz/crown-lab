import { defineConfig, type Plugin } from 'vite';
import { transform } from 'esbuild';
import { spawn } from 'node:child_process';
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { publicManglePattern } from './scripts/mangle-allowlist';

interface BuildWatermark {
  version: number;
  recipient: string;
  commit: string;
  sourceDigest: string;
  dirty: boolean;
  issuedAt: string;
  nonce: string;
  id: string;
  signature: string;
  signed: boolean;
}

const environment = (
  globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  }
).process?.env;

const watermarkFor = (lab: boolean, command: string): BuildWatermark => {
  const raw = environment?.CROWN_LAB_WATERMARK;
  if (lab && command === 'build' && raw === undefined) {
    throw new Error(
      'Private lab builds must use scripts/build-watermarked-lab.mjs. ' +
        'Run: npm run build:lab -- --recipient <id>',
    );
  }
  if (raw !== undefined) {
    const parsed = JSON.parse(raw) as BuildWatermark;
    if (
      typeof parsed.id !== 'string' ||
      !/^lab-[a-f0-9]{20}$/.test(parsed.id) ||
      typeof parsed.recipient !== 'string'
    ) {
      throw new Error('CROWN_LAB_WATERMARK is malformed.');
    }
    return parsed;
  }
  return {
    version: 1,
    recipient: lab ? 'development-local' : 'public-game',
    commit: 'development',
    sourceDigest: 'development',
    dirty: true,
    issuedAt: 'development',
    nonce: 'development',
    id: 'lab-00000000000000000000',
    signature: 'development',
    signed: false,
  };
};

const bytesUnder = (dir: string, match: (name: string) => boolean): number => {
  const root = resolve(import.meta.dirname, dir);
  if (!existsSync(root)) return 0;
  const walk = (at: string): number => {
    let total = 0;
    for (const entry of readdirSync(at, { withFileTypes: true })) {
      const full = resolve(at, entry.name);
      if (entry.isDirectory()) total += walk(full);
      else if (match(entry.name)) total += statSync(full).size;
    }
    return total;
  };
  return walk(root);
};

const isMusic = (name: string): boolean => name.endsWith('.webm');
const isSample = (name: string): boolean => name.endsWith('.ogg');
const isParallax = (name: string): boolean => name.endsWith('.webp');
const isMesh = (name: string): boolean => name.endsWith('.cmb') || name.endsWith('.glb');

export interface AssetBytes {
  blocking: number;
  heavy: { music: number; meshes: number };
  total: number;
};

const ASSET_BYTES_TOKEN = '__CROWN_ASSET_BYTES_MEASURED__';

const assetBudget = (lab: boolean): Plugin => ({
  name: 'crown-asset-budget',
  generateBundle(_options, bundle) {
    let code = 0;
    let music = 0;
    let samples = 0;
    let parallax = 0;
    for (const [name, output] of Object.entries(bundle)) {
      const size =
        output.type === 'chunk'
          ? Buffer.byteLength(output.code)
          : typeof output.source === 'string'
            ? Buffer.byteLength(output.source)
            : output.source.byteLength;
      if (name.endsWith('.js')) code += size;
      else if (isMusic(name)) music += size;
      else if (isSample(name)) samples += size;
      else if (isParallax(name)) parallax += size;
    }
    const meshes = lab ? bytesUnder('assets-cast', isMesh) : 0;
    const blocking = code + samples + parallax;
    const measured: AssetBytes = {
      blocking,
      heavy: { music, meshes },
      total: blocking + music + meshes,
    };
    for (const output of Object.values(bundle)) {
      if (output.type !== 'chunk' || !output.code.includes(ASSET_BYTES_TOKEN)) continue;
      output.code = output.code.split(ASSET_BYTES_TOKEN).join(JSON.stringify(measured));
    }
  },
});

const servedAssetBytes = (lab: boolean): AssetBytes => {
  const code = lab ? 650_000 : 330_000;
  const music = bytesUnder('src/assets/audio/music', isMusic);
  const samples = bytesUnder('src/assets/audio', isSample);
  const parallax = bytesUnder('src/assets/parallax', isParallax);
  const meshes = lab
    ? bytesUnder('assets-cast', isMesh) + bytesUnder('src/assets/rooms', isMesh)
    : 0;
  const blocking = code + samples + parallax;
  return { blocking, heavy: { music, meshes }, total: blocking + music + meshes };
};

const minifyCss = (css: string): string =>
  css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{}:;,>])\s*/g, '$1')
    .replace(/;}/g, '}')
    .trim();

const distributionIndex = (lab: boolean, watermark: BuildWatermark): Plugin => ({
  name: 'distribution-index',
  transformIndexHtml: {
    order: 'pre',
    handler: (html) => {
      if (lab) {
        return html
          .replace(
            '<html lang="en">',
            `<html lang="en" data-distribution="private-lab" data-watermark="${watermark.id}">`,
          )
          .replace(
            '</head>',
            `<meta name="robots" content="noindex,nofollow,noarchive" />` +
              `<meta name="crown-lab-watermark" content="${watermark.id}" /></head>`,
          );
      }
      return html
        .replace('<html lang="en">', '<html lang="en" data-distribution="public-game">')
        .replace('<title>Crown Lab</title>', '<title>The Last King</title>')
        .replace(
          /<div id="panel"[^>]*>[\s\S]*?<div class="page-controls"/,
          '<div id="panel" hidden><div id="panel-readout"></div></div><div class="page-controls"',
        )
        .replace(
          /\s*(?:#lab-actions|#fps-meter(?:\[hidden\])?|\.lab-actions__group|\.lab-actions__title|\.lab-action(?::active|\[disabled\])?|body\.touch-enabled\.touch-lab-mode #(?:panel|lab-actions))\s*\{[^{}]*\}/g,
          '',
        )
        .replace(/\s*<output id="fps-meter"[\s\S]*?<\/output>/, '')
        .replace(
          /\s*body\.touch-lab-mode \.touch-stick,\s*body\.touch-lab-mode \.touch-actions\s*\{[^{}]*\}/,
          '',
        )
        .replace(/\s*<button id="touch-view-mode"[\s\S]*?<\/button>/, '')
        .replace(/\s*<select id="touch-encounter"[\s\S]*?<\/select>/, '');
    },
  },
});

const watermarkManifest = (lab: boolean, watermark: BuildWatermark): Plugin => ({
  name: 'watermark-manifest',
  apply: 'build',
  generateBundle() {
    if (!lab) return;
    this.emitFile({
      type: 'asset',
      fileName: 'lab-watermark.json',
      source: JSON.stringify(watermark),
    });
  },
});

const PUBLIC_GAME_ASSETS = ['audio/LICENSE.txt'] as const;

const publicGameAssets = (lab: boolean): Plugin => ({
  name: 'public-game-assets',
  apply: 'build',
  generateBundle() {
    if (lab) return;
    for (const fileName of PUBLIC_GAME_ASSETS) {
      this.emitFile({
        type: 'asset',
        fileName,
        source: readFileSync(new URL(`./public/${fileName}`, import.meta.url)),
      });
    }
  },
});

const minifiedIndex = (): Plugin => ({
  name: 'minified-index',
  transformIndexHtml: {
    order: 'post',
    handler: (html) =>
      html
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(
          /<style([^>]*)>([\s\S]*?)<\/style>/gi,
          (_match, attributes: string, css: string) =>
            `<style${attributes}>${minifyCss(css)}</style>`,
        )
        .replace(/>\s+</g, '><')
        .trim(),
  },
});

const PUBLIC_VOCABULARY: Readonly<Record<string, string>> = {
  idle: 'q0',
  move: 'q1',
  windup: 'q2',
  active: 'q3',
  recovery: 'q4',
  parry: 'q5',
  stagger: 'q6',
  dead: 'q7',
  approach: 'q8',
  reposition: 'q9',
  sequence_reposition: 'qa',
  edge_reposition: 'qb',
  telegraph: 'qc',
  attack: 'qd',
  entrance_fall: 'qe',
  entrance_roar: 'qf',
  phase_roar: 'qg',
  running: 'qh',
  cleared: 'qi',
  timeout: 'qj',

  run_started: 'e0',
  run_ended: 'e1',
  wave_spawned: 'e2',
  arena_gate_opened: 'e3',
  companion_hit: 'e4',
  companion_downed: 'e5',
  player_state_change: 'e6',
  attack_started: 'e7',
  attack_whiffed: 'e8',
  hit_landed: 'e9',
  hit_received: 'ea',
  guard_success: 'eb',
  guard_broken: 'ec',
  parry_success: 'ed',
  parry_failed: 'ee',
  step_started: 'ef',
  stamina_empty: 'eg',
  enemy_telegraph: 'eh',
  enemy_feint: 'ei',
  enemy_attack: 'ej',
  boss_intro_landed: 'ek',
  boss_intro_roar_started: 'el',
  boss_fight_started: 'em',
  boss_phase_roar_started: 'en',
  enemy_sequence_step: 'eo',
  enemy_phase_changed: 'ep',
  enemy_staggered: 'eq',
  enemy_died: 'er',
  projectile_fired: 'es',
  projectile_impact: 'et',
  projectile_reflected: 'eu',
  power_used: 'ev',
  power_hit: 'ew',
  power_overcast: 'ex',
  power_released: 'ey',
  enemy_status_applied: 'ez',
  enemy_status_tick: 'eA',
  enemy_status_ended: 'eB',
  friendly_fire: 'eC',
  player_died: 'eD',
  encounter_cleared: 'eE',
  slowmo_started: 'eF',
  slowmo_ended: 'eG',

};

const regexEscape = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const encodePublicVocabulary = (code: string): string => {
  let encoded = code;
  for (const [plain, token] of Object.entries(PUBLIC_VOCABULARY)) {
    const word = regexEscape(plain);
    encoded = encoded.replace(
      new RegExp(`(["'])${word}\\1`, 'g'),
      (_match, quote: string) => `${quote}${token}${quote}`,
    );
  }
  return encoded;
};

const stripContentNotes = (): Plugin => ({
  name: 'strip-content-notes',
  apply: 'build',
  enforce: 'pre',
  transform(code, id) {
    if (!/\/src\/lab\/rooms\/[a-z0-9-]+\.json$/.test(id)) return null;
    const doc = JSON.parse(code) as unknown;
    const strip = (value: unknown): void => {
      if (Array.isArray(value)) {
        value.forEach(strip);
        return;
      }
      if (value !== null && typeof value === 'object') {
        delete (value as Record<string, unknown>).notes;
        Object.values(value).forEach(strip);
      }
    };
    strip(doc);
    return { code: JSON.stringify(doc), map: null };
  },
});

const hardenPublicProperties = (lab: boolean): Plugin => {
  let mangleProps: RegExp | undefined;
  return {
    name: 'harden-public-properties',
    apply: 'build',
    enforce: 'post',
    async renderChunk(code) {
      if (lab) return null;
      mangleProps ??= publicManglePattern();
      const hardened = await transform(encodePublicVocabulary(code), {
        target: 'es2022',
        format: 'esm',
        minify: true,
        legalComments: 'none',
        mangleProps,
        mangleQuoted: true,
      });
      return { code: hardened.code, map: null };
    },
  };
};

export const CAST_ASSET_DIR = 'assets-cast';
export const CAST_ASSET_ROUTE = '/assets-cast';

const castAssets = (): Plugin => ({
  name: 'crown-cast-assets',
  apply: 'serve',
  configureServer(server) {
    const root = resolve(import.meta.dirname, CAST_ASSET_DIR);
    server.middlewares.use(CAST_ASSET_ROUTE, (req, res, next) => {
      const relative = decodeURIComponent((req.url ?? '').split('?')[0]).replace(/^\/+/, '');
      const file = resolve(root, relative);
      if (!file.startsWith(`${root}/`) || !existsSync(file) || !statSync(file).isFile()) {
        next();
        return;
      }
      res.setHeader('Content-Type', file.endsWith('.glb') ? 'model/gltf-binary' : 'application/octet-stream');
      res.setHeader('Cache-Control', 'no-cache');
      createReadStream(file).pipe(res);
    });
  },
});

const selfHostedSignaling = (): Plugin => {
  const port = Number(process.env.CROWN_SIGNALING_PORT ?? 8787);
  const proxy = {
    '/signal': { target: `ws://127.0.0.1:${port}`, ws: true },
  };

  const startHandshake = (httpServer: { on(event: 'close', listener: () => void): unknown } | null, warn: (message: string) => void): void => {
    if ((process.env.CROWN_SIGNALING_URL ?? '') !== '' || process.env.CROWN_SIGNALING === 'off') {
      return;
    }
    const child = spawn(process.execPath, ['src/server.ts'], {
      cwd: resolve(import.meta.dirname, 'services/signaling'),
      env: { ...process.env, PORT: String(port), CROWN_SIGNALING_HOST: '127.0.0.1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (chunk: Buffer) => process.stdout.write(`[signal] ${chunk}`));
    child.stderr.on('data', (chunk: Buffer) => process.stderr.write(`[signal] ${chunk}`));
    child.on('error', (error) => {
      warn(`[signal] could not start the handshake: ${error.message}`);
    });
    child.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        warn(
          `[signal] the handshake exited (${code}) — co-op will not connect. ` +
            `Port ${port} in use? Set CROWN_SIGNALING_PORT.`,
        );
      }
    });
    const stop = (): void => {
      child.kill('SIGTERM');
    };
    httpServer?.on('close', stop);
    process.on('exit', stop);
  };

  return {
    name: 'self-hosted-signaling',
    apply: 'serve',
    config: () => ({ server: { proxy }, preview: { proxy } }),
    configureServer(server) {
      startHandshake(server.httpServer, (message) => server.config.logger.warn(message));
    },
    configurePreviewServer(server) {
      startHandshake(server.httpServer, (message) => server.config.logger.warn(message));
    },
  };
};


const labSweepSink = (): Plugin => {
  const write = (body: string, warn: (message: string) => void): string | null => {
    try {
      const directory = resolve(import.meta.dirname, 'runs');
      mkdirSync(directory, { recursive: true });
      const file = resolve(directory, `sweep-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
      writeFileSync(file, body);
      return file;
    } catch (error) {
      warn(`[sweep] could not write the report: ${(error as Error).message}`);
      return null;
    }
  };

  type SweepServer = {
    middlewares: {
      use: (
        route: string,
        handler: (
          req: { method?: string; on: (event: string, listener: (chunk: Buffer) => void) => void },
          res: { statusCode: number; setHeader: (name: string, value: string) => void; end: (body?: string) => void },
          next: () => void,
        ) => void,
      ) => void;
    };
    config: { logger: { info: (message: string) => void; warn: (message: string) => void } };
  };

  const mount = (server: SweepServer): void => {
    server.middlewares.use('/lab-sweep', (req, res, next) => {
      if (req.method !== 'POST') {
        next();
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      req.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size <= 262_144) chunks.push(chunk);
      });
      req.on('end', () => {
        if (size > 262_144) {
          res.statusCode = 413;
          res.end('too large');
          return;
        }
        const file = write(Buffer.concat(chunks).toString('utf8'), (message) =>
          server.config.logger.warn(message),
        );
        if (file === null) {
          res.statusCode = 500;
          res.end('could not write');
          return;
        }
        server.config.logger.info(`[sweep] ${file}`);
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ written: true }));
      });
    });
  };

  return {
    name: 'crown-lab-sweep-sink',
    apply: 'serve',
    configureServer: mount,
    configurePreviewServer: mount,
  };
};

export default defineConfig(({ mode, command }) => {
  const lab = mode !== 'game';
  const watermark = watermarkFor(lab, command);
  return {
    plugins: [
      castAssets(),
      selfHostedSignaling(),
      labSweepSink(),
      distributionIndex(lab, watermark),
      minifiedIndex(),
      watermarkManifest(lab, watermark),
      publicGameAssets(lab),
      stripContentNotes(),
      hardenPublicProperties(lab),
      assetBudget(lab),
    ],
    define: {
      __CROWN_LAB__: JSON.stringify(lab),
      __CROWN_WATERMARK__: JSON.stringify(watermark),
      __CROWN_ASSET_BYTES__:
        command === 'build' ? ASSET_BYTES_TOKEN : JSON.stringify(servedAssetBytes(lab)),


      __CROWN_SIGNALING_URL__: JSON.stringify(process.env.CROWN_SIGNALING_URL ?? ''),
    },
    server: { port: 5173, open: false },
    publicDir: lab ? 'public' : false,
    esbuild: {
      legalComments: 'none',
      keepNames: false,
    },
    build: {
      target: 'es2022',
      outDir: 'dist',
      minify: 'esbuild',
      cssMinify: 'esbuild',
      sourcemap: false,
    },
  };
});
