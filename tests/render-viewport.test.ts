
import { publicArchetypeColor } from '../src/render/palette';
import { createWorld } from '../src/sim/encounter';
import { NEUTRAL_INTENT } from '../src/sim/types';
import { PALETTE } from '../src/render/palette';
import type { Palette } from '../src/render/palette';
import { DEFAULT_COMBAT, SLOWMO_PRESETS } from '../src/lab/config';
import { ENCOUNTERS } from '../src/lab/encounters';
import {
  DEFAULT_PRESENTATION_ID,
  PRESENTATION_PRESETS,
  resolve,
  transformPalette,
} from '../src/lab/presentation';
import { drawHud } from '../src/render/hud';
import { AFFORDANCE_ROWS, resolveLayout } from '../src/render/layout';
import { copyFor } from '../src/game/copy';

const copy = copyFor('en');
import { drawDebug } from '../src/render/debug';
import {
  actionBounds,
  fitActionZoom,
  fitZoom,
  READABLE_ZOOM,
  rosterLook,
  rosterZoom,
  gameplayViewMargin,
  makeCamera,
} from '../src/render/iso';
import { boltPath, noise } from '../src/render/lightning';
import { stepWorld } from '../src/sim/world';

const VIEW_W = 1280;
const VIEW_H = 720;
const DPR = 2;

interface Draw {
  what: string;
  x: number;
  y: number;
}

