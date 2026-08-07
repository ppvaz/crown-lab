
import { describe, expect, it } from 'vitest';
import { LOCALES, copyFor, localeFrom } from '../src/game/copy';

describe('locale detection', () => {
  it('lands on English whatever the browser asks for', () => {
    expect(localeFrom(['pt-BR', 'en'])).toBe('en');
    expect(localeFrom(['en-GB', 'fr'])).toBe('en');
    expect(localeFrom([])).toBe('en');
    expect(localeFrom(['ja', 'de'])).toBe('en');
  });
});

describe('the copy table', () => {
  it('leaves nothing empty', () => {
    for (const locale of LOCALES) {
      const copy = copyFor(locale);
      const walk = (value: unknown, path: string): void => {
        if (typeof value === 'string') expect(value.length, `${locale} ${path}`).toBeGreaterThan(0);
        else if (typeof value === 'object' && value !== null) {
          for (const [k, v] of Object.entries(value)) walk(v, `${path}.${k}`);
        }
      };
      walk(copy, locale);
    }
  });

  it('carries no Portuguese remnant in any string', () => {
    const walk = (value: unknown, path: string): void => {
      if (typeof value === 'string') {
        expect(value, path).not.toMatch(/[áéíóúâêôãõçÁÉÍÓÚÂÊÔÃÕÇ]/);
      } else if (typeof value === 'object' && value !== null) {
        for (const [k, v] of Object.entries(value)) walk(v, `${path}.${k}`);
      }
    };
    walk(copyFor('en'), 'en');
  });
});

describe('the retry line', () => {
  it('is built from the restart control', () => {
    const copy = copyFor('en');
    expect(copy.hud.retry(copy.controls.touch.restart)).toContain(copy.controls.touch.restart);
    expect(copy.hud.retry(copy.controls.pointer.restart)).toContain(
      copy.controls.pointer.restart,
    );
  });
});
