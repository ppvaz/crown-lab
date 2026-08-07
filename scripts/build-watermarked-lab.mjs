import { createHash, createHmac, randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { resolveSourceCommit } from './lib/source-commit.mjs';

const root = resolve(import.meta.dirname, '..');
const valueArg = (name) => {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? undefined : process.argv[index + 1];
};
const flag = (name) => process.argv.includes(`--${name}`);

const recipient = valueArg('recipient') ?? process.env.CROWN_LAB_RECIPIENT;
if (recipient === undefined || !/^[A-Za-z0-9][A-Za-z0-9._@-]{1,79}$/.test(recipient)) {
  throw new Error(
    'A lab build requires a 2-80 character recipient id.\n' +
      'Example: npm run build:lab -- --recipient dev-alice',
  );
}

const shared = flag('shared');
const secret = process.env.CROWN_WATERMARK_SECRET;
if (shared && (secret === undefined || secret.length < 24)) {
  throw new Error(
    'A shared lab build requires CROWN_WATERMARK_SECRET with at least 24 characters. ' +
      'Store it in your shell or CI secret manager, never in this repository.',
  );
}

const commit = resolveSourceCommit(root);
const listed = spawnSync(
  'git',
  ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', '.'],
  { cwd: root, encoding: 'buffer' },
);
if (listed.status !== 0) throw new Error('Could not enumerate the source snapshot.');
const sourceFiles = listed.stdout
  .toString('utf8')
  .split('\0')
  .filter(Boolean)
  .sort();
const sourceHash = createHash('sha256');
for (const file of sourceFiles) {
  sourceHash.update(file);
  sourceHash.update('\0');
  const path = resolve(root, file);
  sourceHash.update(existsSync(path) ? readFileSync(path) : '<deleted>');
  sourceHash.update('\0');
}
const status = spawnSync('git', ['status', '--porcelain', '--', '.'], {
  cwd: root,
  encoding: 'utf8',
});
if (status.status !== 0) throw new Error('Could not inspect the source worktree.');

const issuedAt = new Date().toISOString();
const nonce = randomBytes(12).toString('hex');
const payload = {
  version: 1,
  recipient,
  commit,
  sourceDigest: sourceHash.digest('hex'),
  dirty: status.stdout.trim() !== '',
  issuedAt,
  nonce,
};
const canonical = JSON.stringify(payload);
const signature =
  secret === undefined
    ? createHash('sha256').update(`unsigned:${canonical}`).digest('hex')
    : createHmac('sha256', secret).update(canonical).digest('hex');
const watermark = {
  ...payload,
  id: `lab-${signature.slice(0, 20)}`,
  signature,
  signed: secret !== undefined,
};

const vite = spawnSync(
  process.execPath,
  [resolve(root, 'node_modules/vite/bin/vite.js'), 'build', '--mode', 'lab', '--outDir', 'dist-lab'],
  {
    cwd: root,
    encoding: 'utf8',
    stdio: 'inherit',
    env: { ...process.env, CROWN_LAB_WATERMARK: JSON.stringify(watermark) },
  },
);
if (vite.status !== 0) process.exit(vite.status ?? 1);

const verifierArgs = [
  resolve(root, 'scripts/verify-production-build.mjs'),
  '--dir',
  'dist-lab',
  '--profile',
  'lab',
  '--expected-watermark',
  watermark.id,
];
if (shared) verifierArgs.push('--require-signed', 'true');
const verifier = spawnSync(process.execPath, verifierArgs, {
  cwd: root,
  stdio: 'inherit',
});
if (verifier.status !== 0) process.exit(verifier.status ?? 1);

if (flag('termux')) {
  const termux = spawnSync(
    process.execPath,
    [
      resolve(root, 'scripts/build-termux.mjs'),
      '--dir',
      'dist-lab',
      '--profile',
      'lab',
    ],
    { cwd: root, stdio: 'inherit' },
  );
  if (termux.status !== 0) process.exit(termux.status ?? 1);
}

console.log(
  `Watermarked lab built for ${recipient}: ${watermark.id} ` +
    `(${watermark.signed ? 'HMAC-signed' : 'unsigned local trace'}).`,
);
