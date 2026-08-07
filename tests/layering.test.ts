
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, sep } from 'node:path';

import { describe, expect, it } from 'vitest';

const SRC = join(process.cwd(), 'src');
const SERVICES = join(process.cwd(), 'services');

type Layer = 'app' | 'render' | 'game' | 'lab' | 'net' | 'sim';

const MAY_IMPORT: Record<Layer, readonly Layer[]> = {
  app: ['app', 'render', 'game', 'lab', 'net', 'sim'],
  render: ['render', 'game', 'lab', 'sim'],
  game: ['game', 'sim'],
  lab: ['lab', 'sim'],
  net: ['net', 'sim'],
  sim: ['sim'],
};

const LAYERS = Object.keys(MAY_IMPORT) as Layer[];

const NON_CODE_DIRECTORIES = ['assets'];

interface SourceFile {
  path: string;
  layer: Layer;
  text: string;
}

const typeScriptFilesUnder = (root: string): string[] => {
  const found: string[] = [];
  const walk = (directory: string, prefix: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        walk(join(directory, entry.name), `${prefix}${entry.name}/`);
        continue;
      }
      if (entry.name.endsWith('.ts')) found.push(`${prefix}${entry.name}`);
    }
  };
  walk(root, '');
  return found;
};

const sourceFiles = (): SourceFile[] =>
  LAYERS.flatMap((layer) =>
    typeScriptFilesUnder(join(SRC, layer)).map((relative) => ({
      path: `src/${layer}/${relative}`,
      layer,
      text: readFileSync(join(SRC, layer, relative), 'utf8'),
    })),
  );

const FILES = sourceFiles();

const importsOf = (text: string): Array<{ spec: string; erased: boolean }> => {
  const found: Array<{ spec: string; erased: boolean }> = [];
  const pattern = /^import\s+(type\s+)?([\s\S]*?)from\s+'([^']+)'/gm;
  for (const match of text.matchAll(pattern)) {
    const [, typeKeyword, clause, spec] = match;
    if (typeKeyword !== undefined) {
      found.push({ spec, erased: true });
      continue;
    }
    const names = clause.trim().replace(/^\{|\}$/g, '').split(',').filter((n) => n.trim() !== '');
    const allTypes = names.length > 0 && names.every((n) => /^\s*type\s/.test(n));
    found.push({ spec, erased: allTypes });
  }
  return found;
};

const layerOf = (spec: string, fromPath: string): Layer | null => {
  if (!spec.startsWith('.')) return null;
  const resolved = join(dirname(fromPath), spec).split(sep).join('/');
  const match = /^src\/([a-z]+)\//.exec(resolved);
  if (match === null) return null;
  return (LAYERS as string[]).includes(match[1]) ? (match[1] as Layer) : null;
};

