import { readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>;
};

const referenced = (command: string): string[] =>
  [...command.matchAll(/scripts\/[\w./-]+\.(?:mjs|ts|js)/g)].map((match) => match[0]);

describe('package.json names scripts that exist', () => {
  it('resolves every scripts/ path in every command', () => {
    const missing: string[] = [];
    for (const [name, command] of Object.entries(pkg.scripts)) {
      for (const path of referenced(command)) {
        if (!existsSync(resolve(root, path))) missing.push(`${name} -> ${path}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('finds the paths it claims to be checking', () => {
    expect(referenced(pkg.scripts['cast:mesh'])).toEqual(['scripts/export-cast-mesh.mjs']);
    expect(referenced('vite build && node scripts/a.mjs --dir dist && node scripts/b.mjs')).toEqual([
      'scripts/a.mjs',
      'scripts/b.mjs',
    ]);
  });
});
