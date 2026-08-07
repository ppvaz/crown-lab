
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import { controlNamesFor, retryHintFor } from '../src/game/controls';
import { TutorialCoach } from '../src/game/tutorial';
import { labCopyFor } from '../src/game/copy';
import { ENCOUNTERS } from '../src/lab/encounters';

const TUTORIAL_ENCOUNTER = Object.values(ENCOUNTERS).find(
  (def) => def.tutorial === 'fundamentals',
)!;


const read = (relative: string): string =>
  readFileSync(join(process.cwd(), relative), 'utf8') as string;

const html = read('index.html');
const gameSource = read('src/app/game.ts');

describe('the touch vocabulary matches the pad', () => {
  const touch = controlNamesFor('touch');

  it('names each combat button exactly as the button is labelled', () => {
    const labelFor = (action: string): string | undefined =>
      new RegExp(`data-touch-action="${action}"[^>]*>([^<]+)<`).exec(html)?.[1]?.trim();

    expect(labelFor('light')).toBe(touch.light);
    expect(labelFor('heavy')).toBe(touch.heavy);
    expect(labelFor('guard')).toBe(touch.guard);
    expect(labelFor('step')).toBe(touch.step);
    expect(labelFor('power')).toBe(touch.power);
    expect(labelFor('focus')).toBe(touch.focus);
    expect(labelFor('interact')).toBe(touch.interact);
  });

  it('names restart as the page control announces itself', () => {
    const label = /<button id="touch-restart"[^>]*aria-label="([^"]+)"/.exec(html)?.[1];
    expect(label?.toUpperCase()).toBe(touch.restart);
  });

  it('never names a key in the touch vocabulary', () => {
    for (const [control, name] of Object.entries(touch)) {
      expect(name, control).not.toMatch(/\b(?:WASD|Shift|Space|mouse|arrow keys)\b/i);
      expect(name, control).not.toMatch(/^[A-Z]$/);
    }
  });
});

describe('the keyboard vocabulary matches the bindings', () => {
  const pointer = controlNamesFor('pointer');

  it('names the restart key the public game actually listens for', () => {
    expect(pointer.restart).toBe('R');
    expect(gameSource).toContain("event.code === 'KeyR'");
  });

  it('keeps the interact verb a key, not a button label', () => {
    expect(pointer.interact).toBe('E');
  });
});

describe('the retry hint', () => {
  it('speaks the device that will press it', () => {
    expect(retryHintFor('touch')).toContain(controlNamesFor('touch').restart);
    expect(retryHintFor('pointer')).toContain(controlNamesFor('pointer').restart);
  });

  it('has no default — the caller always knows the device', () => {
    expect(read('src/render/hud.ts')).not.toMatch(/opts\.retryHint\s*\?\?/);
  });
});

describe('tutorial lessons', () => {
  const firstPrompt = (device: 'touch' | 'pointer'): string | null => {
    const coach = new TutorialCoach(controlNamesFor(device), labCopyFor('en'));
    coach.reset(TUTORIAL_ENCOUNTER, 'none', 'none');
    return coach.prompt;
  };

  it('substitutes the touch vocabulary rather than naming keys', () => {
    const first = firstPrompt('touch');
    expect(first).not.toBeNull();
    expect(first).not.toMatch(/WASD|arrow keys/);
    expect(first).toContain(controlNamesFor('touch').move);
  });

  it('still reads as a keyboard tutorial on a keyboard', () => {
    const first = firstPrompt('pointer');
    expect(first).toContain(controlNamesFor('pointer').move);
  });

  it('writes no key names into the lesson source', () => {
    const source = read('src/game/copy.ts');
    const prompts = [...source.matchAll(/=> `[^`]*\$\{c\.[^`]*`/g)].map((m) => m[0]);
    expect(prompts.length).toBeGreaterThan(5);
    for (const line of prompts) {
      expect(line).not.toMatch(/WASD|arrow keys|left mouse|right mouse|Shift|\bSpace\b/);
    }
  });
});
