import { mkdir } from 'node:fs/promises';
import process from 'node:process';
import { launchChrome, startViteServer, waitForServer } from './lib/harness.mjs';
import { listArg } from './lib/args.mjs';

const PORT = 5199;
const BASE = `http://localhost:${PORT}`;
const SHOT_DIR = 'captures/touch-audit';

const DEVICES = {
  'iphone-se': { css: [375, 667], mm: [58.5, 104.1] },
  'galaxy-narrow': { css: [360, 740], mm: [64.6, 132.8] },
  'pixel-7': { css: [412, 915], mm: [69.8, 155.1] },
  'iphone-14': { css: [390, 844], mm: [71.5, 154.7] },
  'iphone-14-pro-max': { css: [430, 932], mm: [77.6, 168.2] },
};

const CORE_ACTIONS = ['light', 'heavy', 'guard', 'step'];

const ACTION_SETS = {
  public: [...CORE_ACTIONS, 'power'],
  'lab-max': [...CORE_ACTIONS, 'power', 'focus', 'interact'],
};

const BASELINE_OFFSETS = {
  light: [0, 1.1],
  heavy: [1.05, 0],
  guard: [2.1, 0.2],
  step: [1.15, 1.25],
  power: [0.1, 2.3],
  focus: [2.3, 1.45],
  interact: [1.3, 2.5],
};
const BASELINE_BOX = [3.3, 3.5];

const THRESHOLDS = {
  radialSpreadFail: 0.25,
  radialSpreadWarn: 0.1,
  diameterWarn: 9,
  diameterFail: 7,
  combatGapWarn: 2,
  anyGapFail: 0,
  reachWarn: 60,
  reachFail: 75,
};


const measure = ({ baseline, visible }) => {
  const root = document.getElementById('touch-controls');
  if (root === null) return { error: 'no #touch-controls in the page' };
  document.body.classList.add('touch-enabled', 'input-touch');

  if (baseline !== null) {
    const style = document.createElement('style');
    style.textContent = `
      .touch-actions { width: calc(var(--touch-btn) * ${baseline.box[0]}) !important;
                       height: calc(var(--touch-btn) * ${baseline.box[1]}) !important; }
      ${Object.entries(baseline.offsets)
        .map(
          ([action, [right, bottom]]) =>
            `.touch-button--${action} { right: calc(var(--touch-btn) * ${right}) !important;
                                        bottom: calc(var(--touch-btn) * ${bottom}) !important; }`,
        )
        .join('\n')}`;
    document.head.appendChild(style);
  }

  const cluster = root.querySelector('.touch-actions');
  const stick = root.querySelector('.touch-stick');
  const toolbar = root.querySelector('.touch-toolbar');
  if (cluster === null || stick === null) return { error: 'cluster or stick missing' };

  const buttons = /** @type {HTMLElement[]} */ ([...root.querySelectorAll('[data-touch-action]')]);
  for (const button of buttons) button.hidden = !visible.includes(button.dataset.touchAction);
  const shown = buttons.filter((button) => !button.hidden);
  if (shown.length !== visible.length) {
    return { error: `expected ${visible.length} buttons, page has ${shown.length}` };
  }

  void cluster.getBoundingClientRect();

  const rectOf = (element) => {
    const r = element.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, w: r.width, h: r.height };
  };

  return {
    viewport: { w: window.innerWidth, h: window.innerHeight },
    unit: shown[0].getBoundingClientRect().width,
    cluster: rectOf(cluster),
    stick: rectOf(stick),
    toolbar: toolbar === null ? null : rectOf(toolbar),
    buttons: shown.map((button) => ({ action: button.dataset.touchAction, ...rectOf(button) })),
  };
};

const drawArcOverlay = (coreActions) => {
  const root = document.getElementById('touch-controls');
  const cluster = root.querySelector('.touch-actions');
  const box = cluster.getBoundingClientRect();
  const unit = root.querySelector('[data-touch-action]:not([hidden])').getBoundingClientRect().width;
  const pivot = { x: box.right + 0.4 * unit, y: box.bottom + 0.4 * unit };

  const centres = coreActions
    .map((action) => root.querySelector(`[data-touch-action="${action}"]`))
    .filter((button) => button !== null && !button.hidden)
    .map((button) => {
      const r = button.getBoundingClientRect();
      return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 };
    });
  const radius =
    centres.reduce((total, c) => total + Math.hypot(c.x - pivot.x, c.y - pivot.y), 0) /
    centres.length;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('style', 'position:fixed;inset:0;pointer-events:none;z-index:99');
  svg.setAttribute('width', String(window.innerWidth));
  svg.setAttribute('height', String(window.innerHeight));
  svg.innerHTML = `
    <circle cx="${pivot.x}" cy="${pivot.y}" r="${radius}"
            fill="none" stroke="#4ade80" stroke-width="2" stroke-dasharray="7 5" opacity="0.95"/>
    <circle cx="${pivot.x}" cy="${pivot.y}" r="7" fill="#4ade80"/>
    ${centres
      .map(
        (c) =>
          `<line x1="${pivot.x}" y1="${pivot.y}" x2="${c.x}" y2="${c.y}"
                 stroke="#4ade80" stroke-width="1.5" opacity="0.5"/>`,
      )
      .join('')}`;
  document.body.appendChild(svg);
};

