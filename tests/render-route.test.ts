
import { afterEach, describe, expect, it } from 'vitest';

import { DEFAULT_COMBAT } from '../src/lab/config';
import { ENCOUNTERS } from '../src/lab/encounters';
import { PALETTE } from '../src/render/palette';
import type { World } from '../src/sim/types';
import { createWorld } from '../src/sim/encounter';
import { FIRST_CROWN, createRouteState, routeNode } from '../src/game/route';
import { makeCamera } from '../src/render/iso';
import { resolveLayout } from '../src/render/layout';
import { drawRoute, routeFloorPads } from '../src/render/route';
import { UI_ELEMENTS } from '../src/render/ui-elements';
import { setUiProbe, type UiRect } from '../src/render/ui-probe';

const stubCtx = (calls?: string[]) =>
  ({
    canvas: { width: 1440, height: 900 },
    font: '13px ui-monospace',
    textAlign: 'left' as CanvasTextAlign,
    textBaseline: 'alphabetic' as CanvasTextBaseline,
    globalAlpha: 1,
    measureText: (text: string) => ({
      width: text.length * 7.2,
      actualBoundingBoxAscent: 9,
      actualBoundingBoxDescent: 3,
    }),
    save: () => calls?.push('save'),
    restore: () => calls?.push('restore'),
    beginPath: () => calls?.push('beginPath'),
    moveTo: () => calls?.push('moveTo'),
    lineTo: () => calls?.push('lineTo'),
    closePath: () => calls?.push('closePath'),
    ellipse: () => {},
    stroke: () => calls?.push('stroke'),
    fill: () => calls?.push('fill'),
    fillText: () => {},
  }) as unknown as CanvasRenderingContext2D;

const DESKTOP = resolveLayout({
  viewport: { w: 1440, h: 900 },
  safe: { top: 0, right: 0, bottom: 0, left: 0 },
  device: 'pointer',
  profile: 'lab',
});

const draw = (
  index: number,
  { atExit = false, outcome = 'running' as World['outcome'], verb = 'E' } = {},
) => {
  const state = createRouteState();
  state.index = index;
  state.furthest = index;
  const node = routeNode(FIRST_CROWN, state);
  const world = createWorld(ENCOUNTERS[node.encounterId], DEFAULT_COMBAT, 1);
  world.outcome = outcome;
  if (atExit && node.exitAt !== null) world.players[0].pos = { ...node.exitAt };

  const reports: UiRect[] = [];
  setUiProbe((rect) => reports.push(rect));
  const ctx = stubCtx();
  const cam = makeCamera(1440, 900);
  cam.arena = world.arena;
  drawRoute(ctx, world, cam, { ...PALETTE }, FIRST_CROWN, state, DESKTOP, verb);
  for (const pad of routeFloorPads(ctx, world, cam, { ...PALETTE }, FIRST_CROWN, state, DESKTOP)) {
    pad.draw();
  }
  setUiProbe(null);

  return {
    reports,
    ids: new Set(reports.map((r) => r.id)),
    text: (id: string) =>
      reports
        .filter((r) => r.id === id)
        .map((r) => r.text)
        .join(' '),
  };
};

afterEach(() => setUiProbe(null));

describe('the opening rung, which has no enemies on purpose', () => {
  const court = draw(0);

  it('names the door out of a room the player would otherwise call empty', () => {
    expect(ENCOUNTERS.wayfarer_court.waves).toHaveLength(0);
    expect(court.ids.has('route.exit.label')).toBe(true);
    expect(court.text('route.exit.label')).toBe('THE GUARDROOM');
  });

  it('says where on the ladder this is, and what to do about it', () => {
    expect([...court.ids].some((id) => id.startsWith('route.header'))).toBe(false);
    expect(court.ids.has('route.objective.text')).toBe(false);
  });

  it('stays silent about the door until the player is standing on it', () => {
    expect(court.ids.has('route.prompt.text')).toBe(false);
    expect(draw(0, { atExit: true }).text('route.prompt.text')).toBe('E  ENTER THE GUARDROOM');
  });
});

describe('a combat rung', () => {
  const floorPadStrokes = (outcome: World['outcome']): number => {
    const state = createRouteState();
    state.index = 1;
    state.furthest = 1;
    const node = routeNode(FIRST_CROWN, state);
    const world = createWorld(ENCOUNTERS[node.encounterId], DEFAULT_COMBAT, 1);
    world.outcome = outcome;
    const calls: string[] = [];
    const ctx = stubCtx(calls);
    const cam = makeCamera(1440, 900);
    cam.arena = world.arena;
    routeFloorPads(ctx, world, cam, { ...PALETTE }, FIRST_CROWN, state, DESKTOP)[0].draw();
    return calls.filter((call) => call === 'stroke').length;
  };

  it('draws the locked door while the room is still live', () => {
    const fighting = draw(1, { atExit: true });
    expect(fighting.text('route.exit.label')).toBe('THE DOG-LEG PASSAGE');
    expect(fighting.text('route.objective.text')).toBe('THE GUARDROOM — clear the room');
    expect(fighting.text('route.prompt.text')).toBe('THE DOG-LEG PASSAGE  LOCKED');
    expect(floorPadStrokes('running')).toBe(1);
  });

  it('opens the same door once it is cleared', () => {
    const cleared = draw(1, { atExit: true, outcome: 'cleared' });
    expect(cleared.text('route.prompt.text')).toBe('E  ENTER THE DOG-LEG PASSAGE');
    expect(floorPadStrokes('cleared')).toBe(1);
  });

  it('asks the caller what this device calls the button', () => {
    const pad = draw(1, { atExit: true, outcome: 'cleared', verb: 'ACT' });
    expect(pad.text('route.prompt.text')).toContain('ACT');
    expect(pad.text('route.prompt.text')).not.toContain('E  ');
  });
});

describe('the last rung, which has no door', () => {
  const lastIndex = FIRST_CROWN.nodes.length - 1;
  const last = draw(lastIndex);

  it('draws no exit and no prompt', () => {
    expect(
      routeNode(FIRST_CROWN, { ...createRouteState(), index: lastIndex }).exitAt,
    ).toBeNull();
    expect(last.ids.has('route.exit.label')).toBe(false);
    expect(last.ids.has('route.prompt.text')).toBe(false);
  });

  it('still says the room is the end of the ladder', () => {
    expect(last.text('route.objective.text')).toBe('THE FIRST BLADE — end it');
    expect([...last.ids].some((id) => id.startsWith('route.header'))).toBe(false);
  });
});

describe('what the probe can see', () => {
  it('produces every element this renderer declares', () => {
    const declared = UI_ELEMENTS.filter((e) => e.owner === 'render/route.ts').map((e) => e.id);
    expect(declared.length).toBeGreaterThan(0);

    const produced = new Set<string>();
    for (const state of [draw(0), draw(1, { atExit: true }), draw(6)]) {
      state.ids.forEach((id) => produced.add(id));
    }
    for (const id of declared) expect(produced.has(id), id).toBe(true);
  });

  it('reports each wrapped prompt row separately, so none is measured for the others', () => {
    const rows = draw(1, { atExit: true, outcome: 'cleared' }).reports.filter(
      (r) => r.id === 'route.prompt.text',
    );
    expect(new Set(rows.map((r) => r.instance)).size).toBe(rows.length);
  });
});
