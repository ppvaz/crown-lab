import { mkdir, writeFile } from 'node:fs/promises';
import process from 'node:process';
import { launchChrome, startViteServer, waitForServer } from './lib/harness.mjs';
import { listArg } from './lib/args.mjs';

/** @typedef {import('../src/render/layout').LayoutInput} LayoutInput */

const SHOT_DIR = 'captures/ui-audit';
const REPORT = 'captures/ui-audit/report.json';

const FORMS = {
  desktop: {
    label: 'desktop',
    css: [1440, 900],
    mm: [331, 207],
    distanceMm: 500,
    touch: false,
    insets: { top: 0, right: 0, bottom: 0, left: 0 },
  },
  'desktop-small': {
    label: 'desktop-small',
    css: [1280, 720],
    mm: [294, 165],
    distanceMm: 500,
    touch: false,
    insets: { top: 0, right: 0, bottom: 0, left: 0 },
  },
  'phone-portrait': {
    label: 'phone-portrait',
    css: [390, 844],
    mm: [71.5, 154.7],
    distanceMm: 300,
    touch: true,
    insets: { top: 47, right: 0, bottom: 34, left: 0 },
  },
  'phone-portrait-narrow': {
    label: 'phone-portrait-narrow',
    css: [360, 740],
    mm: [64.6, 132.8],
    distanceMm: 300,
    touch: true,
    insets: { top: 24, right: 0, bottom: 16, left: 0 },
  },
  'phone-landscape': {
    label: 'phone-landscape',
    css: [844, 390],
    mm: [154.7, 71.5],
    distanceMm: 300,
    touch: true,
    insets: { top: 0, right: 47, bottom: 21, left: 47 },
  },
};

const THRESHOLDS = {
  textArcminWarn: 20,
  textArcminFail: 16,
  targetMmWarn: 9,
  targetMmFail: 7,
  targetCssFail: 24,
  overlapNoiseMm2: 0.5,
};

const CONTAINS = [
  ['dom.panel', 'dom.panel.readout'],
  ['dom.panel', 'dom.lab.action'],
  ['dom.panel', 'dom.coop.code'],
  ['dom.toolbar', 'dom.fps-meter'],
  ['dom.toolbar', 'dom.toolbar.encounter'],
  ['dom.toolbar', 'dom.toolbar.restart'],
  ['dom.toolbar', 'dom.toolbar.pause'],
  ['dom.toolbar', 'dom.toolbar.viewmode'],
  ['dom.toolbar', 'dom.toolbar.fullscreen'],
  ['travel.dialogue.box', 'travel.dialogue.speaker'],
  ['travel.dialogue.box', 'travel.dialogue.text'],
  ['travel.dialogue.box', 'travel.dialogue.hint'],
  ['herald.dialogue.box', 'herald.dialogue.speaker'],
  ['herald.dialogue.box', 'herald.dialogue.text'],
  ['herald.dialogue.box', 'herald.dialogue.hint'],
  ['envoy.dialogue.box', 'envoy.dialogue.speaker'],
  ['envoy.dialogue.box', 'envoy.dialogue.text'],
  ['envoy.dialogue.box', 'envoy.dialogue.hint'],
  ['envoy.dialogue.box', 'envoy.dialogue.aside'],
  ['envoy.dialogue.box', 'envoy.dialogue.keys'],
];

const nested = (a, b) =>
  CONTAINS.some(([outer, inner]) => (a === outer && b === inner) || (b === outer && a === inner));

const DOM_SELECTORS = {
  'dom.panel': '#panel',
  'dom.panel.readout': '#panel-readout',
  'dom.lab.action': '.lab-action',
  'dom.coop.code': '#coop-code',
  'dom.fps-meter': '#fps-meter',
  'dom.toolbar': '.page-controls',
  'dom.toolbar.encounter': '#touch-encounter',
  'dom.toolbar.restart': '#touch-restart',
  'dom.toolbar.pause': '#touch-pause',
  'dom.toolbar.viewmode': '#touch-view-mode',
  'dom.toolbar.fullscreen': '#touch-fullscreen',
  'dom.stick': '.touch-stick',
  'dom.action': '[data-touch-action]',
};

const instrumentsUp = () => {
  const panel = document.getElementById('panel');
  return panel !== null && !panel.hidden && panel.getBoundingClientRect().width > 0;
};

const measureDom = (selectors) => {
  const out = [];
  for (const [id, selector] of Object.entries(selectors)) {
    const nodes = [...document.querySelectorAll(selector)];
    for (const node of nodes) {
      const visible = node.checkVisibility?.({ checkOpacity: false, checkVisibilityCSS: true });
      if (visible === false) continue;
      const r = node.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;

      let clip = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
      for (let el = node.parentElement; el !== null; el = el.parentElement) {
        const overflow = getComputedStyle(el).overflowY;
        if (overflow !== 'auto' && overflow !== 'scroll' && overflow !== 'hidden') continue;
        const box = el.getBoundingClientRect();
        clip = {
          left: Math.max(clip.left, box.left),
          top: Math.max(clip.top, box.top),
          right: Math.min(clip.right, box.right),
          bottom: Math.min(clip.bottom, box.bottom),
        };
      }
      const x = Math.max(r.left, clip.left);
      const y = Math.max(r.top, clip.top);
      const w = Math.min(r.right, clip.right) - x;
      const h = Math.min(r.bottom, clip.bottom) - y;
      if (w <= 0 || h <= 0) continue;

      const interactive = node.matches('button, select, [data-touch-action], .touch-stick');
      let blockedBy = null;
      if (interactive) {
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        if (hit === null) blockedBy = 'nothing';
        else if (!node.contains(hit) && hit !== node) {
          blockedBy = `${hit.tagName.toLowerCase()}${hit.id ? `#${hit.id}` : ''}`;
        }
      }

      out.push({
        id,
        blockedBy,
        instance: node.dataset?.touchAction ?? node.id ?? node.textContent?.trim().slice(0, 24),
        x,
        y,
        w,
        h,
        layer: 'dom',
        interactive,
        text: node.tagName === 'SELECT' ? undefined : node.textContent?.trim().slice(0, 48),
      });
    }
  }
  return out;
};

const installProbe = async () => {
  const store = (window.__uiAudit ??= { rects: [] });
  store.rects = [];
  const probe = await import('/src/render/ui-probe.ts');
  probe.setUiProbe((rect) => {
    store.rects.push({ ...rect, synthetic: store.synthetic === true });
  });
  return true;
};

const collectProbe = ({ windowMs, syntheticOnly }) => {
  const store = window.__uiAudit;
  const all = (store?.rects ?? []).filter((r) => (syntheticOnly ? r.synthetic === true : true));
  if (all.length === 0) return [];
  const newest = Math.max(...all.map((r) => r.t));
  const byKey = new Map();
  for (const r of all) {
    if (r.t < newest - windowMs) continue;
    byKey.set(`${r.id}#${r.instance ?? ''}`, r);
  }
  return [...byKey.values()];
};