const overlaps = (a, b) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

const analyse = (raw, mmPerPx) => {
  const unit = raw.unit;
  const centres = raw.buttons.map((b) => ({
    action: b.action,
    x: (b.left + b.right) / 2,
    y: (b.top + b.bottom) / 2,
    d: (b.w + b.h) / 2,
    rect: b,
  }));

  const pivot = { x: raw.cluster.right + 0.4 * unit, y: raw.cluster.bottom + 0.4 * unit };
  const radius = (c) => Math.hypot(c.x - pivot.x, c.y - pivot.y);

  const coreRadii = centres
    .filter((c) => CORE_ACTIONS.includes(c.action))
    .map((c) => ({ action: c.action, r: radius(c) }));
  const radialSpreadPx =
    coreRadii.length === 0
      ? 0
      : Math.max(...coreRadii.map((c) => c.r)) - Math.min(...coreRadii.map((c) => c.r));

  const gaps = { combat: { mm: Infinity, pair: '' }, any: { mm: Infinity, pair: '' } };
  for (let i = 0; i < centres.length; i += 1) {
    for (let j = i + 1; j < centres.length; j += 1) {
      const a = centres[i];
      const b = centres[j];
      const mm = (Math.hypot(a.x - b.x, a.y - b.y) - (a.d + b.d) / 2) * mmPerPx;
      const pair = `${a.action}/${b.action}`;
      if (mm < gaps.any.mm) gaps.any = { mm, pair };
      if (
        CORE_ACTIONS.includes(a.action) &&
        CORE_ACTIONS.includes(b.action) &&
        mm < gaps.combat.mm
      ) {
        gaps.combat = { mm, pair };
      }
    }
  }

  const offscreen = centres
    .filter(
      (c) =>
        c.rect.left < 0 ||
        c.rect.top < 0 ||
        c.rect.right > raw.viewport.w ||
        c.rect.bottom > raw.viewport.h,
    )
    .map((c) => c.action);

  const bottomBandMm = (raw.cluster.left - raw.stick.right) * mmPerPx;

  return {
    unit,
    bottomBandMm,
    diameterMm: unit * mmPerPx,
    radialSpreadUnits: radialSpreadPx / unit,
    radialSpreadMm: radialSpreadPx * mmPerPx,
    maxReachMm: Math.max(...centres.map((c) => radius(c) + c.d / 2)) * mmPerPx,
    gaps,
    stickOverlap: overlaps(raw.cluster, raw.stick),
    toolbarOverlap: raw.toolbar !== null && overlaps(raw.cluster, raw.toolbar),
    offscreen,
  };
};

const verdicts = (m) => {
  const out = [];
  const check = (name, value, warn, fail, compare) => {
    if (compare(value, fail)) out.push({ level: 'fail', name, value });
    else if (compare(value, warn)) out.push({ level: 'warn', name, value });
  };
  const above = (v, limit) => v > limit;
  const below = (v, limit) => v < limit;

  check(
    'core actions off one arc',
    m.radialSpreadUnits,
    THRESHOLDS.radialSpreadWarn,
    THRESHOLDS.radialSpreadFail,
    above,
  );
  check('button too small', m.diameterMm, THRESHOLDS.diameterWarn, THRESHOLDS.diameterFail, below);
  check(
    `combat buttons close (${m.gaps.combat.pair})`,
    m.gaps.combat.mm,
    THRESHOLDS.combatGapWarn,
    THRESHOLDS.anyGapFail,
    below,
  );
  if (m.gaps.any.mm <= THRESHOLDS.anyGapFail) {
    out.push({ level: 'fail', name: `buttons touch (${m.gaps.any.pair})`, value: m.gaps.any.mm });
  }
  check('reach too far', m.maxReachMm, THRESHOLDS.reachWarn, THRESHOLDS.reachFail, above);
  if (m.stickOverlap) out.push({ level: 'fail', name: 'cluster overlaps movement stick', value: 1 });
  if (m.toolbarOverlap) out.push({ level: 'fail', name: 'cluster overlaps toolbar', value: 1 });
  if (m.offscreen.length > 0) {
    out.push({ level: 'fail', name: `offscreen: ${m.offscreen.join(', ')}`, value: 1 });
  }
  return out;
};

const devices = listArg('devices', Object.keys(DEVICES));
const orientations = listArg('orientations', ['portrait', 'landscape']);
const sets = listArg('sets', Object.keys(ACTION_SETS));
const withBaseline = process.argv.includes('--baseline');

const { proc: server, state: serverState } = startViteServer({ port: PORT });

const rows = [];
const shots = [];
let hardFailures = 0;

