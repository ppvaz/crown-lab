
import { accessSync, constants, realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

/**
 * Where Blender might be, in order, as a pure function of the environment.
 *
 * Separated from the filesystem so the ordering can be tested on any platform — a resolver whose
 * order is only observable on the machine that has Blender is a resolver nobody can check.
 *
 * @param {Record<string, string | undefined>} env
 * @param {string} platform `process.platform`
 * @returns {{ path: string, why: string }[]}
 */
export const blenderCandidates = (env, platform) => {
  const candidates = [];
  if (env.BLENDER_BIN !== undefined && env.BLENDER_BIN !== '') {
    candidates.push({ path: env.BLENDER_BIN, why: '$BLENDER_BIN' });
  }
  candidates.push({ path: 'blender', why: 'on PATH' });
  if (platform === 'darwin') {
    candidates.push({
      path: '/Applications/Blender.app/Contents/MacOS/Blender',
      why: 'the macOS app bundle',
    });
  }
  return candidates;
};

const isExecutable = (path) => {
  if (!path.includes('/')) {
    try {
      execFileSync('which', [path], { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
};

const realPathOf = (path) => {
  try {
    if (!path.includes('/')) {
      const found = execFileSync('which', [path], { encoding: 'utf8', stdio: 'pipe' }).trim();
      return realpathSync(found);
    }
    return realpathSync(path);
  } catch {
    return path;
  }
};

export const resolveBlender = (env = process.env, platform = process.platform) => {
  const candidates = blenderCandidates(env, platform);
  for (const candidate of candidates) {
    if (isExecutable(candidate.path)) return realPathOf(candidate.path);
  }
  const tried = candidates.map((c) => `  ${c.path}  (${c.why})`).join('\n');
  throw new Error(
    `Blender not found. Tried, in order:\n${tried}\n\n` +
      'Set $BLENDER_BIN to the binary inside the app bundle, or symlink it onto PATH.\n' +
      'Only generators need it; `npm run check` does not.',
  );
};

export const blenderVersion = (bin) => {
  const out = execFileSync(bin, ['--version'], { encoding: 'utf8', stdio: 'pipe' });
  const line = out.split('\n')[0].trim();
  return line === '' ? 'unknown' : line;
};