const renderSynthetic = async (spec) => {
  const [
    { createWorld },
    { stepPublicWorld },
    profile,
    { drawHud },
    { drawTravel },
    { drawRoute, routeFloorPads },
    { drawDebug },
    { drawScene },
    iso,
    travelMod,
    routeMod,
    { cloneBank },
    { PUBLIC_MODELS },
    { LAB_ROOMS },
    { labArchetypeColor },
  ] = await Promise.all([
    import('/src/sim/encounter.ts'),
    import('/src/sim/world.ts'),
    import('/src/game/public-profile.ts'),
    import('/src/render/hud.ts'),
    import('/src/render/travel.ts'),
    import('/src/render/route.ts'),
    import('/src/render/debug.ts'),
    import('/src/render/draw.ts'),
    import('/src/render/iso.ts'),
    import('/src/game/travel.ts'),
    import('/src/game/route.ts'),
    import('/src/render/models.ts'),
    import('/src/render/cast/index-public.ts'),
    import('/src/render/rooms/index-lab.ts'),
    import('/src/render/palette-lab.ts'),
  ]);
  const { PALETTE } = await import('/src/render/palette.ts');
  const { resolveLayout } = await import('/src/render/layout.ts');
  const { APOTHEOSIS_OFF } = await import('/src/render/apotheosis/config.ts');

  const stage = document.getElementById('stage');
  const gameCanvas = document.getElementById('view');
  let overlay = document.getElementById('__ui-audit-overlay');
  if (overlay === null) {
    overlay = document.createElement('canvas');
    overlay.id = '__ui-audit-overlay';
    overlay.style.cssText =
      'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:0';
    gameCanvas.after(overlay);
  }
  const dpr = window.devicePixelRatio || 1;
  const viewW = stage.clientWidth;
  const viewH = stage.clientHeight;
  /** @type {HTMLCanvasElement} */ (overlay).width = Math.round(viewW * dpr);
  /** @type {HTMLCanvasElement} */ (overlay).height = Math.round(viewH * dpr);
  const ctx = /** @type {HTMLCanvasElement} */ (overlay).getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, viewW, viewH);
  const store = (window.__uiAudit ??= { rects: [] });
  store.synthetic = true;
  store.frame = null;

  const combat = structuredClone(profile.PUBLIC_COMBAT);
  const encounter = profile.PUBLIC_ENCOUNTERS[spec.encounter];
  const world = createWorld(encounter, combat, 1);


  if ((spec.players ?? 1) > 1) {
    const { seatCoopRoster } = await import('/src/app/coop-world.ts');
    seatCoopRoster(world, combat, spec.players);
  }

  const idle = {
    move: { x: 0, y: 0 },
    facing: null,
    lightPressed: false,
    heavyPressed: false,
    guardHeld: false,
    guardPressed: false,
    stepPressed: false,
    focusPressed: false,
    interactPressed: false,
    powerPressed: false,
    powerHeld: false,
    aimDistance: null,
  };
  for (let i = 0; i < (spec.ticks ?? 40); i += 1) {
    stepPublicWorld(world, world.players.map(() => idle), combat, profile.PUBLIC_SLOWMO, encounter);
  }

  const p = world.players[0];
  if (spec.player?.pos !== undefined) p.pos = { ...spec.player.pos };
  if (spec.player?.hpFraction !== undefined) p.hp = p.maxHp * spec.player.hpFraction;
  if (spec.player?.staminaFraction !== undefined) {
    p.stamina = p.maxStamina * spec.player.staminaFraction;
  }
  if (spec.player?.parryStreak !== undefined) p.parryStreak = spec.player.parryStreak;
  if (spec.player?.riposteWindowMs !== undefined) p.riposteWindowMs = spec.player.riposteWindowMs;
  if (spec.player?.powerCooldownMs !== undefined) {
    p.powerCooldownMs = spec.player.powerCooldownMs;
  }
  if (spec.outcome !== undefined) world.outcome = spec.outcome;
  if (spec.power !== undefined) combat.power = spec.power;
  if (spec.pickups !== undefined) {
    for (const drop of spec.pickups) {
      world.pickups.push({
        id: world.nextId++,
        kind: drop.kind,
        pos: { ...drop.pos },
        amount: 0,
        offers: drop.offers,
        lifeMs: 8000,
        totalLifeMs: 8000,
      });
    }
  }

  const cam = iso.makeCamera(viewW, viewH);
  cam.arena = world.arena;
  cam.zoom = iso.fitZoom(
    cam,
    encounter.arena,
    iso.gameplayViewMargin(108, document.body.classList.contains('input-touch')),
  );

  const pres = structuredClone(profile.PUBLIC_PRESENTATION);
  if (spec.hud !== undefined) Object.assign(pres.hud, spec.hud);

  const frame = resolveLayout({
    viewport: { w: viewW, h: viewH },
    safe: { top: 0, right: 0, bottom: 0, left: 0 },
    device:
      document.body.classList.contains('input-touch') &&
      !document.body.classList.contains('touch-lab-mode')
        ? 'touch'
        : 'pointer',
    profile: spec.profile ?? 'game',
    active: spec.active ?? {},
  });

  if (spec.scene === true) {
    drawScene(ctx, world, cam, {
      cfg: combat,
      pal: { ...PALETTE },
      pres,
      apotheosis: APOTHEOSIS_OFF,
      models: cloneBank(PUBLIC_MODELS),
      rooms: LAB_ROOMS,
      archetypeColor: labArchetypeColor,
      localPlayer: 0,
      showHitboxes: false,
      aimDistance: null,
    });
  }

  const { copyFor } = await import('/src/game/copy.ts');
  drawHud(ctx, world, {
    localPlayer: 0,
    archetypeColor: labArchetypeColor,
    cfg: combat,
    copy: copyFor('en'),
    pal: { ...PALETTE },
    pres,
    attempt: 3,
    replaying: spec.replaying === true,
    viewW,
    viewH,
    waveCount: encounter.waves.length,
    frame,
    touchControls: document.body.classList.contains('input-touch'),
    showPowerCooldown: spec.showPowerCooldown ?? false,
    tutorialPrompt: spec.tutorialPrompt ?? null,
    waveAnnouncement: spec.waveAnnouncement ?? null,
    outcomeLabels: { cleared: 'CLEARED', timeout: 'TIMEOUT', dead: 'DEAD' },
    retryHint: spec.retryHint,
  });

  if (spec.companion === true) {
    const { spawnCompanion } = await import('/src/sim/companion.ts');
    spawnCompanion(world, 'MARA', 54, 90, {
      x: world.players[0].pos.x + 1,
      y: world.players[0].pos.y,
    });
    drawScene(ctx, world, cam, {
      cfg: combat,
      pal: { ...PALETTE },
      pres,
      apotheosis: APOTHEOSIS_OFF,
      models: cloneBank(PUBLIC_MODELS),
      rooms: LAB_ROOMS,
      archetypeColor: labArchetypeColor,
      localPlayer: 0,
      showHitboxes: false,
      aimDistance: null,
    });
  }

  if (spec.travel !== undefined) {
    const state = travelMod.createTravelState();
    state.open = spec.travel.open ?? false;
    const npc = travelMod.travelNpcFor('siege_10', 'en');
    const verb = document.body.classList.contains('input-touch') ? 'ACT' : 'E';
    const prompt = travelMod.travelPrompt(npc, world.players[0].pos, state, verb, 'en');
    drawTravel(ctx, cam, { ...PALETTE }, frame, npc, state, prompt);
  }

  if (spec.route !== undefined) {
    const state = routeMod.createRouteState();
    state.index = spec.route.index;
    state.furthest = state.index;
    const verb = document.body.classList.contains('input-touch') ? 'ACT' : 'E';
    drawRoute(ctx, world, cam, { ...PALETTE }, routeMod.FIRST_CROWN, state, frame, verb);
    for (const pad of routeFloorPads(
      ctx,
      world,
      cam,
      { ...PALETTE },
      routeMod.FIRST_CROWN,
      state,
      frame,
    )) {
      pad.draw();
    }
  }




  if (spec.room !== undefined) {
    const { createRouteRun, drawRoom } = await import('/src/app/route-run.ts');
    const { controlNamesFor } = await import('/src/game/controls.ts');
    const { copyFor: roomCopyFor } = await import('/src/game/copy.ts');
    const device = document.body.classList.contains('input-touch') ? 'touch' : 'pointer';
    const names = controlNamesFor(device);
    const copy = roomCopyFor('en');
    const run = createRouteRun(profile.PUBLIC_ENCOUNTERS, copy.herald.leave);
    Object.assign(run.envoy, spec.room.envoy ?? {});
    Object.assign(run.herald, spec.room.herald ?? {});
    if (spec.room.route !== undefined) {
      run.route.index = spec.room.route.index;
      run.route.furthest = spec.room.route.index;
    }
    if (spec.room.puzzle !== undefined) {
      const { ANTECHAMBER_PUZZLE, createSealPuzzle, pressSeal, stepSealPuzzle } = await import(
        '/src/game/puzzle.ts'
      );
      const puzzle = createSealPuzzle(ANTECHAMBER_PUZZLE);
      if (spec.room.puzzle.awaiting === true) {
        stepSealPuzzle(
          puzzle,
          (ANTECHAMBER_PUZZLE.flashOnMs + ANTECHAMBER_PUZZLE.flashGapMs) *
            ANTECHAMBER_PUZZLE.sequence.length,
        );
        for (let i = 0; i < (spec.room.puzzle.pulls ?? 0); i++) {
          pressSeal(puzzle, ANTECHAMBER_PUZZLE.seals[ANTECHAMBER_PUZZLE.sequence[i]].at);
        }
      }
      run.puzzle = puzzle;
    }
    drawRoom(
      ctx,
      run,
      world,
      cam,
      { ...PALETTE },
      frame,
      combat,
      names.interact,
      0,
      3,
      names.move,
      copy.herald,
      {
        state: spec.room.coopState ?? '',
        room: spec.room.coopRoom ?? '',
        available: true,
      },
      copy.puzzle,
    );
    if (spec.room.route !== undefined) {
      const { FIRST_CROWN } = await import('/src/game/route.ts');
      const { routeFloorPads } = await import('/src/render/route.ts');
      for (const pad of routeFloorPads(ctx, world, cam, { ...PALETTE }, FIRST_CROWN, run.route, frame)) {
        pad.draw();
      }
    }
  }



  if (spec.escort === true) {
    const { drawMara } = await import('/src/render/escort.ts');
    const { createEscortState, escortPrompt } = await import('/src/game/escort.ts');
    const verb = document.body.classList.contains('input-touch') ? 'ACT' : 'E';
    drawMara(
      ctx,
      cam,
      { ...PALETTE },
      frame,
      escortPrompt(createEscortState(), world.players[0].pos, verb),
    );
  }



  if (spec.victory === true) {
    const { drawVictory, VICTORY_FADE_MS } = await import('/src/render/victory.ts');
    drawVictory(
      ctx,
      cam,
      { ...PALETTE },
      frame,
      {
        attempts: 3,
        escortAlive: true,
        feats: [
          { id: 'the_ladder', label: 'THE LADDER', note: 'Walked every room' },
          { id: 'escort', label: 'ESCORT', note: 'Mara walked out with you' },
          { id: 'escort_intact', label: 'UNTOUCHED ESCORT', note: 'She was never hurt' },
          { id: 'bare_handed', label: 'BARE-HANDED', note: 'The blade and nothing else' },
        ],
      },
      VICTORY_FADE_MS + 4 * 220 + 320,
    );
  }

  if (spec.debug !== undefined) {
    const panel = document.getElementById('panel');
    const railUp = panel !== null && !panel.hidden && panel.getBoundingClientRect().width > 0;
    drawDebug(ctx, world, cam, {
      railUp,
      cfg: combat,
      localPlayer: 0,
      frame,
      showTimeline: spec.debug.timeline === true,
      showStates: spec.debug.states === true,
      recentOffsets: [-40, -12, 5, 22, 60],
      mastery:
        spec.debug.mastery === true
          ? {
              stage: 'anticipation',
              components: {
                parryAccuracy: 0.62,
                timing: 0.55,
                anticipation: 0.48,
                recovery: 0.71,
                continuity: 0.4,
              },
              rationale: [
                'parry accuracy is the gate: 62% over 21 attempts',
                'timing spread is still wide enough to be luck-sensitive',
              ],
            }
          : null,
      vignette: spec.debug.mastery === true ? { amount: 0.85, held: false } : null,
    });
  }

  store.synthetic = false;
  store.frame = frame;
  return true;
};

