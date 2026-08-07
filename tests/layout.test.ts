
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import {
  AFFORDANCE_ROWS,
  contains,
  formFactorOf,
  overlaps,
  regionRow,
  regionRowFits,
  resolveLayout,
  NARRATION_ROWS,
  touchFootprint,
  type LayoutInput,
  type RegionName,
  type Rect,
} from '../src/render/layout';

const html = readFileSync(join(process.cwd(), 'index.html'), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);

const NO_SAFE = { top: 0, right: 0, bottom: 0, left: 0 };
const NOTCH = { top: 47, right: 0, bottom: 34, left: 0 };

const DESKTOP: LayoutInput = {
  viewport: { w: 1440, h: 900 },
  safe: NO_SAFE,
  device: 'pointer',
  profile: 'lab',
};
const PORTRAIT: LayoutInput = {
  viewport: { w: 390, h: 844 },
  safe: NO_SAFE,
  device: 'touch',
  profile: 'game',
};
const LANDSCAPE: LayoutInput = {
  viewport: { w: 844, h: 390 },
  safe: NO_SAFE,
  device: 'touch',
  profile: 'game',
};

const ALL_FORMS: ReadonlyArray<readonly [string, LayoutInput]> = [
  ['desktop', DESKTOP],
  ['portrait', PORTRAIT],
  ['landscape', LANDSCAPE],
];

const placed = (input: LayoutInput): Array<[RegionName, Rect]> =>
  Object.entries(resolveLayout(input).regions) as Array<[RegionName, Rect]>;

describe('form factor', () => {
  it('reads a pointer as desktop regardless of aspect', () => {
    expect(formFactorOf(DESKTOP)).toBe('desktop');
    expect(formFactorOf({ ...DESKTOP, viewport: { w: 800, h: 1200 } })).toBe('desktop');
  });

  it('splits touch by orientation', () => {
    expect(formFactorOf(PORTRAIT)).toBe('portrait');
    expect(formFactorOf(LANDSCAPE)).toBe('landscape');
  });
});

describe('the thumb footprint agrees with the CSS that lays it out', () => {
  const declaration = (selector: string, property: string): string => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const start = html.search(new RegExp(`(^|\\n)\\s*${escaped}\\s*\\{`));
    if (start < 0) throw new Error(`index.html has no ${selector} rule`);
    const open = html.indexOf('{', start);
    const block = html.slice(open + 1, html.indexOf('}', open));
    const found = block
      .split(';')
      .map((entry) => entry.trim())
      .find((entry) => entry.slice(0, entry.indexOf(':')).trim() === property);
    if (found === undefined) throw new Error(`${selector} has no ${property}`);
    return found.slice(found.indexOf(':') + 1).trim();
  };

  it('uses the same stick diameter the CSS does', () => {
    expect(declaration('.touch-stick', 'width')).toBe('min(30vw, 150px)');
    for (const [, input] of ALL_FORMS.slice(1)) {
      const { stickSize } = touchFootprint(input.viewport, input.safe, formFactorOf(input));
      expect(stickSize).toBeCloseTo(Math.min(input.viewport.w * 0.3, 150), 5);
    }
  });

  it('uses the same button clamps the CSS does, in both orientations', () => {
    expect(declaration('.touch-actions', '--touch-btn')).toBe(
      'clamp(46px, min(13vw, 15dvh), 68px)',
    );
    const portraitBlock = html.slice(html.indexOf('@media (orientation: portrait)'));
    expect(portraitBlock).toContain('clamp(46px, min(15vw, 9dvh), 68px)');

    const landscape = touchFootprint(LANDSCAPE.viewport, NO_SAFE, 'landscape');
    expect(landscape.button).toBeCloseTo(
      Math.max(46, Math.min(68, Math.min(844 * 0.13, 390 * 0.15))),
      5,
    );
    const portrait = touchFootprint(PORTRAIT.viewport, NO_SAFE, 'portrait');
    expect(portrait.button).toBeCloseTo(
      Math.max(46, Math.min(68, Math.min(390 * 0.15, 844 * 0.09))),
      5,
    );
  });

  it('keeps the cluster box at 3.6 units — the thumb-arc result, not a layout choice', () => {
    expect(declaration('.touch-actions', 'width')).toBe('calc(var(--touch-btn) * 3.6)');
    const { cluster, button } = touchFootprint(PORTRAIT.viewport, NO_SAFE, 'portrait');
    expect(cluster.w).toBeCloseTo(button * 3.6, 5);
  });

  it('honours the safe-area insets the CSS falls back from', () => {
    const wide = touchFootprint({ w: 844, h: 390 }, { ...NO_SAFE, left: 60, bottom: 50 }, 'landscape');
    expect(wide.stick.x).toBe(60);
    expect(wide.stick.y + wide.stick.h).toBe(390 - 50);
  });

  it('keeps the portrait content box above the pad entirely', () => {
    const frame = resolveLayout(PORTRAIT);
    expect(overlaps(frame.content, frame.reserved.thumbs as Rect)).toBe(false);
  });

  it('lets the landscape content box use the column between the two thumbs', () => {
    const frame = resolveLayout(LANDSCAPE);
    expect(overlaps(frame.content, frame.reserved.thumbs as Rect)).toBe(true);
    expect(overlaps(frame.content, frame.reserved.stick as Rect)).toBe(true);
    expect(frame.content.h).toBeGreaterThan(200);
  });
});

