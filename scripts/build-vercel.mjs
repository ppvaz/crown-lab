import { mkdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const dist = join(root, 'dist');
const output = join(root, 'artifacts', 'the-last-king-vercel.zip');

mkdirSync(dirname(output), { recursive: true });
rmSync(output, { force: true });

const zip = spawnSync('zip', ['-q', '-r', output, '.'], {
  cwd: dist,
  encoding: 'utf8',
});
if (zip.status !== 0) {
  throw new Error(`Could not create Vercel package:\n${zip.stderr || zip.stdout}`);
}

console.log(
  `Vercel Drop package created: ${relative(root, output)} (${statSync(output).size} bytes)`,
);