const computeFrame = async ({ safe, profile, active }) => {
  const { resolveLayout } = await import('/src/render/layout.ts');
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;' +
    'padding-top:env(safe-area-inset-top);padding-right:env(safe-area-inset-right);' +
    'padding-bottom:env(safe-area-inset-bottom);padding-left:env(safe-area-inset-left)';
  document.body.appendChild(probe);
  const style = getComputedStyle(probe);
  const px = (value) => Number.parseFloat(value) || 0;
  const real = {
    top: px(style.paddingTop),
    right: px(style.paddingRight),
    bottom: px(style.paddingBottom),
    left: px(style.paddingLeft),
  };
  probe.remove();

  const base = {
    viewport: { w: window.innerWidth, h: window.innerHeight },
    device:
      document.body.classList.contains('input-touch') &&
      !document.body.classList.contains('touch-lab-mode')
        ? 'touch'
        : 'pointer',
    profile,
    active: active ?? {},
  };
  return {
    frame:
      window.__uiAudit?.frame ??
      (await import('/src/render/ui-probe.ts')).lastReportedFrame() ??
      resolveLayout(/** @type {LayoutInput} */ ({ ...base, safe: real })),
    declared: resolveLayout(/** @type {LayoutInput} */ ({ ...base, safe })),
  };
};

const clearSynthetic = () => {
  document.getElementById('__ui-audit-overlay')?.remove();
};

const freshOnScreen = ({ id, windowMs, text }) => {
  const rects = window.__uiAudit?.rects ?? [];
  const now = performance.now();
  return rects.some(
    (r) =>
      r.id === id &&
      r.t >= now - windowMs &&
      (text === undefined || (r.text ?? '').includes(text)),
  );
};

const DRIVE_FRESH_MS = 800;

const untilArgs = (until) =>
  typeof until === 'string' ? { id: until, windowMs: DRIVE_FRESH_MS } : { ...until, windowMs: DRIVE_FRESH_MS };

const onScreen = (page, until, timeout) =>
  page
    .waitForFunction(freshOnScreen, untilArgs(until), { timeout })
    .then(() => true)
    .catch(() => false);

