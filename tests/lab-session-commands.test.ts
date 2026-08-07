
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const LAB = readFileSync(join(process.cwd(), 'src/app/lab-commands.ts'), 'utf8');

const dispatcher = (): string => {
  const start = LAB.indexOf('const runLabCommand = (code: string');
  const end = LAB.indexOf('return runLabCommand;', start);
  expect(start).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(start);
  return LAB.slice(start, end);
};

const allowlist = (): string[] => {
  const decl = /const SAFE_DURING_SESSION: ReadonlySet<string> = new Set\(\[([\s\S]*?)\]\)/.exec(LAB);
  expect(decl, 'SAFE_DURING_SESSION is gone or has been renamed').not.toBeNull();
  return [...(decl as RegExpExecArray)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
};

const caseBodies = (): Map<string, string> => {
  const body = dispatcher();
  const labels = [...body.matchAll(/^\s*case '([^']+)':/gm)];
  const bodies = new Map<string, string>();
  labels.forEach((label, i) => {
    const from = label.index + label[0].length;
    const to = i + 1 < labels.length ? labels[i + 1].index : body.indexOf('default:', from);
    bodies.set(label[1], body.slice(from, to));
  });
  return bodies;
};

const MUTATES_THE_WORLD: readonly string[] = [
  'restart(',
  'reconfigure(',
  'applyMode(',
  'cycleMode(',
  'retryRoom(',
  'enterRouteNode(',
  'resetSelections(',
  'toggleRoute(',
  'toggleMazePortalDirection(',
  'startReplay(',
  'seekReplay(',
  'runPicker.click(',
  'setPaused(',
  'stepOnce',
  'flags.invincible',
  'flags.infiniteStamina',
];

describe('the commands a live session admits', () => {
  it('refuses by default rather than by list', () => {
    expect(dispatcher()).toContain("labCoop.playing && !SAFE_DURING_SESSION.has(code)");
  });

  it('admits nothing that rebuilds, restarts, steps or cheats', () => {
    const bodies = caseBodies();
    const offenders = allowlist().flatMap((code) => {
      const body = bodies.get(code) ?? '';
      return MUTATES_THE_WORLD.filter((name) => body.includes(name)).map(
        (name) => `${code} reaches ${name}`,
      );
    });
    expect(offenders).toEqual([]);
  });

  it('names only commands the dispatcher actually has', () => {
    const bodies = caseBodies();
    expect(allowlist().filter((code) => !bodies.has(code))).toEqual([]);
  });

  it('reads the dispatcher it thinks it is reading', () => {
    const bodies = caseBodies();
    expect(bodies.size).toBeGreaterThan(30);
    expect(bodies.get('KeyZ')).toContain('cycleMode(');
    expect(bodies.get('KeyH')).toContain('showHitboxes');
  });
});