describe('the control row agrees with the CSS that lays it out', () => {
  const rootVar = (name: string, scope = ':root'): number => {
    const start = html.indexOf(`${scope} {`);
    const block = html.slice(start, html.indexOf('}', start));
    const found = /(-?[\d.]+)px/.exec(block.slice(block.indexOf(`${name}:`)));
    if (found === null) throw new Error(`no ${name} under ${scope}`);
    return Number(found[1]);
  };

  it('matches inset + button + inset on a pointer device', () => {
    const expected = rootVar('--control-inset') * 2 + rootVar('--control-size');
    const controls = resolveLayout(DESKTOP).reserved.controls;
    expect(controls.h).toBe(expected);
  });

  it('matches the larger touch button on a phone', () => {
    const touchSize = rootVar('--control-size', 'body.touch-enabled');
    const expected = rootVar('--control-inset') * 2 + touchSize;
    expect(resolveLayout(PORTRAIT).reserved.controls.h).toBe(expected);
    expect(resolveLayout(LANDSCAPE).reserved.controls.h).toBe(expected);
  });
});

describe('regions never overlap', () => {
  const STATES: ReadonlyArray<readonly [string, LayoutInput['active']]> = [
    ['idle', {}],
    ['boss', { threat: true }],
    ['defeat', { verdict: true }],
    ['defeat under a boss', { verdict: true, threat: true }],
    ['dialogue', { narration: true }],
    ['dialogue beside a boss', { narration: true, threat: true }],
  ];

  for (const [formName, input] of ALL_FORMS) {
    for (const [stateName, active] of STATES) {
      it(`${formName} / ${stateName}`, () => {
        const regions = placed({ ...input, active });
        for (let i = 0; i < regions.length; i += 1) {
          for (let j = i + 1; j < regions.length; j += 1) {
            const [aName, a] = regions[i];
            const [bName, b] = regions[j];
            if (aName === 'instruments' || bName === 'instruments') continue;
            if (aName === 'thumbs' || bName === 'thumbs') continue;
            expect(overlaps(a, b), `${aName} overlaps ${bName}`).toBe(false);
          }
        }
      });
    }
  }

  for (const [formName, input] of ALL_FORMS.slice(1)) {
    for (const [stateName, active] of STATES) {
      it(`${formName} / ${stateName} clears both thumbs`, () => {
        const frame = resolveLayout({ ...input, active });
        for (const [name, region] of placed({ ...input, active })) {
          if (name === 'thumbs' || name === 'instruments') continue;
          expect(overlaps(region, frame.reserved.stick as Rect), `${name} hits the stick`).toBe(
            false,
          );
          expect(overlaps(region, frame.reserved.cluster as Rect), `${name} hits the cluster`).toBe(
            false,
          );
        }
      });
    }
  }

  it('keeps every gameplay region clear of the desktop instrument rail', () => {
    const frame = resolveLayout({ ...DESKTOP, active: { instruments: true, threat: true } });
    const rail = frame.reserved.instruments;
    expect(rail).not.toBeNull();
    for (const [name, region] of placed({ ...DESKTOP, active: { instruments: true, threat: true } })) {
      if (name === 'instruments') continue;
      expect(overlaps(region, rail as Rect), `${name} runs under the rail`).toBe(false);
    }
  });
});