const activeFor = async (page, testCase) => ({
  instruments: await page.evaluate(instrumentsUp),
  ...(testCase.active ?? {}),
});

const CASES = [
  {
    id: 'game/court',
    profiles: ['game'],
    kind: 'live',
    what: 'the opening court — the room the game actually boots into',
    expects: [
      'hud.health.bar',
      'hud.health.text',
      'hud.stamina.bar',
      'route.exit.label',
    ],
    drive: { settleMs: 900, pause: true },
  },
  {
    id: 'game/touch-pad',
    profiles: ['game'],
    kind: 'live',
    touchOnly: true,
    what: 'the pad and the page controls live in the court',
    expects: [
      'dom.stick',
      'dom.action',
      'dom.toolbar',
      'dom.toolbar.restart',
      'dom.toolbar.pause',
      'dom.toolbar.fullscreen',
    ],
    drive: { settleMs: 900 },
  },
  {
    id: 'game/armoury-stand',
    profiles: ['game'],
    kind: 'synth',
    what: 'a power plinth, read at close range',
    expects: ['armoury.stand.label', 'armoury.stand.note', 'armoury.stand.prompt'],
    spec: {
      encounter: 'wayfarer_court',
      ticks: 0,
      scene: true,

      player: { pos: { x: -4, y: 3.5 } },
      room: {},
    },
  },
  {
    id: 'game/power-drop',
    profiles: ['game'],
    kind: 'synth',
    what: 'a power drop under the king, and the press it waits for',
    expects: ['pickup.power.prompt'],
    spec: {
      encounter: 'wayfarer_court',
      ticks: 0,
      scene: true,
      player: { pos: { x: 2, y: -2 } },
      pickups: [{ kind: 'power', offers: 'freeze', pos: { x: 2, y: -2 } }],
      room: {},
    },
  },
  {
    id: 'game/herald',
    profiles: ['game'],
    kind: 'synth',
    what: 'the herald, and the invitation to speak to him',
    expects: ['herald.name', 'herald.line', 'herald.prompt'],
    spec: {
      encounter: 'wayfarer_court',
      ticks: 0,
      scene: true,
      player: { pos: { x: -5.6, y: -3.6 } },
      room: {},
    },
  },
  {

    id: 'game/antechamber-seals',
    profiles: ['game'],
    kind: 'synth',
    what: 'the ordered seals awaiting a pull, one lit, the king at the next',
    expects: ['route.objective.text', 'route.prompt.text', 'route.exit.label', 'route.back.label'],
    spec: {
      encounter: 'upper_hall',
      ticks: 0,
      scene: true,
      player: { pos: { x: 0, y: 2.2 } },
      room: { route: { index: 6 }, puzzle: { awaiting: true, pulls: 1 } },
    },
  },
  {

    id: 'game/antechamber-door',
    profiles: ['game'],
    kind: 'synth',
    what: 'the antechamber’s exit, locked, while the braziers replay the order',
    expects: ['route.objective.text', 'route.prompt.text', 'route.exit.label', 'route.back.label'],
    spec: {
      encounter: 'upper_hall',
      ticks: 0,
      scene: true,
      player: { pos: { x: 0, y: -5.5 } },
      room: { route: { index: 6 }, puzzle: {} },
    },
  },
  {



    id: 'game/herald-offers',
    profiles: ['game', 'lab'],
    kind: 'synth',
    active: { narration: true },
    what: 'the herald’s five offers windowed, and the controls that choose between them',
    expects: [
      'herald.dialogue.box',
      'herald.dialogue.speaker',
      'herald.dialogue.text',
      'herald.dialogue.hint',
    ],
    spec: {
      encounter: 'wayfarer_court',
      ticks: 0,
      scene: true,
      player: { pos: { x: -5.6, y: -3.6 } },
      room: { herald: { open: true, selected: 1 } },
    },
  },


  {
    id: 'game/envoy',
    profiles: ['game', 'lab'],
    kind: 'synth',
    what: 'the envoy, and the invitation to speak to him',
    expects: ['envoy.name', 'envoy.standing', 'envoy.prompt'],
    spec: {
      encounter: 'wayfarer_court',
      ticks: 0,
      scene: true,
      player: { pos: { x: -1, y: -3.6 } },
      room: {},
    },
  },
  {
    id: 'game/envoy-choices',
    profiles: ['game', 'lab'],
    kind: 'synth',
    active: { narration: true },
    what: 'what he offers before there is a session, and the controls that choose between them',
    expects: [
      'envoy.dialogue.box',
      'envoy.dialogue.speaker',
      'envoy.dialogue.text',
      'envoy.dialogue.hint',
    ],
    spec: {
      encounter: 'wayfarer_court',
      ticks: 0,
      scene: true,
      player: { pos: { x: -1, y: -3.6 } },
      room: { envoy: { open: true, selected: 1 } },
    },
  },
  {


    id: 'game/envoy-keys',
    profiles: ['game', 'lab'],
    kind: 'synth',
    active: { narration: true },
    what: 'the room-code keyboard, steered with the movement control',
    expects: [
      'envoy.dialogue.box',
      'envoy.dialogue.speaker',
      'envoy.dialogue.aside',
      'envoy.dialogue.keys',
      'envoy.dialogue.hint',
    ],
    spec: {
      encounter: 'wayfarer_court',
      ticks: 0,
      scene: true,
      player: { pos: { x: -1, y: -3.6 } },
      room: { envoy: { open: true, answering: true, entry: 'Q2', keyRow: 2, keyCol: 8 } },
    },
  },
  {
    id: 'game/boss',
    active: { threat: true },
    profiles: ['game', 'lab'],
    kind: 'synth',
    what: 'the boss bar over whatever owns the top of the screen',
    expects: ['hud.boss.name', 'hud.boss.bar', 'hud.boss.text'],
    spec: { encounter: 'first_blade', ticks: 90, scene: true },
  },
  {

    id: 'game/melee',
    profiles: ['game'],
    kind: 'synth',
    what: 'the two bars over an ordinary enemy’s head, in the room the game fights in',
    expects: ['world.enemy.health', 'world.enemy.poise'],
    spec: { encounter: 'siege_10', ticks: 60, scene: true },
  },
  {


    id: 'game/partner',
    profiles: ['game', 'lab'],
    kind: 'synth',
    what: 'a partner king’s health, over his body',
    expects: ['world.player.health'],
    spec: { encounter: 'siege_10', ticks: 40, scene: true, players: 2 },
  },
  {

    id: 'game/victory',
    profiles: ['game'],
    kind: 'synth',
    what: 'the crown, its subtitle and the feats the run earned',
    expects: ['victory.title', 'victory.subtitle', 'victory.feat.label', 'victory.feat.note'],
    spec: { encounter: 'first_blade', ticks: 40, scene: true, outcome: 'cleared', victory: true },
  },
  {

    id: 'game/escort',
    profiles: ['game'],
    kind: 'synth',
    what: 'her name, her offer and the invitation to take her along',
    expects: ['escort.name', 'escort.line', 'escort.prompt'],
    spec: {
      encounter: 'wayfarer_court',
      ticks: 0,
      scene: true,
      player: { pos: { x: 4.4, y: -3.5 } },
      escort: true,
    },
  },
  {
    id: 'game/defeat',
    active: { verdict: true },
    profiles: ['game', 'lab'],
    kind: 'synth',
    what: 'the outcome line and its retry hint',
    expects: ['hud.outcome.text', 'hud.retry.text'],
    spec: {
      encounter: 'siege_10',
      outcome: 'dead',
      player: { hpFraction: 0 },
      retryHint: 'RESTART to retry',
    },
  },
  {
    id: 'game/defeat-boss',
    active: { verdict: true, threat: true },
    profiles: ['game', 'lab'],
    kind: 'synth',
    what: 'outcome and boss bar together — the case that decides the outcome line’s y',
    expects: ['hud.outcome.text', 'hud.retry.text', 'hud.boss.bar'],
    spec: {
      encounter: 'first_blade',
      ticks: 90,
      outcome: 'dead',
      player: { hpFraction: 0 },
      retryHint: 'RESTART to retry',
    },
  },
  {
    id: 'game/streak-riposte',
    profiles: ['game', 'lab'],
    kind: 'synth',
    what: 'the two live affordances that sit beside the resource stack',
    expects: ['hud.streak.text', 'hud.riposte.text'],
    spec: {
      encounter: 'siege_10',
      player: { parryStreak: 7, riposteWindowMs: 240, hpFraction: 0.45, staminaFraction: 0.3 },
    },
  },
  {


    id: 'game/wave-banner',
    profiles: ['game', 'lab'],
    kind: 'synth',
    what: 'a wave landing, announced in the middle of the field of view',
    expects: ['hud.wave.announce'],
    spec: {
      encounter: 'siege_10',
      waveAnnouncement: 'BOSS WAVE',
    },
  },
  {
    id: 'lab/panel',
    profiles: ['lab'],
    kind: 'live',
    desktopOnly: true,
    what: 'the instrument panel over the arena',
    expects: ['dom.panel', 'dom.panel.readout'],
    drive: { settleMs: 1200, pause: true },
  },
  {


    id: 'lab/coop-room',
    profiles: ['lab'],
    kind: 'live',
    desktopOnly: true,
    what: 'the room-code field, open, inside the instrument rail',
    expects: ['dom.coop.code', 'dom.panel'],
    drive: { settleMs: 1200, click: '#coop-join', pause: true },
  },
  {
    id: 'lab/fps-meter',
    profiles: ['lab'],
    kind: 'live',
    desktopOnly: true,
    what: 'the live hitch diagnostic beside the page controls',
    expects: ['dom.fps-meter'],
    drive: { settleMs: 1200, press: 'Digit6', pause: true },
  },
  {
    id: 'lab/touch-actions',
    profiles: ['lab'],
    kind: 'live',
    touchOnly: true,
    what: 'MODO: LAB — the 30 command buttons on a phone',
    expects: ['dom.lab.action', 'dom.toolbar.viewmode', 'dom.panel'],
    drive: { settleMs: 1200, click: '#touch-view-mode' },
  },
  {
    id: 'lab/instruments',
    profiles: ['lab'],
    kind: 'synth',
    desktopOnly: true,
    what: 'timeline, mastery panel and state labels at once',
    expects: ['debug.timeline.panel', 'debug.mastery.panel', 'world.state.enemy', 'world.state.player'],

    active: { instruments: true },
    drive: { settleMs: 1200, press: 'KeyB' },
    spec: {
      encounter: 'siege_10',
      ticks: 120,
      scene: true,
      debug: { timeline: true, states: true, mastery: true },
    },
  },
  {
    id: 'lab/power',
    profiles: ['lab'],
    kind: 'synth',
    what: 'the power readiness bar the public profile suppresses',
    expects: ['hud.power.bar'],
    spec: {
      encounter: 'siege_10',
      power: 'lightning',
      showPowerCooldown: true,
      player: { powerCooldownMs: 1200 },
    },
  },
  {
    id: 'lab/replay',
    profiles: ['lab'],
    kind: 'synth',
    what: 'the REPLAY banner',
    expects: ['hud.replay.text'],
    spec: { encounter: 'siege_10', replaying: true },
  },
  {
    id: 'lab/tutorial',
    profiles: ['lab'],
    kind: 'synth',
    what: 'the longest lesson line the coach can emit',
    expects: ['hud.tutorial.text'],
    spec: {
      encounter: 'siege_10',
      tutorialPrompt:
        'Tutorial 6/9 (2/3) — Guard one attack — hold Shift or L while facing the attacker',
    },
  },
  {
    id: 'lab/travel-npc',
    profiles: ['lab'],
    kind: 'synth',
    what: 'the travel NPC’s nameplate and prompt',
    expects: ['travel.prompt.text', 'world.npc.name'],
    spec: {
      encounter: 'siege_10',
      ticks: 0,
      scene: true,
      player: { pos: { x: -6.6, y: 5.2 } },
      travel: { open: false },
    },
  },
  {
    id: 'lab/companion-health',
    profiles: ['lab'],
    kind: 'synth',
    what: 'the escort’s health bar over her head',
    expects: ['world.companion.health'],
    spec: {
      encounter: 'siege_10',
      ticks: 0,
      scene: true,
      companion: true,
    },
  },
  {
    id: 'lab/travel-dialogue',
    active: { narration: true },
    profiles: ['lab'],
    kind: 'synth',
    what: 'the travel dialogue frame and its unwrapped line',
    expects: [
      'travel.dialogue.box',
      'travel.dialogue.speaker',
      'travel.dialogue.text',
      'travel.dialogue.hint',
    ],
    spec: {
      encounter: 'siege_10',
      ticks: 0,
      scene: true,
      player: { pos: { x: -6.6, y: 5.2 } },
      travel: { open: true },
    },
  },
  {
    id: 'lab/route-door',
    profiles: ['lab'],
    kind: 'synth',
    what: 'the route’s widest prompt, at an open door',


    expects: ['route.prompt.text', 'route.exit.label'],
    spec: {
      encounter: 'siege_10',
      ticks: 0,
      scene: true,
      outcome: 'cleared',
      player: { pos: { x: 8, y: 0 } },
      route: { index: 1 },
    },
  },
  {
    id: 'lab/route-objective',
    profiles: ['lab'],
    kind: 'synth',
    what: 'the route’s widest objective line',
    expects: ['route.objective.text'],
    spec: {
      encounter: 'siege_10',
      ticks: 0,
      scene: true,


      player: { pos: { x: 0, y: 0 } },
      route: { index: 2 },
    },
  },
];

