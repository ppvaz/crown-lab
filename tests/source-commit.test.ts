import { mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { AMBIENT_GIT_VARS, resolveSourceCommit } from '../scripts/lib/source-commit.mjs';

const detached = (): NodeJS.ProcessEnv => {
  const env = { ...process.env };
  for (const name of AMBIENT_GIT_VARS) delete env[name];
  return env;
};

const made: string[] = [];
const scratch = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'crown-source-commit-'));
  made.push(dir);
  return dir;
};
const git = (cwd: string, ...args: string[]): void => {
  const run = spawnSync('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
    env: {
      ...detached(),
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_SYSTEM: '/dev/null',
      GIT_CEILING_DIRECTORIES: tmpdir(),
    },
  });
  if (run.status !== 0) throw new Error(`git ${args.join(' ')} failed:\n${run.stderr}`);
};

const AS_TEST = [
  '-c',
  'user.email=test@example.invalid',
  '-c',
  'user.name=Test',
];

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
    git(dir, ...AS_TEST, 'commit', '-q', '--allow-empty', '-m', 'first');

    const commit = resolveSourceCommit(dir);
    expect(commit).toMatch(/^[0-9a-f]{40}$/);

    const bare = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8', env: detached() });
    expect(commit).toBe(bare.stdout.trim());
  });

  it('throws when the path is not inside a git worktree at all', () => {
    expect(() => resolveSourceCommit(scratch())).toThrow(/not a git repository/i);
  });
});

describe('this repository', () => {
  it('is not configured bare, whatever ran before', () => {
    const bare = spawnSync('git', ['config', '--get', 'core.bare'], {
      cwd: import.meta.dirname,
      encoding: 'utf8',
    });
    expect(bare.stdout.trim()).not.toBe('true');
  });
});

describe('an inherited GIT_DIR does not get to answer for `root`', () => {
  const ambient = (dir: string, run: () => void): void => {
    const before = { ...process.env };
    process.env.GIT_DIR = join(dir, '.git');
    process.env.GIT_INDEX_FILE = join(dir, '.git', 'index');
    try {
      run();
    } finally {
      process.env = before;
    }
  };

  it('still reports no commit for an unborn repository', () => {
    const outer = scratch();
    git(outer, 'init', '-q');
    git(outer, ...AS_TEST, 'commit', '-q', '--allow-empty', '-m', 'first');

    const unborn = scratch();
    git(unborn, 'init', '-q');
    ambient(outer, () => expect(resolveSourceCommit(unborn)).toBeNull());
  });

  it('still throws for a directory that is not a repository', () => {
    const outer = scratch();
    git(outer, 'init', '-q');
    ambient(outer, () => expect(() => resolveSourceCommit(scratch())).toThrow(/not a git repository/i));
  });
});
