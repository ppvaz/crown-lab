
import { spawnSync } from 'node:child_process';

export const AMBIENT_GIT_VARS = [
  'GIT_DIR',
  'GIT_COMMON_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_PREFIX',
  'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_NAMESPACE',
];

const askingAbout = () => {
  const env = { ...process.env };
  for (const name of AMBIENT_GIT_VARS) delete env[name];
  return env;
};

export const resolveSourceCommit = (root) => {
  const env = askingAbout();
  const worktree = spawnSync('git', ['rev-parse', '--git-dir'], { cwd: root, encoding: 'utf8', env });
  if (worktree.status !== 0) {
    throw new Error(
      `Could not resolve the source commit: not a git repository.\n${worktree.stderr ?? ''}`,
    );
  }

  const head = spawnSync('git', ['rev-parse', '--verify', '--quiet', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
    env,
  });
  return head.status === 0 ? head.stdout.trim() : null;
};