const intersection = (a, b) => {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
};

const arcmin = (heightPx, mmPerPx, distanceMm) =>
  2 * Math.atan(((heightPx * mmPerPx) / 2) / distanceMm) * (180 / Math.PI) * 60;

const nearestDistance = (r, x, y) =>
  Math.hypot(Math.max(r.x - x, 0, x - (r.x + r.w)), Math.max(r.y - y, 0, y - (r.y + r.h)));

const analyse = (rects, form, elementsById, frame) => {
  const mmPerPx = form.mm[0] / form.css[0];
  const [vw, vh] = form.css;
  const findings = [];

  const meta = (r) => elementsById.get(r.id) ?? {};
  const layerOf = (r) => r.layer ?? meta(r).layer ?? 'viewport';
  const name = (r) => (r.instance ? `${r.id}[${r.instance}]` : r.id);

  for (let i = 0; i < rects.length; i += 1) {
    for (let j = i + 1; j < rects.length; j += 1) {
      const a = rects[i];
      const b = rects[j];
      if (a.id === b.id) continue;
      if (nested(a.id, b.id)) continue;
      const areaMm2 = intersection(a, b) * mmPerPx * mmPerPx;
      if (areaMm2 <= THRESHOLDS.overlapNoiseMm2) continue;

      const layers = [layerOf(a), layerOf(b)];
      const transient = layers.includes('world');
      const controls = [a, b].filter((r) => r.interactive === true || meta(r).kind === 'control');
      findings.push({
        check: 'collision',
        level: transient ? 'note' : controls.length > 0 ? 'fail' : 'warn',
        what: `${name(a)} ∩ ${name(b)}`,
        detail: `${areaMm2.toFixed(1)} mm²${controls.length > 0 ? ' — one is a control' : ''}`,
      });
    }
  }

  for (const r of rects) {
    const m = meta(r);

    const over = [
      r.x < -0.5 ? `${(-r.x).toFixed(0)}px past the left` : null,
      r.y < -0.5 ? `${(-r.y).toFixed(0)}px past the top` : null,
      r.x + r.w > vw + 0.5 ? `${(r.x + r.w - vw).toFixed(0)}px past the right` : null,
      r.y + r.h > vh + 0.5 ? `${(r.y + r.h - vh).toFixed(0)}px past the bottom` : null,
    ].filter(Boolean);
    if (over.length > 0) {
      findings.push({
        check: 'bounds',
        level: 'fail',
        what: name(r),
        detail: over.join(', '),
      });
    }

    const bands = [
      { side: 'top', rect: { x: 0, y: 0, w: vw, h: form.insets.top } },
      { side: 'bottom', rect: { x: 0, y: vh - form.insets.bottom, w: vw, h: form.insets.bottom } },
      { side: 'left', rect: { x: 0, y: 0, w: form.insets.left, h: vh } },
      { side: 'right', rect: { x: vw - form.insets.right, y: 0, w: form.insets.right, h: vh } },
    ].filter((band) => band.rect.w > 0 && band.rect.h > 0);
    for (const band of layerOf(r) === 'dom' ? [] : bands) {
      if (intersection(r, band.rect) <= 0) continue;
      findings.push({
        check: 'safe-area',
        level: layerOf(r) === 'world' ? 'note' : m.kind === 'control' ? 'fail' : 'warn',
        what: name(r),
        detail: `inside the ${band.side} safe-area band (${
          form.insets[band.side]
        }px)`,
      });
    }



    const readingPx = Math.max(r.h, r.capPx ?? 0);
    if (m.reading === true && readingPx > 0) {
      const angle = arcmin(readingPx, mmPerPx, form.distanceMm);
      if (angle < THRESHOLDS.textArcminFail || angle < THRESHOLDS.textArcminWarn) {
        findings.push({
          check: 'legibility',
          level: angle < THRESHOLDS.textArcminFail ? 'fail' : 'warn',
          what: name(r),
          detail: `${angle.toFixed(1)}′ (${(readingPx * mmPerPx).toFixed(2)} mm) at ${
            form.distanceMm
          } mm`,
        });
      }
    }

    if (r.full !== undefined && r.text !== undefined) {
      const kept = [...r.text].length - 1;
      const wanted = [...r.full].length;
      findings.push({
        check: 'truncation',
        level: 'warn',
        what: name(r),
        detail: `${wanted - kept} of ${wanted} chars cut — “${r.full}” drawn as “${r.text}”`,
      });
    }

    const region = m.region === undefined ? undefined : frame?.regions?.[m.region];
    if (m.region !== undefined && region !== undefined && layerOf(r) !== 'world') {
      const inside =
        r.x >= region.x - 1 &&
        r.y >= region.y - 1 &&
        r.x + r.w <= region.x + region.w + 1 &&
        r.y + r.h <= region.y + region.h + 1;
      if (!inside) {
        const box = (v) => `${v.x.toFixed(0)},${v.y.toFixed(0)} ${v.w.toFixed(0)}x${v.h.toFixed(0)}`;
        const over = [
          r.x < region.x - 1 ? `${(region.x - r.x).toFixed(0)} left` : null,
          r.y < region.y - 1 ? `${(region.y - r.y).toFixed(0)} above` : null,
          r.x + r.w > region.x + region.w + 1
            ? `${(r.x + r.w - region.x - region.w).toFixed(0)} right`
            : null,
          r.y + r.h > region.y + region.h + 1
            ? `${(r.y + r.h - region.y - region.h).toFixed(0)} below`
            : null,
        ].filter(Boolean);
        findings.push({
          check: 'region',
          level: m.migrated === true ? 'fail' : 'backlog',
          what: name(r),
          detail: `${over.join(', ')} of ${m.region} — drew ${box(r)}, region ${box(region)}`,
        });
      }
    }

    if (frame !== undefined && (m.region === 'affordance' || m.region === 'objective')) {
      const distance = nearestDistance(r, frame.gaze.x, frame.gaze.y);
      const hasOutside =
        Math.min(frame.content.w, frame.content.h) / 2 > frame.gaze.focusRadius * 1.25;
      const wrong =
        m.region === 'affordance'
          ? distance > frame.gaze.focusRadius
          : hasOutside && distance <= frame.gaze.focusRadius;
      if (wrong) {
        findings.push({
          check: 'focus',
          level: m.migrated === true ? 'fail' : 'backlog',
          what: name(r),
          detail:
            m.region === 'affordance'
              ? `${distance.toFixed(0)}px from the gaze anchor — costs a saccade (radius ${frame.gaze.focusRadius})`
              : `${distance.toFixed(0)}px from the gaze anchor — a statistic parked inside the focus radius`,
        });
      }
    }

    if (r.blockedBy != null) {
      findings.push({
        check: 'reachable',
        level: 'fail',
        what: name(r),
        detail:
          r.blockedBy === 'nothing'
            ? 'nothing receives a tap at its centre'
            : `a tap at its centre lands on ${r.blockedBy}`,
      });
    }

    if (r.interactive === true) {
      const smallestPx = Math.min(r.w, r.h);
      const smallestMm = smallestPx * mmPerPx;
      if (form.touch && smallestMm < THRESHOLDS.targetMmWarn) {
        findings.push({
          check: 'target',
          level: smallestMm < THRESHOLDS.targetMmFail ? 'fail' : 'warn',
          what: name(r),
          detail: `${smallestMm.toFixed(1)} mm across its short side`,
        });
      }
      if (smallestPx < THRESHOLDS.targetCssFail) {
        findings.push({
          check: 'target',
          level: 'fail',
          what: name(r),
          detail: `${smallestPx.toFixed(0)} CSS px — under the WCAG 2.2 AA floor of ${
            THRESHOLDS.targetCssFail
          }`,
        });
      }
    }
  }

  return findings;
};

