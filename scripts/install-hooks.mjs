import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
if (!existsSync(resolve(root, '.git'))) {
  console.log('Git hooks not installed: this copy has no .git directory.');
  process.exit(0);
}

const configured = spawnSync('git', ['config', 'core.hooksPath', '.githooks'], {
  cwd: root,
  encoding: 'utf8',
});

if (configured.status !== 0) {
  console.warn(
    `Git hooks not installed automatically. Run "npm run hooks:install".\n${
      configured.stderr || configured.stdout
    }`,
  );
  process.exit(0);
}

console.log('Git pre-commit security review gate installed from .githooks/.');