const makeRecorder = () => {
  const draws: Draw[] = [];
  const canvas = { width: VIEW_W * DPR, height: VIEW_H * DPR };
  const target: Record<string, unknown> = {
    canvas,
    measureText: (t: string) => ({ width: t.length * 12 }),
    setTransform: () => {},
    fillText: (t: string, x: number, y: number) => draws.push({ what: `text:${t}`, x, y }),
    fillRect: (x: number, y: number, w: number, h: number) =>
      draws.push({ what: `rect(${w}x${h})`, x, y }),
    strokeRect: (x: number, y: number) => draws.push({ what: 'strokeRect', x, y }),
    moveTo: (x: number, y: number) => draws.push({ what: 'moveTo', x, y }),
    lineTo: (x: number, y: number) => draws.push({ what: 'lineTo', x, y }),
  };
  const ctx = new Proxy(target, {
    get: (obj, prop: string) => (prop in obj ? obj[prop] : () => {}),
    set: (obj, prop: string, value) => {
      obj[prop] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, draws };
};

const pres = resolve(PRESENTATION_PRESETS[DEFAULT_PRESENTATION_ID]);
const pal: Palette = transformPalette({ ...PALETTE }, pres.visual, pres.preserveThreatColors);

const world = () => createWorld(ENCOUNTERS.kernel_guard, DEFAULT_COMBAT, 1);

const camera = () => makeCamera(VIEW_W, VIEW_H);

const frameFor = (
  active: Parameters<typeof resolveLayout>[0]['active'] = {},
  device: 'pointer' | 'touch' = 'pointer',
  viewport = { w: VIEW_W, h: VIEW_H },
) =>
  resolveLayout({
    viewport,
    safe: { top: 0, right: 0, bottom: 0, left: 0 },
    device,
    profile: 'lab',
    active,
  });

const frame = frameFor();
const touchFrame = frameFor({ threat: true }, 'touch');

const offBottom = (draws: Draw[]): Draw[] => draws.filter((d) => d.y > VIEW_H);
const offRight = (draws: Draw[]): Draw[] => draws.filter((d) => d.x > VIEW_W);

describe('the HUD draws inside the viewport on a 2x display', () => {
  it('keeps the health and stamina bars on screen', () => {
    const { ctx, draws } = makeRecorder();

    drawHud(ctx, world(), {
      cfg: DEFAULT_COMBAT,
      pal,
      archetypeColor: publicArchetypeColor,
      pres,
      localPlayer: 0,
      attempt: 1,
      replaying: false,
      viewW: VIEW_W,
      viewH: VIEW_H,
      waveCount: 1,
      frame,
      copy,
      retryHint: 'R to retry',
    });

    expect(offBottom(draws)).toEqual([]);
    expect(draws.length).toBeGreaterThan(0);
  });

  it('keeps the outcome banner clear of the right edge, where the panel overlays the canvas', () => {
    const w = world();
    w.outcome = 'cleared';
    const { ctx, draws } = makeRecorder();

    drawHud(ctx, w, {
      cfg: DEFAULT_COMBAT,
      pal,
      archetypeColor: publicArchetypeColor,
      pres,
      localPlayer: 0,
      attempt: 1,
      replaying: false,
      viewW: VIEW_W,
      viewH: VIEW_H,
      waveCount: 1,
      frame: frameFor({ verdict: true }),
      copy,
      retryHint: 'R to retry',
    });

    const banner = draws.find((d) => d.what === 'text:CLEARED');
    expect(banner).toBeDefined();
    expect(banner!.x).toBeLessThan(VIEW_W / 2);
    expect(offRight(draws)).toEqual([]);
  });

  const bossBarText = `${DEFAULT_COMBAT.enemies.first_blade.maxHp} / ${DEFAULT_COMBAT.enemies.first_blade.maxHp}`;

  it('shows a living boss name and health in a dedicated centred bar', () => {
    const encounter = ENCOUNTERS.first_blade;
    const w = createWorld(encounter, DEFAULT_COMBAT, 1);
    stepWorld(w, [NEUTRAL_INTENT], DEFAULT_COMBAT, SLOWMO_PRESETS.none, encounter);
    const { ctx, draws } = makeRecorder();

    drawHud(ctx, w, {
      cfg: DEFAULT_COMBAT,
      pal,
      archetypeColor: publicArchetypeColor,
      pres,
      localPlayer: 0,
      attempt: 1,
      replaying: false,
      viewW: VIEW_W,
      viewH: VIEW_H,
      waveCount: 1,
      frame: frameFor({ threat: true }),
      copy,
      retryHint: 'R to retry',
    });

    expect(draws.some((draw) => draw.what === 'text:THE FIRST BLADE')).toBe(true);
    expect(draws.some((draw) => draw.what === `text:${bossBarText}`)).toBe(true);
    expect(offRight(draws)).toEqual([]);
    expect(offBottom(draws)).toEqual([]);
  });

  it('keeps a defeat prompt below a living boss bar', () => {
    const encounter = ENCOUNTERS.first_blade;
    const w = createWorld(encounter, DEFAULT_COMBAT, 1);
    stepWorld(w, [NEUTRAL_INTENT], DEFAULT_COMBAT, SLOWMO_PRESETS.none, encounter);
    w.outcome = 'dead';
    const { ctx, draws } = makeRecorder();

    drawHud(ctx, w, {
      cfg: DEFAULT_COMBAT,
      pal,
      archetypeColor: publicArchetypeColor,
      pres,
      localPlayer: 0,
      attempt: 1,
      replaying: false,
      viewW: VIEW_W,
      viewH: VIEW_H,
      waveCount: 1,
      frame: frameFor({ threat: true, verdict: true }),
      copy,
      retryHint: 'R to retry',
    });

    const hp = draws.find((draw) => draw.what === `text:${bossBarText}`);
    const outcome = draws.find((draw) => draw.what === 'text:DEAD');
    expect(hp).toBeDefined();
    expect(outcome).toBeDefined();
    expect(outcome!.y).toBeGreaterThan(hp!.y + 20);
  });

  it('omits the wave label when an encounter has no waves', () => {
    const { ctx, draws } = makeRecorder();

    drawHud(ctx, world(), {
      cfg: DEFAULT_COMBAT,
      pal,
      archetypeColor: publicArchetypeColor,
      pres,
      localPlayer: 0,
      attempt: 1,
      replaying: false,
      viewW: VIEW_W,
      viewH: VIEW_H,
      waveCount: 0,
      frame,
      copy,
      retryHint: 'R to retry',
    });

    const status = draws.find(
      (draw) => draw.what.startsWith('text:attempt ') || /^text:#\d/.test(draw.what),
    );
    expect(status).toBeDefined();
    expect(status!.what).not.toContain('wave');
    expect(status!.what).not.toMatch(/\bw\d/);
  });

  it('keeps every HUD element out of the movement pad, not merely above its top edge', () => {
    const viewW = 768;
    const viewH = 360;
    const padFrame = resolveLayout({
      viewport: { w: viewW, h: viewH },
      safe: { top: 0, right: 0, bottom: 0, left: 0 },
      device: 'touch',
      profile: 'lab',
    });
    const cfg = structuredClone(DEFAULT_COMBAT);
    cfg.power = 'lightning';
    const w = world();
    w.players[0].parryStreak = 4;
    const { ctx, draws } = makeRecorder();

    drawHud(ctx, w, {
      cfg,
      pal,
      archetypeColor: publicArchetypeColor,
      pres,
      localPlayer: 0,
      attempt: 1,
      replaying: false,
      viewW,
      viewH,
      waveCount: 1,
      frame: padFrame,
      touchControls: true,
      showPowerCooldown: false,
      copy,
      retryHint: 'RESTART to retry',
    });

    const stick = padFrame.reserved.stick!;
    const pad = {
      left: stick.x,
      right: stick.x + stick.w,
      top: stick.y,
      bottom: stick.y + stick.h,
    };
    const intruders = draws.filter((draw) => {
      const rect = /^rect\((\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)\)$/.exec(draw.what);
      const box = rect
        ? { w: Number(rect[1]), top: draw.y, bottom: draw.y + Number(rect[2]) }
        : { w: (draw.what.length - 5) * 12, top: draw.y - 9, bottom: draw.y + 3 };
      return (
        draw.x < pad.right &&
        draw.x + box.w > pad.left &&
        box.bottom > pad.top &&
        box.top < pad.bottom
      );
    });

    expect(draws.some((draw) => draw.what === 'text:parry streak 4')).toBe(true);
    expect(intruders).toEqual([]);
    const barHeights = draws
      .map((draw) => /^rect\(\d+(?:\.\d+)?x(\d+)\)$/.exec(draw.what)?.[1])
      .filter((height): height is string => height !== undefined);
    expect(barHeights).not.toContain('4');
    expect(barHeights).toContain('6');
  });

  it('drops the boss bar below the touch toolbar', () => {
    const encounter = ENCOUNTERS.first_blade;
    const w = createWorld(encounter, DEFAULT_COMBAT, 1);
    stepWorld(w, [NEUTRAL_INTENT], DEFAULT_COMBAT, SLOWMO_PRESETS.none, encounter);
    const { ctx, draws } = makeRecorder();

    drawHud(ctx, w, {
      cfg: DEFAULT_COMBAT,
      pal,
      archetypeColor: publicArchetypeColor,
      pres,
      localPlayer: 0,
      attempt: 1,
      replaying: false,
      viewW: VIEW_W,
      viewH: VIEW_H,
      waveCount: 1,
      frame: touchFrame,
      touchControls: true,
      copy,
      retryHint: 'RESTART to retry',
    });

    const toolbarBottom = touchFrame.reserved.controls.y + touchFrame.reserved.controls.h;
    const name = draws.find((draw) => draw.what === 'text:THE FIRST BLADE');
    const bar = draws.find((draw) => draw.what.startsWith('rect(') && draw.y > toolbarBottom);
    expect(name).toBeDefined();
    expect(name!.y - 12).toBeGreaterThan(toolbarBottom);
    expect(bar).toBeDefined();
  });

  it('takes outcome copy from the caller instead of uppercasing the wire token', () => {
    const w = world();
    w.outcome = 'dead';
    const { ctx, draws } = makeRecorder();

    drawHud(ctx, w, {
      cfg: DEFAULT_COMBAT,
      pal,
      archetypeColor: publicArchetypeColor,
      pres,
      localPlayer: 0,
      attempt: 1,
      replaying: false,
      viewW: VIEW_W,
      viewH: VIEW_H,
      waveCount: 1,
      frame: frameFor({ verdict: true }),
      copy,
      retryHint: 'R to retry',
      outcomeLabels: { cleared: 'CLEARED', timeout: 'TIMEOUT', dead: 'SLAIN' },
    });

    expect(draws.some((draw) => draw.what === 'text:SLAIN')).toBe(true);
    expect(draws.some((draw) => draw.what === 'text:DEAD')).toBe(false);
  });
});

describe('the mobile gameplay camera', () => {
  it('uses the compact touch gutter instead of forcing the arena to minimum zoom', () => {
    const cam = makeCamera(768, 360);
    const arena = ENCOUNTERS.first_blade.arena;
    const desktop = fitZoom(cam, arena, gameplayViewMargin(125, false));
    const touch = fitZoom(cam, arena, gameplayViewMargin(125, true));

    expect(gameplayViewMargin(125, true)).toBe(36);
    expect(touch).toBeGreaterThan(desktop * 1.8);
  });
});

describe('the debug overlay draws inside the viewport on a 2x display', () => {
  it('keeps the attack timeline on screen', () => {
    const { ctx, draws } = makeRecorder();

    drawDebug(ctx, world(), camera(), {
      cfg: DEFAULT_COMBAT,
      localPlayer: 0,
      showTimeline: true,
      showStates: false,
      recentOffsets: [-10, 5, 20],
      mastery: null,
      vignette: null,
      frame: frameFor({ instruments: true }),
      railUp: false,
    });

    expect(offBottom(draws)).toEqual([]);
    expect(offRight(draws)).toEqual([]);
    expect(draws.length).toBeGreaterThan(0);
  });

  it('yields the instrument region while the DOM rail is up', () => {
    const { ctx, draws } = makeRecorder();

    drawDebug(ctx, world(), camera(), {
      cfg: DEFAULT_COMBAT,
      localPlayer: 0,
      showTimeline: true,
      showStates: false,
      recentOffsets: [-10, 5, 20],
      mastery: null,
      vignette: null,
      frame: frameFor({ instruments: true }),
      railUp: true,
    });

    expect(draws).toEqual([]);
  });
});

describe('affordance holds one thing at a time', () => {
  const riposting = () => {
    const w = world();
    w.players[0].riposteWindowMs = 240;
    return w;
  };

  const LESSON = 'Tutorial 6/9 (2/3) — Defenda um ataque — segure Shift ou L de frente para o atacante';

  const hudWith = (w: ReturnType<typeof world>, tutorialPrompt: string | null) => {
    const { ctx, draws } = makeRecorder();
    drawHud(ctx, w, {
      cfg: DEFAULT_COMBAT,
      pal,
      archetypeColor: publicArchetypeColor,
      pres,
      localPlayer: 0,
      attempt: 1,
      replaying: false,
      viewW: VIEW_W,
      viewH: VIEW_H,
      waveCount: 1,
      frame,
      copy,
      retryHint: 'R to retry',
      tutorialPrompt,
    });
    return draws;
  };

  it('yields the region to RIPOSTE while its window is open', () => {
    const draws = hudWith(riposting(), LESSON);
    expect(draws.some((d) => d.what === `text:${copy.hud.riposte}`)).toBe(true);
    expect(draws.some((d) => d.what.startsWith('text:Tutorial'))).toBe(false);
  });

  it('draws the lesson again once the window has closed', () => {
    const draws = hudWith(world(), LESSON);
    expect(draws.some((d) => d.what === `text:${copy.hud.riposte}`)).toBe(false);
    expect(draws.some((d) => d.what.startsWith('text:Tutorial'))).toBe(true);
  });

  it('spends every row it has on the lesson instead of cutting it at the first', () => {
    const rows = hudWith(world(), LESSON)
      .filter((d) => d.what.startsWith('text:'))
      .map((d) => ({ text: d.what.slice('text:'.length), y: d.y }))
      .filter((r) => r.text.length > 6 && LESSON.includes(r.text.replace(/…$/, '').trimEnd()));

    expect(rows.length).toBe(AFFORDANCE_ROWS);
    expect(LESSON.startsWith(rows[0].text)).toBe(true);
    expect(rows[1].y).toBeGreaterThan(rows[0].y);
    expect(LESSON.indexOf(rows[1].text.replace(/…$/, '').trimEnd())).toBeGreaterThan(
      rows[0].text.length - 1,
    );
  });
});

describe('framing the fight instead of the room', () => {
  const cam = makeCamera(1440, 900);
  const CONTENT = { w: 1440, h: 900 };

  it('reports nothing to frame in an empty room', () => {
    expect(actionBounds([{ x: 0, y: 0 }], [])).toBeNull();
  });

  it('holds both combatants and the reach between them', () => {
    const bounds = actionBounds([{ x: 0, y: 0 }], [{ pos: { x: 0, y: -3.2 }, reach: 3.5 }]);
    expect(bounds).not.toBeNull();
    expect(bounds!.halfExtents.y).toBeGreaterThanOrEqual(3.3);
    expect(bounds!.center.y).toBeLessThan(0);
  });

  it('pushes in on a duel', () => {
    const arenaZoom = fitZoom(cam, { halfExtents: { x: 10, y: 7 } }, 108, CONTENT);
    const bounds = actionBounds([{ x: 0, y: 0 }], [{ pos: { x: 0, y: -3.2 }, reach: 3.5 }])!;
    const zoom = fitActionZoom(cam, bounds, arenaZoom, 108, CONTENT);
    expect(arenaZoom).toBeLessThan(1.2);
    expect(zoom).toBeGreaterThan(arenaZoom * 1.4);
  });

  it('never pulls out further than the room itself', () => {
    const arenaZoom = fitZoom(cam, { halfExtents: { x: 10, y: 7 } }, 108, CONTENT);
    const spread = actionBounds([{ x: -9, y: -6 }], [
      { pos: { x: 9, y: 6 }, reach: 3 },
      { pos: { x: -9, y: 6 }, reach: 3 },
    ])!;
    expect(fitActionZoom(cam, spread, arenaZoom, 108, CONTENT)).toBe(arenaZoom);
  });

  it('will not push in past the ceiling, however small the fight gets', () => {
    const arenaZoom = fitZoom(cam, { halfExtents: { x: 10, y: 7 } }, 108, CONTENT);
    const nose = actionBounds([{ x: 0, y: 0 }], [{ pos: { x: 0.1, y: 0 }, reach: 0.1 }])!;
    expect(fitActionZoom(cam, nose, arenaZoom, 108, CONTENT, 2.6)).toBe(2.6);
  });

  it('frames a second king even in an empty room', () => {
    expect(actionBounds([{ x: -4, y: 0 }, { x: 4, y: 0 }], [])).not.toBeNull();
    expect(actionBounds([{ x: -4, y: 0 }, { x: 4, y: 0 }], [])!.center).toEqual({ x: 0, y: 0 });
  });
});

describe('one screen, two kings', () => {
  const cam = makeCamera(1440, 900);
  const CONTENT = { w: 1440, h: 900 };
  const ROOM = { halfExtents: { x: 10, y: 7 } };

  it('changes nothing at all with one player', () => {
    const roomFit = fitZoom(cam, ROOM, 108, CONTENT);
    expect(rosterZoom([{ x: 3, y: -2 }], READABLE_ZOOM, roomFit, 108, CONTENT)).toBe(READABLE_ZOOM);
    expect(rosterLook([{ x: 3, y: -2 }])).toEqual({ x: 3, y: -2 });
  });

  it('leaves the preferred zoom alone while both kings fit inside it', () => {
    const roomFit = fitZoom(cam, ROOM, 108, CONTENT);
    const together = [
      { x: -0.6, y: 0 },
      { x: 0.6, y: 0 },
    ];
    expect(rosterZoom(together, roomFit, roomFit, 108, CONTENT)).toBe(roomFit);
  });

  it('pulls back when they walk apart, and only ever back', () => {
    const roomFit = fitZoom(cam, ROOM, 108, CONTENT);
    const near = rosterZoom([{ x: -1, y: 0 }, { x: 1, y: 0 }], READABLE_ZOOM, 0.1, 108, CONTENT);
    const far = rosterZoom([{ x: -30, y: 0 }, { x: 30, y: 0 }], READABLE_ZOOM, 0.1, 108, CONTENT);

    expect(near).toBe(READABLE_ZOOM);
    expect(far).toBeLessThan(READABLE_ZOOM);
    expect(rosterZoom([{ x: -1, y: 0 }, { x: 1, y: 0 }], roomFit, roomFit, 108, CONTENT)).toBe(roomFit);
  });

  it('stops receding at the floor, so two separated kings do not become two specks', () => {
    const roomFit = fitZoom(cam, ROOM, 108, CONTENT);
    const miles = [
      { x: -400, y: -400 },
      { x: 400, y: 400 },
    ];
    expect(rosterZoom(miles, roomFit, roomFit, 108, CONTENT)).toBe(roomFit);
  });

  it('looks at the centre of their box rather than at their centroid', () => {
    const huddle = [
      { x: -6, y: 0 },
      { x: 5.6, y: 0 },
      { x: 6, y: 0 },
    ];
    expect(rosterLook(huddle).x).toBeCloseTo(0, 6);
  });
});

describe('the discharge', () => {
  it('pins a bolt to both of its endpoints', () => {
    const from = { x: 10, y: 10 };
    const to = { x: 200, y: 60 };
    const path = boltPath(from, to, 3, 9, 40);
    expect(path[0]).toEqual(from);
    expect(path[path.length - 1]).toEqual(to);
    expect(path.length).toBe(10);
  });

  it('wanders in the middle, or it is a straight line', () => {
    const path = boltPath({ x: 0, y: 0 }, { x: 300, y: 0 }, 5, 9, 40);
    const middle = path[Math.floor(path.length / 2)];
    expect(Math.abs(middle.y)).toBeGreaterThan(0.5);
  });

  it('is deterministic, so a capture can still be diffed', () => {
    const a = boltPath({ x: 0, y: 0 }, { x: 100, y: 100 }, 7, 6, 20);
    const b = boltPath({ x: 0, y: 0 }, { x: 100, y: 100 }, 7, 6, 20);
    expect(a).toEqual(b);
    expect(boltPath({ x: 0, y: 0 }, { x: 100, y: 100 }, 8, 6, 20)).not.toEqual(a);
  });

  it('keeps its noise in range', () => {
    for (let i = 0; i < 200; i++) {
      const value = noise(i * 1.7, i);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});