const drawOverlay = ({ rects, frame }) => {
  document.getElementById('__ui-audit-boxes')?.remove();
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.id = '__ui-audit-boxes';
  svg.setAttribute('style', 'position:fixed;inset:0;pointer-events:none;z-index:99');
  svg.setAttribute('width', String(window.innerWidth));
  svg.setAttribute('height', String(window.innerHeight));
  const colour = { dom: '#38bdf8', viewport: '#f472b6', world: '#fbbf24' };
  const regions = Object.entries(frame?.regions ?? {})
    .map(
      ([regionName, r]) =>
        `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="none"
               stroke="#22d3ee" stroke-width="2" stroke-dasharray="9 6" opacity="0.55"/>
         <text x="${r.x + 5}" y="${r.y + 14}" fill="#22d3ee" opacity="0.85"
               font-family="ui-monospace, monospace" font-size="11">${regionName}</text>`,
    )
    .join('');
  svg.innerHTML =
    regions +
    rects
      .map(
        (r) =>
          `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="none"
                 stroke="${colour[r.layer] ?? '#f472b6'}" stroke-width="1.5" opacity="0.9"/>`,
      )
      .join('');
  document.body.appendChild(svg);
};



const REVERSE_KEY = { KeyW: 'KeyS', KeyS: 'KeyW', KeyA: 'KeyD', KeyD: 'KeyA' };

