
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';


const html = readFileSync(join(process.cwd(), 'index.html'), 'utf8');

const PIVOT = { x: -0.4, y: -0.4 } as const;

const ARC_RADIUS = Math.hypot(3.5, 0.9);

const CORE_ACTIONS = ['light', 'heavy', 'guard', 'step'] as const;

const CONDITIONAL_ACTIONS = ['power', 'focus', 'interact'] as const;

const MIN_CENTRE_GAP = 1.27;

const offsetInUnits = (rule: string, property: 'right' | 'bottom'): number => {
  const declaration = rule
    .split(';')
    .map((entry) => entry.trim())
    .find((entry) => entry.slice(0, entry.indexOf(':')).trim() === property);
  if (declaration === undefined) {
    throw new Error(`.touch-button rule has no ${property}: ${rule}`);
  }
  const value = declaration.slice(declaration.indexOf(':') + 1).trim();
  if (value === '0') return 0;
  const scaled = /^calc\(\s*var\(--touch-btn\)\s*\*\s*([\d.]+)\s*\)$/.exec(value);
  if (scaled === null) {
    throw new Error(
      `${property} must be 0 or calc(var(--touch-btn) * N) so the cluster scales as one unit, got: ${value}`,
    );
  }
  return Number.parseFloat(scaled[1]);
};

const ruleFor = (action: string): string => {
  const match = new RegExp(`\\.touch-button--${action}\\s*\\{([^}]*)\\}`).exec(html);
  if (match === null) throw new Error(`no .touch-button--${action} rule in index.html`);
  return match[1];
};

const centreOf = (action: string): { x: number; y: number } => {
  const rule = ruleFor(action);
  return {
    x: offsetInUnits(rule, 'right') + 0.5,
    y: offsetInUnits(rule, 'bottom') + 0.5,
  };
};

const radiusOf = (action: string): number => {
  const centre = centreOf(action);
  return Math.hypot(centre.x - PIVOT.x, centre.y - PIVOT.y);
};

const clusterBox = (): { width: number; height: number } => {
  const match = /\.touch-actions\s*\{[^}]*?width:\s*calc\(\s*var\(--touch-btn\)\s*\*\s*([\d.]+)\s*\)[^}]*?height:\s*calc\(\s*var\(--touch-btn\)\s*\*\s*([\d.]+)\s*\)[^}]*\}/.exec(
    html,
  );
  if (match === null) throw new Error('no .touch-actions rule sizing the box in button units');
  return { width: Number.parseFloat(match[1]), height: Number.parseFloat(match[2]) };
};

const ALL_ACTIONS = [...CORE_ACTIONS, ...CONDITIONAL_ACTIONS];

describe('touch action cluster geometry', () => {
  it('positions every button the markup can show', () => {
    const declared = [...html.matchAll(/data-touch-action="([a-z]+)"/g)].map((m) => m[1]);
    expect([...declared].sort()).toEqual([...ALL_ACTIONS].sort());
    for (const action of declared) expect(() => centreOf(action)).not.toThrow();
  });

  it('keeps the four always-available actions on one arc', () => {
    for (const action of CORE_ACTIONS) {
      expect(radiusOf(action)).toBeCloseTo(ARC_RADIUS, 2);
    }
  });

  it('spreads the arc wide enough to be a sweep rather than a cluster', () => {
    const angles = CORE_ACTIONS.map((action) => {
      const centre = centreOf(action);
      return (Math.atan2(centre.y - PIVOT.y, centre.x - PIVOT.x) * 180) / Math.PI;
    }).sort((a, b) => a - b);
    expect(angles[angles.length - 1] - angles[0]).toBeGreaterThan(45);
    for (let i = 1; i < angles.length; i += 1) {
      expect(angles[i] - angles[i - 1]).toBeGreaterThan(10);
    }
  });

  it('keeps the conditional actions inboard of the arc', () => {
    for (const action of CONDITIONAL_ACTIONS) {
      expect(radiusOf(action)).toBeLessThanOrEqual(ARC_RADIUS - 1);
    }
  });

  it('never lets two buttons touch', () => {
    for (let i = 0; i < ALL_ACTIONS.length; i += 1) {
      for (let j = i + 1; j < ALL_ACTIONS.length; j += 1) {
        const a = centreOf(ALL_ACTIONS[i]);
        const b = centreOf(ALL_ACTIONS[j]);
        const gap = Math.hypot(a.x - b.x, a.y - b.y);
        expect(
          gap,
          `${ALL_ACTIONS[i]} and ${ALL_ACTIONS[j]} are ${gap.toFixed(3)} units apart`,
        ).toBeGreaterThanOrEqual(MIN_CENTRE_GAP);
      }
    }
  });

  it('fits every button inside the cluster box', () => {
    const box = clusterBox();
    for (const action of ALL_ACTIONS) {
      const centre = centreOf(action);
      expect(centre.x, `${action} x`).toBeGreaterThanOrEqual(0.5);
      expect(centre.y, `${action} y`).toBeGreaterThanOrEqual(0.5);
      expect(centre.x, `${action} x`).toBeLessThanOrEqual(box.width - 0.5);
      expect(centre.y, `${action} y`).toBeLessThanOrEqual(box.height - 0.5);
    }
  });

  it('leaves the movement stick room on the narrowest supported phone', () => {
    const viewport = 360;
    const unit = Math.min(0.15 * viewport, 68);
    const stickRight = 22 + Math.min(0.3 * viewport, 150);
    const clusterLeft = viewport - 18 - clusterBox().width * unit;
    expect(clusterLeft - stickRight).toBeGreaterThan(10);
  });
});