describe('the layering arrow', () => {
  it('covers every layer the contract names, so a new directory cannot slip in untested', () => {
    expect(readdirSync(SRC, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort()).toEqual([...LAYERS, ...NON_CODE_DIRECTORIES].sort());
  });

  it('sees a file nested in a subdirectory, so a per-item split cannot leave the arrow behind', () => {
    const root = mkdtempSync(join(tmpdir(), 'crown-layering-'));
    try {
      mkdirSync(join(root, 'models'), { recursive: true });
      writeFileSync(join(root, 'flat.ts'), '');
      writeFileSync(join(root, 'models', 'king.ts'), '');
      writeFileSync(join(root, 'models', 'notes.md'), '');
      expect(typeScriptFilesUnder(root).sort()).toEqual(['flat.ts', 'models/king.ts']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.each([
    ['./local', 'src/lab/tutorial.ts', 'lab'],
    ['../sim/types', 'src/game/public-profile.ts', 'sim'],
    ['../../sim/types', 'src/render/models/king.ts', 'sim'],
    ['../palette', 'src/render/models/king.ts', 'render'],
    ['./king', 'src/render/models/index-public.ts', 'render'],
    ['../../lab/presentation', 'src/render/models/king.ts', 'lab'],
    ['vitest', 'src/game/tutorial.ts', null],
  ])('resolves %s from %s to the %s layer', (spec, from, expected) => {
    expect(layerOf(spec, from)).toBe(expected);
  });

  it('finds imports at all, so a silently-broken parser cannot pass everything', () => {
    const tutorial = FILES.find((f) => f.path === 'src/game/tutorial.ts');
    expect(tutorial).toBeDefined();
    const specs = importsOf(tutorial!.text);
    expect(specs.length).toBeGreaterThan(2);
    expect(specs.every((s) => s.erased)).toBe(true);
  });

  it('distinguishes an erased type import from a runtime one', () => {
    const sample = [
      "import type { A } from '../sim/types';",
      "import { type B } from '../sim/types';",
      "import { c, type D } from '../sim/vec';",
      "import { e } from './local';",
    ].join('\n');
    expect(importsOf(sample)).toEqual([
      { spec: '../sim/types', erased: true },
      { spec: '../sim/types', erased: true },
      { spec: '../sim/vec', erased: false },
      { spec: './local', erased: false },
    ]);
  });

  it('is respected by every runtime import in src/', () => {
    const violations: string[] = [];
    for (const file of FILES) {
      for (const { spec, erased } of importsOf(file.text)) {
        if (erased) continue;
        const target = layerOf(spec, file.path);
        if (target === null) continue;
        if (!MAY_IMPORT[file.layer].includes(target)) {
          violations.push(`${file.path} -> ${spec} (${file.layer} may not import ${target})`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('has no runtime cycle between game/ and lab/, in either direction', () => {
    const edges = new Set<string>();
    for (const file of FILES) {
      for (const { spec, erased } of importsOf(file.text)) {
        if (erased) continue;
        const target = layerOf(spec, file.path);
        if (target !== null && target !== file.layer) edges.add(`${file.layer}->${target}`);
      }
    }
    expect(edges.has('game->lab') && edges.has('lab->game')).toBe(false);
  });
});

describe('sim purity', () => {
  const SIM = FILES.filter((f) => f.layer === 'sim');

  it('imports nothing outside sim/, not even a type', () => {
    const violations: string[] = [];
    for (const file of SIM) {
      for (const { spec } of importsOf(file.text)) {
        if (!spec.startsWith('.')) violations.push(`${file.path} -> ${spec} (bare specifier)`);
        else if (layerOf(spec, file.path) !== 'sim') violations.push(`${file.path} -> ${spec}`);
      }
    }
    expect(violations).toEqual([]);
  });

  const code = (text: string): string =>
    text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it.each([
    ['window', /\bwindow\b/],
    ['document', /\bdocument\b/],
    ['Date', /\bDate\b/],
    ['performance', /\bperformance\./],
    ['Math.random', /\bMath\.random\b/],
    ['localStorage', /\blocalStorage\b/],
    ['sessionStorage', /\bsessionStorage\b/],
    ['process', /\bprocess\./],
    ['Buffer', /\bBuffer\b/],
  ])('never touches %s', (_name, pattern) => {
    const offenders = SIM.filter((f) => pattern.test(code(f.text))).map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it('draws entropy only through rng.ts', () => {
    const offenders = SIM.filter(
      (f) => f.path !== 'src/sim/rng.ts' && /\bMath\.random\b|crypto\./.test(code(f.text)),
    ).map((f) => f.path);
    expect(offenders).toEqual([]);
  });
});

describe('the parser is not blind to the thing it cannot parse', () => {
  const dynamicImports = (text: string): string[] =>
    [...text.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(?:^|[^.\w])import\s*\(\s*'([^']+)'/g)].map(
      (m) => m[1],
    );

  it('has a dynamic import in app/main.ts and nowhere else', () => {
    const offenders = FILES.filter(
      (f) => f.path !== 'src/app/main.ts' && dynamicImports(f.text).length > 0,
    ).map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it('lets app/main.ts reach only the two entrypoints, so neither build can retain the other', () => {
    const main = FILES.find((f) => f.path === 'src/app/main.ts');
    expect(main).toBeDefined();
    expect(dynamicImports(main!.text).sort()).toEqual(['./game', './lab']);
  });
});

describe('the signaling service is not part of the game', () => {
  const sourcesUnder = (root: string): { path: string; text: string }[] => {
    const found: { path: string; text: string }[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules') continue;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('.ts')) found.push({ path: full, text: readFileSync(full, 'utf8') });
      }
    };
    walk(root);
    return found;
  };

  it('is never imported by anything the game builds', () => {
    const offenders = sourcesUnder(SRC)
      .filter(({ text }) => /from\s+['"][^'"]*services\//.test(text))
      .map(({ path }) => path);

    expect(offenders).toEqual([]);
  });

  it('never imports the game, so a sim change cannot break a running service', () => {
    const offenders = sourcesUnder(SERVICES)
      .filter(({ text }) => /from\s+['"][^'"]*(\.\.\/){2,}src\//.test(text))
      .map(({ path }) => path);

    expect(offenders).toEqual([]);
  });
});