const startServer = (mode, port) =>
  startViteServer(mode === 'game' ? { port, mode: 'game' } : { port });

const forms = listArg('forms', Object.keys(FORMS));
const profiles = listArg('profiles', ['game', 'lab']);
const onlyCases = listArg('cases', null);
const wantShots = process.argv.includes('--shots');

const elementsById = new Map();
{
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../src/render/ui-elements.ts', import.meta.url), 'utf8');
  const body = source.slice(
    source.indexOf('export const UI_ELEMENTS = ['),
    source.indexOf('] as const satisfies'),
  );
  const field = (block, name) => block.match(new RegExp(`\\b${name}:\\s*'([^']+)'`))?.[1];
  for (const block of body.split(/\n  \{\n/).slice(1)) {
    const id = field(block, 'id');
    if (id === undefined) continue;
    const profileList = block.match(/profiles:\s*\[([^\]]*)\]/)?.[1] ?? '';
    elementsById.set(id, {
      id,
      owner: field(block, 'owner'),
      layer: field(block, 'layer'),
      kind: field(block, 'kind'),
      region: field(block, 'region'),
      profiles: [...profileList.matchAll(/'([^']+)'/g)].map((m) => m[1]),
      instanced: /instanced:\s*true/.test(block),
      reading: /reading:\s*true/.test(block),
      migrated: /migrated:\s*true/.test(block),
    });
  }
}
if (elementsById.size === 0) {
  console.error('could not read src/render/ui-elements.ts — the registry regex needs updating');
  process.exit(1);
}

const rows = [];
const seenElements = new Map(profiles.map((profile) => [profile, new Set()]));
const shots = [];
let hardFailures = 0;

await mkdir(SHOT_DIR, { recursive: true });

for (const profile of profiles) {
  const port = profile === 'game' ? 5202 : 5201;
  const base = `http://localhost:${port}`;
  const server = startServer(profile, port);
  let browser;

  try {
    await waitForServer(base, server.state);
    browser = await launchChrome();

    await Promise.all(
      forms.map(async (formName) => {
      const form = FORMS[formName];
      if (form === undefined) {
        console.error(`unknown form factor: ${formName}`);
        hardFailures += 1;
        return;
      }

      const context = await browser.newContext({
        viewport: { width: form.css[0], height: form.css[1] },
        hasTouch: form.touch,
        isMobile: form.touch,
        deviceScaleFactor: form.touch ? 3 : 2,
      });
      const page = await context.newPage();
      page.on('pageerror', (error) => console.error(`  browser: ${error.message}`));




      await page.routeWebSocket(/.*/, () => undefined);

      for (const testCase of CASES) {
        if (!testCase.profiles.includes(profile)) continue;
        if (onlyCases !== null && !onlyCases.includes(testCase.id)) continue;
        if (testCase.touchOnly === true && !form.touch) continue;
        if (testCase.desktopOnly === true && form.touch) continue;

        let canvasRects = [];
        let domRects = [];
        try {
          await page
            .goto(base, { waitUntil: 'domcontentloaded' })
            .catch(() => page.goto(base, { waitUntil: 'domcontentloaded' }));
          await page.evaluate(installProbe);
          await page
            .waitForFunction(() => (window.__uiAudit?.rects.length ?? 0) > 0, null, {
              timeout: testCase.drive?.settleMs ?? 4000,
            })
            .catch(() => undefined);



          if (profile === 'lab' && !form.touch) {
            await page.waitForFunction(instrumentsUp, null, { timeout: 4000 }).catch(() => undefined);
          }

          if (testCase.drive !== undefined) {
            if (testCase.drive?.click !== undefined) {
              await page.click(testCase.drive.click).catch(() => undefined);
              await page.waitForTimeout(150);
            }
            if (testCase.drive?.walkUntil !== undefined) {




              const { keys, id, ready } = testCase.drive.walkUntil;
              for (const key of keys) await page.keyboard.down(key);
              await page
                .waitForFunction(
                  (target) => (window.__uiAudit?.rects ?? []).some((r) => r.id === target),
                  id,
                  { timeout: 10000 },
                )
                .catch(() => undefined);
              for (const key of keys) await page.keyboard.up(key);
              await page.waitForTimeout(900);




              const back = keys.map((key) => REVERSE_KEY[key]).filter(Boolean);


              for (let attempt = 0; attempt < 4; attempt += 1) {
                if (await onScreen(page, id, 1500)) break;
                if (back.length === 0) break;
                for (const key of back) await page.keyboard.down(key);
                await page.waitForTimeout(70);
                for (const key of back) await page.keyboard.up(key);
                await page.waitForTimeout(400);
              }

              if (ready !== undefined) {
                await onScreen(page, ready, 8000);
              }
            }
            if (testCase.drive?.press !== undefined) {
              await page.keyboard.press(testCase.drive.press);
              await page.waitForTimeout(220);
            }
            if (testCase.drive?.steps !== undefined) {




              for (const step of testCase.drive.steps) {
                const tries = step.until === undefined ? 1 : (step.tries ?? 6);
                for (let attempt = 0; attempt < tries; attempt += 1) {
                  if (step.until !== undefined) {
                    if (await onScreen(page, step.until, attempt === 0 ? 900 : 1500)) break;
                  }
                  await page.keyboard.down(step.key);
                  await page.waitForTimeout(140);
                  await page.keyboard.up(step.key);


                  if (step.until !== undefined) await onScreen(page, step.until, 1500);
                  else await page.waitForTimeout(260);
                }
              }
            }
            if (testCase.drive?.pause === true) {
              if (form.touch) await page.click('#touch-pause').catch(() => undefined);
              else await page.keyboard.press('KeyP').catch(() => undefined);
              await page.waitForTimeout(120);
            }
          }
          if (testCase.kind !== 'live') {
            await page.evaluate(renderSynthetic, {
              ...testCase.spec,
              safe: form.insets,
              active: await activeFor(page, testCase),
              profile,
            });
          }

          await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
        canvasRects = await page.evaluate(collectProbe, {
          windowMs: testCase.kind === 'live' ? 150 : 5000,
          syntheticOnly: testCase.kind !== 'live',
        });
        domRects = await page.evaluate(measureDom, DOM_SELECTORS);
        } catch (error) {

          hardFailures += 1;
          rows.push({
            profile,
            form: formName,
            case: testCase.id,
            kind: testCase.kind,
            what: testCase.what,
            counted: 0,
            findings: [
              { check: 'case', level: 'fail', what: testCase.id, detail: String(error).split('\n')[0] },
            ],
          });
          continue;
        }

        const rects = [
          ...canvasRects.map((r) => ({
            ...r,
            layer: elementsById.get(r.id)?.layer ?? 'viewport',
          })),
          ...domRects,
        ];

        const produced = new Set(rects.map((r) => r.id));
        for (const id of produced) seenElements.get(profile)?.add(id);

        const frames = await page
          .evaluate(computeFrame, {
            safe: form.insets,
            profile,
            active: await activeFor(page, testCase),
          })
          .catch(() => undefined);
        const frame = frames?.frame;

        const findings = analyse(rects, form, elementsById, frame);
        const missing = (testCase.expects ?? []).filter((id) => !produced.has(id));
        for (const id of missing) {
          findings.push({
            check: 'case',
            level: 'fail',
            what: id,
            detail: 'the case claims this element but never produced it',
          });
        }

        hardFailures += findings.filter((f) => f.level === 'fail').length;


        if (wantShots) {
          const drawn = await page
            .evaluate(drawOverlay, { rects, frame })
            .then(() => true)
            .catch(() => false);
          if (drawn) {
            const path = `${SHOT_DIR}/${testCase.id.replace('/', '-')}-${formName}.png`;
            await page.screenshot({ path }).then(() => shots.push(path)).catch(() => undefined);
          }
        }
        await page.evaluate(clearSynthetic).catch(() => undefined);

        rows.push({
          profile,
          form: formName,
          case: testCase.id,
          kind: testCase.kind,
          what: testCase.what,
          counted: rects.length,
          findings,
        });
      }

      await context.close();
      }),
    );
  } finally {
    if (browser !== undefined) await browser.close();
    server.proc.kill();
  }
}

