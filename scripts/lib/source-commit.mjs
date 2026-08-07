
import { spawnSync } from 'node:child_process';

export const resolveSourceCommit = (root) => {
  const worktree = spawnSync('git', ['rev-parse', '--git-dir'], { cwd: root, encoding: 'utf8' });
  if (worktree.status !== 0) {
    throw new Error(
      `Could not resolve the source commit: not a git repository.\n${worktree.stderr ?? ''}`,
    );
  }

  const head = spawnSync('git', ['rev-parse', '--verify', '--quiet', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  });
  return head.status === 0 ? head.stdout.trim() : null;
};