describe('suppression', () => {
  it('removes objective when the run ends, rather than drawing under the verdict', () => {
    for (const [name, input] of ALL_FORMS) {
      const frame = resolveLayout({ ...input, active: { verdict: true } });
      expect(frame.regions.verdict, name).toBeDefined();
      expect(frame.regions.objective, `${name}: objective survived the verdict`).toBeUndefined();
    }
  });

  it('removes affordance while a dialogue frame is open', () => {
    for (const [name, input] of ALL_FORMS) {
      const frame = resolveLayout({ ...input, active: { narration: true } });
      expect(frame.regions.narration, name).toBeDefined();
      expect(frame.regions.affordance, `${name}: affordance survived narration`).toBeUndefined();
    }
  });

  it('makes the touch instrument surface a sheet that suppresses everything', () => {
    for (const input of [PORTRAIT, LANDSCAPE]) {
      const frame = resolveLayout({ ...input, active: { instruments: true, threat: true } });
      const sheet = frame.regions.instruments as Rect;
      expect(sheet.x).toBe(0);
      expect(sheet.w).toBe(input.viewport.w);
      expect(sheet.y).toBe(frame.reserved.controls.y + frame.reserved.controls.h);
      expect(sheet.y + sheet.h).toBe(input.viewport.h - input.safe.bottom);
      expect(frame.regions.vitals).toBeUndefined();
      expect(frame.regions.threat).toBeUndefined();
      expect(frame.regions.affordance).toBeUndefined();
    }
  });

  it('keeps the desktop rail an overlay, not a sheet', () => {
    const frame = resolveLayout({ ...DESKTOP, active: { instruments: true } });
    expect(frame.regions.vitals).toBeDefined();
  });
});

describe('the same regions exist everywhere', () => {
  it('places vitals, affordance and objective in every form factor', () => {
    for (const [name, input] of ALL_FORMS) {
      const frame = resolveLayout(input);
      expect(frame.regions.vitals, `${name}: no vitals`).toBeDefined();
      expect(frame.regions.affordance, `${name}: no affordance`).toBeDefined();
      expect(frame.regions.objective, `${name}: no objective`).toBeDefined();
    }
  });

  it('moves vitals off the bottom in landscape, where the corner is a thumb', () => {
    const landscape = resolveLayout(LANDSCAPE);
    const portrait = resolveLayout(PORTRAIT);
    const vitals = landscape.regions.vitals as Rect;
    expect(vitals.y).toBeCloseTo(landscape.content.y, 5);
    const portraitVitals = portrait.regions.vitals as Rect;
    expect(portraitVitals.y + portraitVitals.h).toBeCloseTo(
      portrait.content.y + portrait.content.h,
      5,
    );
  });

  it('collapses objective to a chip in portrait and keeps the full column elsewhere', () => {
    expect((resolveLayout(PORTRAIT).regions.objective as Rect).w).toBeLessThan(200);
    expect((resolveLayout(DESKTOP).regions.objective as Rect).w).toBeGreaterThanOrEqual(300);
    expect((resolveLayout(LANDSCAPE).regions.objective as Rect).w).toBeGreaterThan(200);
  });

  it('sizes the dialogue box to the rows it claims to hold', () => {

    for (const [name, input] of ALL_FORMS) {
      const frame = resolveLayout({ ...input, active: { narration: true } });
      const box = frame.regions.narration as Rect;
      const base = frame.type.base;
      expect(regionRowFits(frame, box, NARRATION_ROWS + 1, base), `${name}: hint`).toBe(true);
    }
  });

  it('puts the landscape dialogue in a centre band rather than a bottom frame', () => {
    const frame = resolveLayout({ ...LANDSCAPE, active: { narration: true } });
    const band = frame.regions.narration as Rect;
    const centre = frame.content.y + frame.content.h / 2;
    expect(band.y + band.h / 2).toBeCloseTo(centre, 0);
    expect(overlaps(band, frame.reserved.stick as Rect)).toBe(false);
    expect(overlaps(band, frame.reserved.cluster as Rect)).toBe(false);
  });
});

