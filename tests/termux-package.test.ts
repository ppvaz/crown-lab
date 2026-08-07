
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';


const root = decodeURIComponent(new URL('..', import.meta.url).pathname);

let work = '';
let gamePkg = '';
let labPkg = '';

const build = (profile: 'game' | 'lab'): string => {
  const dist = join(work, `dist-${profile}`);
  mkdirSync(join(dist, 'assets'), { recursive: true });
  writeFileSync(join(dist, 'index.html'), '<!doctype html><title>payload</title>');
  writeFileSync(join(dist, 'assets', 'app.js'), 'export const marker = 1;\n');
  if (profile === 'lab') {
    writeFileSync(join(dist, 'lab-watermark.json'), JSON.stringify({ id: 'lab-test' }));
  }

  const out = join(work, `${profile}.run`);
  execFileSync(
    process.execPath,
    [join(root, 'scripts/build-termux.mjs'), '--dir', dist, '--profile', profile, '--out', out],
    { cwd: root },
  );
  return out;
};

beforeAll(() => {
  work = mkdtempSync(join(tmpdir(), 'termux-package-'));
  gamePkg = build('game');
  labPkg = build('lab');
});

afterAll(() => {
  if (work !== '') rmSync(work, { recursive: true, force: true });
});

const install = (pkg: string, home: string): string =>
  execFileSync('bash', [pkg], {
    encoding: 'utf8',
    env: { ...process.env, KING_GAME_HOME: home, KING_GAME_INSTALL_ONLY: '1' },
  });

const launcher = (pkg: string): string =>
  readFileSync(pkg, 'latin1').split('__KING_GAME_ARCHIVE_BELOW__')[0];

describe('the Termux package', () => {
  it('extracts its payload under a content-addressed directory', () => {
    const home = join(work, 'home-install');
    const appDir = install(gamePkg, home).trim().split('\n').pop() ?? '';

    expect(appDir.startsWith(home)).toBe(true);
    expect(existsSync(join(appDir, 'index.html'))).toBe(true);
    expect(existsSync(join(appDir, 'assets', 'app.js'))).toBe(true);
  });

  it('reuses an existing install instead of extracting twice', () => {
    const home = join(work, 'home-reuse');
    const first = install(gamePkg, home).trim().split('\n').pop() ?? '';
    writeFileSync(join(first, 'assets', 'local-note.txt'), 'kept');

    const second = install(gamePkg, home).trim().split('\n').pop() ?? '';

    expect(second).toBe(first);
    expect(existsSync(join(first, 'assets', 'local-note.txt'))).toBe(true);
  });

  it('removes previous installs but refuses to touch anything else', () => {
    const home = join(work, 'home-prune');
    const appDir = install(gamePkg, home).trim().split('\n').pop() ?? '';
    const bundleId = appDir.split('/').pop() ?? '';
    const dataRoot = appDir.slice(0, appDir.lastIndexOf('/'));

    const stale = join(dataRoot, 'a'.repeat(bundleId.length));
    const halfWritten = join(dataRoot, 'b'.repeat(bundleId.length));
    const foreign = join(dataRoot, 'notes-i-care-about');
    for (const dir of [stale, halfWritten, foreign]) mkdirSync(dir, { recursive: true });
    writeFileSync(join(stale, 'index.html'), 'an older build');
    writeFileSync(join(foreign, 'index.html'), 'not ours');

    const output = install(gamePkg, home);

    expect(existsSync(stale)).toBe(false);
    expect(output).toContain('a'.repeat(bundleId.length));
    expect(existsSync(halfWritten)).toBe(true);
    expect(existsSync(join(foreign, 'index.html'))).toBe(true);
    expect(existsSync(join(appDir, 'index.html'))).toBe(true);
  });

  it('gives the lab and the game separate ports and separate data roots', () => {
    expect(launcher(gamePkg)).toContain('KING_GAME_PORT:-5173');
    expect(launcher(labPkg)).toContain('KING_GAME_PORT:-5174');
    expect(launcher(gamePkg)).toContain('/.local/share/the-last-king');
    expect(launcher(labPkg)).toContain('/.local/share/crown-lab');
  });

  it('keeps both profiles installed even when KING_GAME_HOME is shared', () => {
    const home = join(work, 'home-parallel');
    const gameDir = install(gamePkg, home).trim().split('\n').pop() ?? '';
    const labDir = install(labPkg, home).trim().split('\n').pop() ?? '';

    expect(gameDir).toContain('/the-last-king/');
    expect(labDir).toContain('/crown-lab/');
    expect(existsSync(join(gameDir, 'index.html'))).toBe(true);
    expect(existsSync(join(labDir, 'index.html'))).toBe(true);
  });
});
