
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';


const read = (relative: string): string =>
  readFileSync(join(process.cwd(), relative), 'utf8') as string;

const html = read('index.html');
const iconsSource = read('src/app/icons.ts');

const spriteIds = [...html.matchAll(/<symbol id="i-([a-z-]+)"/g)].map((m) => m[1]);

const unionIds = (() => {
  const start = iconsSource.indexOf('export type IconName =');
  const body = iconsSource.slice(start, iconsSource.indexOf(';', start));
  return [...body.matchAll(/'([a-z-]+)'/g)].map((m) => m[1]);
})();

describe('the icon sprite', () => {
  it('has symbols at all', () => {
    expect(spriteIds.length).toBeGreaterThan(0);
  });

  it('offers exactly the ids the IconName union promises', () => {
    expect([...unionIds].sort()).toEqual([...spriteIds].sort());
  });

  it('covers every glyph the page controls switch between', () => {
    for (const id of ['restart', 'pause', 'play', 'fullscreen', 'fullscreen-exit', 'lab', 'game']) {
      expect(spriteIds, `#i-${id} is missing`).toContain(id);
    }
  });

  it('keeps every symbol on the 24x24 grid the .icon rules assume', () => {
    const boxes = [...html.matchAll(/<symbol id="i-[a-z-]+" viewBox="([^"]+)"/g)].map((m) => m[1]);
    expect(boxes.length).toBe(spriteIds.length);
    for (const box of boxes) expect(box).toBe('0 0 24 24');
  });

  it('draws with stroke only, so `color` alone restyles the whole set', () => {
    const sprite = html.slice(html.indexOf('<svg id="icon-defs"'), html.indexOf('</svg>', html.indexOf('<svg id="icon-defs"')));
    expect(sprite).not.toMatch(/fill="(?!none)[^"]+"/);
    expect(sprite).not.toMatch(/stroke="(?!currentColor)[^"]+"/);
    expect(sprite).not.toMatch(/#[0-9a-fA-F]{3,6}/);
  });

  it('credits the geometry, which is MIT and not ours', () => {
    expect(html).toContain('Tabler Icons');
    expect(read('ICONS.md')).toContain('MIT License');
  });

  it('carries no external asset reference', () => {
    const sprite = html.slice(html.indexOf('<svg id="icon-defs"'), html.indexOf('</svg>', html.indexOf('<svg id="icon-defs"')));
    expect(sprite).not.toContain('http');
    expect(sprite).not.toContain('<image');
  });
});
