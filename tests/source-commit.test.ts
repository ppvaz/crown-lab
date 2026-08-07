import { mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { resolveSourceCommit } from '../scripts/lib/source-commit.mjs';

const made: string[] = [];
const scratch = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'crown-source-commit-'));
  made.push(dir);
  return dir;
};
const git = (cwd: string, ...args: string[]): void => {
  const run = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (run.status !== 0) throw new Error(`git ${args.join(' ')} failed:\n${run.stderr}`);
};

afterAll(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

describe('resolveSourceCommit', () => {
  it('returns null for a repository that has no commits yet', () => {
    const dir = scratch();
    git(dir, 'init', '-q');

    expect(resolveSourceCommit(dir)).toBeNull();
  });

  it('returns the resolved sha once a commit exists', () => {
    const dir = scratch();
    git(dir, 'init', '-q');
    git(dir, 'config', 'user.email', 'test@example.invalid');
    git(dir, 'config', 'user.name', 'Test');
    git(dir, 'commit', '-q', '--allow-empty', '-m', 'first');

    const commit = resolveSourceCommit(dir);
    expect(commit).toMatch(/^[0-9a-f]{40}$/);

    const bare = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' });
    expect(commit).toBe(bare.stdout.trim());
  });

  it('throws when the path is not inside a git worktree at all', () => {
    expect(() => resolveSourceCommit(scratch())).toThrow(/not a git repository/i);
  });
});
