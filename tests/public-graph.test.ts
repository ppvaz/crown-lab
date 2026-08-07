
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';

import { describe, expect, it } from 'vitest';

const SRC = join(process.cwd(), 'src');

const PUBLIC_ENTRY = 'src/app/game.ts';
const LAB_ENTRY = 'src/app/lab.ts';

const resolve = (spec: string, fromPath: string): string | null => {
  if (!spec.startsWith('.')) return null;
  const base = join(dirname(fromPath), spec).split(sep).join('/');
  for (const candidate of [`${base}.ts`, `${base}/index.ts`]) {
    if (existsSync(join(process.cwd(), candidate))) return candidate;
  }
  return null;
};

const runtimeImports = (text: string): string[] => {
  const source = text.replace(/\/\*[\s\S]*?\*\//g, '');
  const found: string[] = [];
  for (const match of source.matchAll(/^(?:import|export)\s+(type\s+)?([\s\S]*?)from\s+'([^']+)'/gm)) {
    const [, typeKeyword, clause, spec] = match;
    if (typeKeyword !== undefined) continue;
    const names = clause.trim().replace(/^\{|\}$/g, '').split(',').filter((n) => n.trim() !== '');
    if (names.length > 0 && names.every((n) => /^\s*type\s/.test(n))) continue;
    found.push(spec);
  }
  for (const match of source.matchAll(/(?:^|[^.\w])import\s*\(\s*'([^']+)'/g)) {
    found.push(match[1]);
  }
  return found;
};

const reachableFrom = (entry: string): Set<string> => {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const path = queue.pop()!;
    if (seen.has(path)) continue;
    seen.add(path);
    const text = readFileSync(join(process.cwd(), path), 'utf8');
    for (const spec of runtimeImports(text)) {
      const target = resolve(spec, path);
      if (target !== null && !seen.has(target)) queue.push(target);
    }
  }
  return seen;
};

const isLabModule = (path: string): boolean =>
  path.startsWith('src/lab/') || /-lab\.ts$/.test(path) || /\/index-lab\.ts$/.test(path);

const PUBLIC_GRAPH = reachableFrom(PUBLIC_ENTRY);

describe('the public module graph', () => {
  it('reaches a plausible amount of the tree, so a broken walk cannot pass by finding nothing', () => {
    expect(PUBLIC_GRAPH.size).toBeGreaterThan(40);
    expect(PUBLIC_GRAPH).toContain('src/sim/world.ts');
    expect(PUBLIC_GRAPH).toContain('src/render/draw.ts');
    expect(PUBLIC_GRAPH).toContain('src/game/route.ts');
  });

  it('contains no laboratory module', () => {
    expect([...PUBLIC_GRAPH].filter(isLabModule).sort()).toEqual([]);
  });

  it('recognises a laboratory module when it sees one', () => {
    expect(isLabModule('src/lab/config.ts')).toBe(true);
    expect(isLabModule('src/render/asset-registry-lab.ts')).toBe(true);
    expect(isLabModule('src/render/models/index-lab.ts')).toBe(true);
    expect(isLabModule('src/render/models/king.ts')).toBe(false);
    expect(isLabModule('src/game/route.ts')).toBe(false);
  });

  it('runs nothing the lab does not, apart from its entry and its own indexes', () => {
    const ASSEMBLY_ONLY = [
      PUBLIC_ENTRY,
      'src/render/cast/index-public.ts',
      'src/render/rooms/index-public.ts',
    ].sort();
    const labGraph = reachableFrom(LAB_ENTRY);
    const publicOnly = [...PUBLIC_GRAPH].filter((path) => !labGraph.has(path));
    expect(publicOnly.sort()).toEqual(ASSEMBLY_ONLY);
    expect(labGraph.size).toBeGreaterThan(PUBLIC_GRAPH.size);
  });

  it('ships every body the public index names, and no other', () => {
    const bodies = [...PUBLIC_GRAPH]
      .filter((path) => path.startsWith('src/render/cast/') && !/\/(shape|index-|banks-)/.test(path))
      .sort();
    expect(bodies).toEqual([
      'src/render/cast/archer.ts',
      'src/render/cast/captain.ts',
      'src/render/cast/chancellor.ts',
      'src/render/cast/duelist.ts',
      'src/render/cast/first-blade.ts',
      'src/render/cast/glass-regent.ts',
      'src/render/cast/guard.ts',
      'src/render/cast/king.ts',
      'src/render/cast/queen.ts',
      'src/render/cast/thorn-marshal.ts',
    ]);
  });

  it('reaches the transport, and reaches exactly the three modules it is', () => {

    expect([...PUBLIC_GRAPH].filter((path) => path.startsWith('src/net/')).sort()).toEqual([
      'src/net/channel.ts',
      'src/net/lockstep.ts',
      'src/net/wire.ts',
    ]);
  });

  it('carries no signaling address it was not given', () => {

    const source = readFileSync(join(process.cwd(), 'src/app/coop.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(source).not.toMatch(/['\`]wss?:\/\/[^'\`$]/i);
  });

  const NOT_IN_EITHER_BUILD = [
    'src/app/editor-state.ts',
    'src/app/editor.ts',
    'src/app/main.ts',
    'src/app/data-saver.ts',
    'src/game/travel.ts',
    'src/lab/bench-kit.ts',
    'src/lab/pilot-run.ts',
    'src/lab/pilot.ts',
    'src/render/cast/first-blade-crowned.ts',
    'src/render/cast/legacy-archer.ts',
    'src/render/cast/legacy-captain.ts',
    'src/render/cast/legacy-chancellor.ts',
    'src/render/cast/legacy-duelist.ts',
    'src/render/cast/legacy-first-blade.ts',
    'src/render/cast/legacy-guard.ts',
    'src/render/cast/legacy-king.ts',
    'src/render/travel.ts',
    'src/render/ui-elements.ts',
  ].sort();

  it('accounts for every module under src/, as graph, apparatus, or neither', () => {
    const all: string[] = [];
    const walk = (directory: string, prefix: string): void => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          walk(join(directory, entry.name), `${prefix}${entry.name}/`);
          continue;
        }
        if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
          all.push(`src/${prefix}${entry.name}`);
        }
      }
    };
    walk(SRC, '');
    const labGraph = reachableFrom(LAB_ENTRY);
    const orphans = all.filter((path) => !PUBLIC_GRAPH.has(path) && !labGraph.has(path));
    expect(orphans.sort()).toEqual(NOT_IN_EITHER_BUILD);
  });
});