const coverage = [];
if (onlyCases === null) {
  for (const profile of profiles) {
    const seen = seenElements.get(profile) ?? new Set();
    for (const element of elementsById.values()) {
      if (!element.profiles.includes(profile)) continue;
      if (seen.has(element.id)) continue;
      coverage.push({ profile, id: element.id, owner: element.owner });
      hardFailures += 1;
    }
  }
}

const pad = (value, width) => String(value).padEnd(width);
const LEVEL_MARK = { fail: '✖', warn: '!', backlog: '→', note: '·' };

console.log('');
console.log(
  [pad('profile', 9), pad('form', 23), pad('case', 22), pad('kind', 7), pad('rects', 7), 'result'].join(''),
);
console.log('-'.repeat(80));

rows.sort(
  (a, b) =>
    a.profile.localeCompare(b.profile) ||
    forms.indexOf(a.form) - forms.indexOf(b.form) ||
    a.case.localeCompare(b.case),
);
for (const row of rows) {
  const fails = row.findings.filter((f) => f.level === 'fail').length;
  const warns = row.findings.filter((f) => f.level === 'warn').length;
  const result = fails > 0 ? `FAIL ${fails}` : warns > 0 ? `warn ${warns}` : 'ok';
  console.log(
    [
      pad(row.profile, 9),
      pad(row.form, 23),
      pad(row.case, 22),
      pad(row.kind, 7),
      pad(row.counted, 7),
      result,
    ].join(''),
  );
  for (const finding of row.findings) {
    if (finding.level === 'note' || finding.level === 'backlog') continue;
    console.log(
      `${' '.repeat(9)}${LEVEL_MARK[finding.level]} ${pad(finding.check, 11)}${finding.what} — ${finding.detail}`,
    );
  }
}

{
  const distinct = new Map();
  for (const row of rows) {
    for (const finding of row.findings) {
      if (finding.level === 'note' || finding.level === 'backlog') continue;
      const key = `${finding.check} ${finding.what}`;
      const entry = distinct.get(key) ?? {
        check: finding.check,
        what: finding.what,
        level: finding.level,
        forms: new Set(),
        cases: new Set(),
        detail: finding.detail,
      };
      if (finding.level === 'fail') entry.level = 'fail';
      entry.forms.add(row.form);
      entry.cases.add(row.case);
      distinct.set(key, entry);
    }
  }

  const ranked = [...distinct.values()].sort(
    (a, b) =>
      (a.level === b.level ? 0 : a.level === 'fail' ? -1 : 1) ||
      b.forms.size - a.forms.size ||
      b.cases.size - a.cases.size,
  );

  console.log('');
  console.log(`DISTINCT DEFECTS — ${ranked.length} across ${rows.length} measured screens`);
  console.log('-'.repeat(80));
  console.log(
    [pad('', 2), pad('check', 12), pad('forms', 7), pad('cases', 7), 'what'].join(''),
  );
  for (const entry of ranked) {
    console.log(
      [
        pad(LEVEL_MARK[entry.level], 2),
        pad(entry.check, 12),
        pad(`${entry.forms.size}/${forms.length}`, 7),
        pad(entry.cases.size, 7),
        `${entry.what} — ${entry.detail}`,
      ].join(''),
    );
  }
}

{
  const withRegion = [...elementsById.values()].filter((e) => e.region !== undefined);
  const migrated = withRegion.filter((e) => e.migrated === true);
  const offenders = new Map();
  for (const row of rows) {
    for (const finding of row.findings) {
      if (finding.level !== 'backlog') continue;
      const key = `${finding.check} ${finding.what.replace(/\[.*\]$/, '')}`;
      offenders.set(key, (offenders.get(key) ?? 0) + 1);
    }
  }

  console.log('');
  console.log(
    `MIGRATION — ${migrated.length}/${withRegion.length} elements on the layout contract, ` +
      `${offenders.size} still placing themselves`,
  );
  if (offenders.size > 0) {
    console.log('-'.repeat(80));
    for (const [key, count] of [...offenders.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  → ${pad(count, 5)}${key}`);
    }
  }
}

if (coverage.length > 0) {
  console.log('');
  console.log('UNCOVERED — declared in src/render/ui-elements.ts, produced by no case:');
  for (const miss of coverage) {
    console.log(`  ✖ ${pad(miss.profile, 6)}${pad(miss.id, 30)}${miss.owner}`);
  }
}

const notes = rows.flatMap((row) =>
  row.findings.filter((f) => f.level === 'note').map((f) => `${f.check}: ${f.what}`),
);
if (notes.length > 0) {
  const tally = new Map();
  for (const note of notes) tally.set(note, (tally.get(note) ?? 0) + 1);
  console.log('');
  console.log(`${notes.length} transient world-layer note(s), most frequent:`);
  for (const [note, count] of [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
    console.log(`  · ${count}x  ${note}`);
  }
}

await writeFile(REPORT, JSON.stringify({ rows, coverage, thresholds: THRESHOLDS }, null, 2));

console.log('');
console.log(`${shots.length} shot(s) and the full report in ${SHOT_DIR}/`);
console.log('blue = DOM, pink = viewport-anchored canvas, amber = world-anchored canvas.');

if (hardFailures > 0) {
  console.error(`\n${hardFailures} hard failure(s).`);
  process.exitCode = 1;
} else {
  console.log('\nNo hard failures.');
}