describe('the focus rule', () => {
  const nearestCorner = (r: Rect, x: number, y: number): number =>
    Math.hypot(
      Math.max(r.x - x, 0, x - (r.x + r.w)),
      Math.max(r.y - y, 0, y - (r.y + r.h)),
    );

  it('keeps affordance inside the useful field of view', () => {
    for (const [name, input] of ALL_FORMS) {
      const frame = resolveLayout(input);
      const region = frame.regions.affordance as Rect;
      expect(
        nearestCorner(region, frame.gaze.x, frame.gaze.y),
        `${name}: a time-critical prompt costs a saccade`,
      ).toBeLessThanOrEqual(frame.gaze.focusRadius);
    }
  });

  it('gives affordance room for every row it claims to hold', () => {
    for (const [name, input] of ALL_FORMS) {
      const frame = resolveLayout(input);
      const region = frame.regions.affordance as Rect;
      const lastBaseline = regionRow(frame, region, AFFORDANCE_ROWS - 1, frame.type.base);
      expect(
        lastBaseline + frame.type.base * 0.25,
        `${name}: row ${AFFORDANCE_ROWS - 1} of the lesson falls out of its region`,
      ).toBeLessThanOrEqual(region.y + region.h);
      expect(regionRowFits(frame, region, AFFORDANCE_ROWS - 1, frame.type.base)).toBe(true);
    }
  });

  it('keeps objective out of it, so statistics are not parked on the fight', () => {
    for (const [name, input] of ALL_FORMS) {
      const frame = resolveLayout(input);
      const region = frame.regions.objective as Rect;
      expect(
        nearestCorner(region, frame.gaze.x, frame.gaze.y),
        `${name}: the quest column is sitting in the player's foveal field`,
      ).toBeGreaterThan(0);
    }
  });
});

describe('every region stays on screen', () => {
  const VIEWPORTS: ReadonlyArray<readonly [string, LayoutInput]> = [
    ...ALL_FORMS,
    ['narrow portrait', { ...PORTRAIT, viewport: { w: 360, h: 640 } }],
    ['portrait with a notch', { ...PORTRAIT, safe: NOTCH }],
    ['landscape with a notch', { ...LANDSCAPE, safe: { top: 0, right: 47, bottom: 21, left: 47 } }],
    ['small laptop', { ...DESKTOP, viewport: { w: 1280, h: 720 } }],
  ];

  for (const [name, input] of VIEWPORTS) {
    it(name, () => {
      const frame = resolveLayout({ ...input, active: { threat: true } });
      const screen: Rect = { x: 0, y: 0, ...input.viewport };
      for (const [region, box] of placed({ ...input, active: { threat: true } })) {
        expect(contains(screen, box), `${region} leaves the viewport`).toBe(true);
        expect(box.w, `${region} has no width`).toBeGreaterThan(0);
        expect(box.h, `${region} has no height`).toBeGreaterThan(0);
      }
      expect(frame.content.w).toBeGreaterThan(0);
      expect(frame.content.h).toBeGreaterThan(0);
    });
  }

  it('keeps content clear of the safe-area insets', () => {
    const frame = resolveLayout({ ...PORTRAIT, safe: NOTCH });
    expect(frame.content.y).toBeGreaterThanOrEqual(NOTCH.top);
    expect(frame.content.y + frame.content.h).toBeLessThanOrEqual(844 - NOTCH.bottom);
  });
});

describe('the type scale', () => {
  it('replaces the literals with something a device class can grow', () => {
    expect(resolveLayout(PORTRAIT).type.base).toBeGreaterThan(13);
    expect(resolveLayout(DESKTOP).type.base).toBeGreaterThan(13);
    expect(resolveLayout(PORTRAIT).type.display).toBeGreaterThan(20);
  });
});