try {
  await mkdir(SHOT_DIR, { recursive: true });
  await waitForServer(BASE, serverState);
  const browser = await launchChrome();

  for (const deviceName of devices) {
    const device = DEVICES[deviceName];
    if (!device) {
      console.error(`unknown device: ${deviceName}`);
      hardFailures += 1;
      continue;
    }
    const mmPerPx = device.mm[0] / device.css[0];

    for (const orientation of orientations) {
      const [width, height] =
        orientation === 'portrait' ? device.css : [device.css[1], device.css[0]];
      const context = await browser.newContext({
        viewport: { width, height },
        hasTouch: true,
        isMobile: true,
        deviceScaleFactor: 3,
      });
      const page = await context.newPage();
      page.on('pageerror', (error) => console.error(`  browser: ${error.message}`));

      const variants = withBaseline
        ? [
            { label: 'arc', baseline: null },
            { label: 'lattice', baseline: { offsets: BASELINE_OFFSETS, box: BASELINE_BOX } },
          ]
        : [{ label: 'arc', baseline: null }];

      for (const setName of sets) {
        const visible = ACTION_SETS[setName];
        if (!visible) {
          console.error(`unknown action set: ${setName}`);
          hardFailures += 1;
          continue;
        }
        for (const variant of variants) {
          await page.goto(BASE, { waitUntil: 'networkidle' });
          const raw = await page.evaluate(measure, { baseline: variant.baseline, visible });
          if (raw.error) {
            console.error(`✖ ${deviceName}/${orientation}/${setName}: ${raw.error}`);
            hardFailures += 1;
            continue;
          }
          const metrics = analyse(raw, mmPerPx);
          const issues = verdicts(metrics);
          const gating = setName === 'public' && variant.label === 'arc';
          if (gating) hardFailures += issues.filter((i) => i.level === 'fail').length;
          if (variant.label === 'arc') {
            await page.evaluate(drawArcOverlay, CORE_ACTIONS);
            shots.push(`${SHOT_DIR}/${deviceName}-${orientation}-${setName}.png`);
            await page.screenshot({ path: shots[shots.length - 1] });
          }
          rows.push({
            deviceName,
            orientation,
            setName,
            variant: variant.label,
            gating,
            metrics,
            issues,
          });
        }
      }
      await context.close();
    }
  }

  await browser.close();
} finally {
  server.kill();
}

const pad = (value, width) => String(value).padEnd(width);
const num = (value, digits = 1) => value.toFixed(digits);
const columns = [
  ['device', '', 19],
  ['orient', '', 10],
  ['set', '', 9],
  ...(withBaseline ? [['layout', '', 9]] : []),
  ['btn', 'mm', 7],
  ['reach-curl', 'mm / units', 13],
  ['gap:fight', 'mm', 11],
  ['gap:any', 'mm', 9],
  ['reach', 'mm', 8],
  ['free-bottom', 'mm', 13],
  ['status', '', 6],
];

console.log('');
console.log(columns.map(([head, , width]) => pad(head, width)).join(''));
console.log(columns.map(([, unit, width]) => pad(unit, width)).join(''));
console.log('-'.repeat(columns.reduce((total, column) => total + /** @type {number} */ (column[2]), 0)));

for (const row of rows) {
  const m = row.metrics;
  const failed = row.issues.some((i) => i.level === 'fail');
  const status = failed ? (row.gating ? 'FAIL' : 'fail*') : row.issues.length > 0 ? 'warn' : 'ok';
  console.log(
    [
      pad(row.deviceName, 19),
      pad(row.orientation, 10),
      pad(row.setName, 9),
      ...(withBaseline ? [pad(row.variant, 9)] : []),
      pad(num(m.diameterMm), 7),
      pad(`${num(m.radialSpreadMm)} / ${num(m.radialSpreadUnits, 2)}`, 13),
      pad(num(m.gaps.combat.mm), 11),
      pad(num(m.gaps.any.mm), 9),
      pad(num(m.maxReachMm), 8),
      pad(num(m.bottomBandMm), 13),
      status,
    ].join(''),
  );
  for (const issue of row.issues) {
    console.log(`${' '.repeat(19)}${issue.level === 'fail' ? '✖' : '!'} ${issue.name}`);
  }
}

console.log('');
console.log('reach-curl  spread of the four always-available actions across arc radius — the');
console.log('            flexion-extension billed per transition between them. On one arc it is 0.');
console.log('gap:fight   closest pair where both are core combat actions (edge to edge).');
console.log('fail*       non-gating: only reachable with every lab toggle on at once.');
console.log('');
console.log(`${shots.length} shot(s) in ${SHOT_DIR}/ — dashed circle is the arc, dot is the`);
console.log('modelled thumb pivot, spokes run to the four core buttons.');

if (hardFailures > 0) {
  console.error(`\n${hardFailures} hard failure(s) in the shipped layout.`);
  process.exitCode = 1;
} else {
  console.log('\nNo hard failures in the shipped layout.');
}
