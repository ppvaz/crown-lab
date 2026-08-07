
import type { CombatConfig, Player, World } from '../sim/types';
import { TICK_MS } from '../sim/types';
import { PALETTE } from './palette';
import type { MasteryComponents, MasteryEstimate } from '../lab/estimator';
import type { Camera } from './iso';
import { worldToScreen } from './iso';
import { reportUiRect, reportUiText } from './ui-probe';
import type { LayoutFrame } from './layout';

export interface DebugOpts {
  cfg: CombatConfig;
  showTimeline: boolean;
  showStates: boolean;
  recentOffsets: number[];
  mastery: MasteryEstimate | null;
  vignette: { amount: number; held: boolean } | null;
  frame: LayoutFrame;
  railUp: boolean;
  localPlayer: number;
}

const subject = (world: World, localPlayer: number): Player =>
  world.players[localPlayer] ?? world.players[0];

const BAND_H = 16;

const label = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string): void => {
  ctx.fillStyle = color;
  ctx.font = '10px ui-monospace, Menlo, monospace';
  ctx.fillText(text, x, y);
};

const focusEnemy = (world: World) => {
  const committed = world.enemies.filter(
    (e) => e.state.kind === 'telegraph' || e.state.kind === 'attack',
  );
  if (committed.length === 0) return null;
  return committed.reduce((a, b) => (a.state.elapsedMs >= b.state.elapsedMs ? a : b));
};

const drawTimeline = (
  ctx: CanvasRenderingContext2D,
  world: World,
  cam: Camera,
  opts: DebugOpts,
  panel: { x: number; y: number; w: number; h: number },
): void => {
  const enemy = focusEnemy(world);
  const bandW = Math.max(120, panel.w - 20);
  const x0 = panel.x + 10;
  const y0 = panel.y + 22;

  ctx.fillStyle = 'rgba(8,8,11,0.72)';
  ctx.fillRect(panel.x, panel.y, panel.w, BAND_H + 62);
  reportUiRect('debug.timeline.panel', panel.x, panel.y, panel.w, BAND_H + 62);

  if (enemy === null) {
    label(ctx, 'attack timeline — idle', x0, y0 - 8, PALETTE.hudDim);
    return;
  }

  const ecfg = opts.cfg.enemies[enemy.archetype];
  const def = ecfg.attacks[enemy.state.attackIndex];
  if (def === undefined) return;

  const prep = def.telegraphMs + enemy.state.telegraphJitterMs;
  const total = prep + def.activeMs + def.recoveryMs;
  const px = (ms: number) => x0 + (Math.max(0, Math.min(total, ms)) / total) * bandW;

  label(
    ctx,
    `attack timeline — ${enemy.archetype}:${def.id}${def.parryable ? '' : '  UNPARRYABLE'}`,
    x0,
    y0 - 8,
    def.parryable ? PALETTE.hudText : PALETTE.unparryable,
  );

  ctx.fillStyle = PALETTE.hudDim;
  ctx.fillRect(x0, y0, bandW, BAND_H);
  ctx.fillStyle = def.parryable ? PALETTE.telegraph : PALETTE.unparryable;
  ctx.globalAlpha = 0.5;
  ctx.fillRect(px(prep), y0, px(prep + def.activeMs) - px(prep), BAND_H);
  ctx.globalAlpha = 1;

  if (def.parryable) {
    const parry = opts.cfg.player.parry;
    const opens = prep - (parry.onsetMs + parry.perfectMs);
    const closes = prep - (parry.onsetMs - parry.bufferMs);
    ctx.fillStyle = PALETTE.parryFlash;
    ctx.globalAlpha = 0.45;
    ctx.fillRect(px(opens), y0 - 5, Math.max(2, px(closes) - px(opens)), BAND_H + 10);
    ctx.globalAlpha = 1;
  }

  const cursor = px(enemy.state.elapsedMs);
  ctx.strokeStyle = PALETTE.hudText;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cursor, y0 - 7);
  ctx.lineTo(cursor, y0 + BAND_H + 7);
  ctx.stroke();

  const p = subject(world, opts.localPlayer);
  if (p.state.kind === 'parry') {
    const pressedAt = enemy.state.elapsedMs - p.state.elapsedMs;
    ctx.strokeStyle = PALETTE.parryFlash;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px(pressedAt), y0 - 10);
    ctx.lineTo(px(pressedAt), y0 + BAND_H + 10);
    ctx.stroke();
  }

  label(ctx, 'prep', x0 + 2, y0 + BAND_H + 12, PALETTE.hudDim);
  label(ctx, 'contact', px(prep) + 2, y0 + BAND_H + 12, PALETTE.hudDim);
  label(ctx, 'recovery', px(prep + def.activeMs) + 2, y0 + BAND_H + 12, PALETTE.hudDim);
  label(ctx, `${Math.round(total)}ms`, x0 + bandW - 42, y0 + BAND_H + 12, PALETTE.hudDim);

  drawOffsetScatter(ctx, opts, x0, y0 + BAND_H + 26, bandW);
};

const drawOffsetScatter = (
  ctx: CanvasRenderingContext2D,
  opts: DebugOpts,
  x0: number,
  y: number,
  bandW: number,
): void => {
  const parry = opts.cfg.player.parry;
  const span = Math.max(240, parry.perfectMs * 2.5);
  const mid = x0 + bandW / 2;
  const toX = (ms: number) => mid + (Math.max(-span, Math.min(span, ms)) / span) * (bandW / 2);

  ctx.strokeStyle = PALETTE.hudDim;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x0, y);
  ctx.lineTo(x0 + bandW, y);
  ctx.stroke();

  ctx.fillStyle = PALETTE.parryFlash;
  ctx.globalAlpha = 0.28;
  ctx.fillRect(toX(-parry.perfectMs / 2), y - 6, toX(parry.perfectMs / 2) - toX(-parry.perfectMs / 2), 12);
  ctx.globalAlpha = 1;

  const recent = opts.recentOffsets.slice(-40);
  for (let i = 0; i < recent.length; i++) {
    ctx.globalAlpha = 0.35 + 0.65 * (i / Math.max(1, recent.length - 1));
    ctx.fillStyle = Math.abs(recent[i]) <= parry.perfectMs / 2 ? PALETTE.stamina : PALETTE.danger;
    ctx.fillRect(toX(recent[i]) - 1.5, y - 5, 3, 10);
  }
  ctx.globalAlpha = 1;
  label(ctx, 'early', x0 + 2, y + 16, PALETTE.hudDim);
  label(ctx, 'timing error', mid - 30, y + 16, PALETTE.hudDim);
  label(ctx, 'late', x0 + bandW - 22, y + 16, PALETTE.hudDim);
};





const BAR_W = 110;
const BAR_H = 8;
const ROW_H = 15;
const LABEL_W = 84;

const COMPONENT_ROWS: ReadonlyArray<readonly [keyof MasteryComponents, string]> = [
  ['parryAccuracy', 'accuracy'],
  ['timing', 'timing'],
  ['anticipation', 'anticipation'],
  ['recovery', 'recovery'],
  ['continuity', 'continuity'],
];

const scoreColor = (v: number): string =>
  v >= 0.6 ? PALETTE.stamina : v >= 0.3 ? PALETTE.parryFlash : PALETTE.danger;

const wrap = (text: string, maxChars: number): string[] => {
  const out: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    if (line !== '' && line.length + 1 + word.length > maxChars) {
      out.push(line);
      line = word;
    } else {
      line = line === '' ? word : `${line} ${word}`;
    }
  }
  if (line !== '') out.push(line);
  return out;
};

const drawBar = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  name: string,
  value: number | null,
): void => {
  label(ctx, name, x, y + BAR_H, PALETTE.hudText);

  const barX = x + LABEL_W;
  ctx.fillStyle = PALETTE.hudDim;
  ctx.globalAlpha = 0.35;
  ctx.fillRect(barX, y, BAR_W, BAR_H);
  ctx.globalAlpha = 1;

  if (value === null) {
    label(ctx, '--', barX + BAR_W + 8, y + BAR_H, PALETTE.hudDim);
    return;
  }

  ctx.fillStyle = scoreColor(value);
  ctx.fillRect(barX, y, BAR_W * value, BAR_H);
  label(ctx, value.toFixed(2), barX + BAR_W + 8, y + BAR_H, PALETTE.hudText);
};

const drawMastery = (
  ctx: CanvasRenderingContext2D,
  est: MasteryEstimate | null,
  vignette: { amount: number; held: boolean } | null,
  panel: { x: number; y: number; w: number; h: number },
): void => {
  const MASTERY_X = panel.x + 10;
  const MASTERY_Y = panel.y + 10;
  const MASTERY_W = Math.max(120, panel.w - 20);
  const rows = est === null ? 0 : COMPONENT_ROWS.length;
  const rationale = est === null ? [] : est.rationale.flatMap((r) => wrap(r, 46));
  const vignetteRow = vignette === null ? 0 : 12;
  const height = Math.min(panel.h, 26 + vignetteRow + rows * ROW_H + rationale.length * 12 + 8);

  ctx.fillStyle = 'rgba(8,8,11,0.72)';
  ctx.fillRect(MASTERY_X - 10, MASTERY_Y - 10, MASTERY_W + 20, height);
  reportUiRect('debug.mastery.panel', MASTERY_X - 10, MASTERY_Y - 10, MASTERY_W + 20, height);

  if (vignette !== null) {
    const source = vignette.held ? 'held' : 'presentation';
    label(ctx, `vignette ${vignette.amount.toFixed(2)} (${source})`, MASTERY_X, MASTERY_Y + 8 + (est === null ? 12 : 0), PALETTE.hudDim);
  }

  if (est === null) {
    label(ctx, 'mastery — (no completed runs yet)', MASTERY_X, MASTERY_Y + 8, PALETTE.hudDim);
    return;
  }

  label(ctx, `mastery — ${est.stage}`, MASTERY_X, MASTERY_Y + 8 + vignetteRow, PALETTE.hudText);

  let y = MASTERY_Y + 20 + vignetteRow;
  for (const [key, name] of COMPONENT_ROWS) {
    drawBar(ctx, MASTERY_X, y, name, est.components[key]);
    y += ROW_H;
  }

  y += 4;
  for (const line of rationale) {
    label(ctx, line, MASTERY_X, y, PALETTE.hudDim);
    y += 12;
  }
};

const drawStates = (ctx: CanvasRenderingContext2D, world: World, cam: Camera, localPlayer: number): void => {
  ctx.font = '10px ui-monospace, Menlo, monospace';
  for (const e of world.enemies) {
    if (e.state.kind === 'dead') continue;
    const p = worldToScreen(cam, e.pos);
    const committing = e.state.kind === 'telegraph' || e.state.kind === 'attack';
    ctx.fillStyle = committing ? PALETTE.telegraph : PALETTE.hudDim;
    const text = `${e.id}:${e.state.kind} ${Math.round(e.state.elapsedMs)}`;
    ctx.fillText(text, p.x + 10, p.y - 54);
    reportUiText(ctx, 'world.state.enemy', text, p.x + 10, p.y - 54, { instance: String(e.id) });
  }

  const p = worldToScreen(cam, subject(world, localPlayer).pos);
  ctx.fillStyle = PALETTE.hudText;
  const king = subject(world, localPlayer);
  const playerText = `${king.state.kind} ${Math.round(king.state.elapsedMs)}`;
  ctx.fillText(playerText, p.x + 10, p.y - 62);
  reportUiText(ctx, 'world.state.player', playerText, p.x + 10, p.y - 62);
};

export const drawDebug = (
  ctx: CanvasRenderingContext2D,
  world: World,
  cam: Camera,
  opts: DebugOpts,
): void => {
  if (opts.showStates) drawStates(ctx, world, cam, opts.localPlayer);
  const instruments = opts.frame.regions.instruments;

  if (opts.showTimeline && instruments !== undefined && !opts.railUp) {
    const masteryHeight = Math.min(instruments.h * 0.5, 220);
    drawMastery(ctx, opts.mastery, opts.vignette, {
      x: instruments.x,
      y: instruments.y,
      w: instruments.w,
      h: masteryHeight,
    });
    drawTimeline(ctx, world, cam, opts, {
      x: instruments.x,
      y: instruments.y + masteryHeight,
      w: instruments.w,
      h: instruments.h - masteryHeight,
    });
  }
};

export interface PanelInfo {
  localPlayer: number;
  combatId: string;
  slowMoId: string;
  encounterId: string;
  seed: number;
  attempt: number;
  hash: number;
  fps: number;
  paused: boolean;
  invincible: boolean;
  infiniteStamina: boolean;
  recentEvents: string[];
  mastery: MasteryEstimate | null;
}

const fmtScore = (v: number | null): string => (v === null ? '--' : v.toFixed(2));

const masteryLines = (est: MasteryEstimate | null): string[] => {
  if (est === null) return ['mastery     (no completed runs yet)'];

  const c = est.components;
  return [
    `mastery     stage ${est.stage}`,
    `  accuracy      ${fmtScore(c.parryAccuracy)}`,
    `  timing        ${fmtScore(c.timing)}`,
    `  anticipation  ${fmtScore(c.anticipation)}`,
    `  recovery      ${fmtScore(c.recovery)}`,
    `  continuity    ${fmtScore(c.continuity)}`,
    ...est.rationale.map((r) => `  > ${r}`),
  ];
};

export const panelText = (world: World, cfg: CombatConfig, info: PanelInfo): string => {
  const p = subject(world, info.localPlayer);
  const parry = cfg.player.parry;
  const scales = world.slowMo.scales;

  const lines: string[] = [
    `CROWN LAB   ${info.fps.toFixed(0)} fps${info.paused ? '   [PAUSED]' : ''}`,
    '',
    `experiment  ${info.combatId}`,
    `slow-motion ${info.slowMoId}`,
    `encounter   ${info.encounterId}`,
    `seed        ${info.seed}      attempt ${info.attempt}`,
    `tick        ${world.tick}   hash ${info.hash.toString(16)}`,
    `outcome     ${world.outcome}`,
    '',
    `player      ${p.state.kind} ${Math.round(p.state.elapsedMs)}ms`,
    `hp          ${p.hp.toFixed(1)} / ${p.maxHp}`,
    `stamina     ${p.stamina.toFixed(1)} / ${p.maxStamina}`,
    `streak      ${p.parryStreak}`,
    `riposte     ${p.riposteWindowMs > 0 ? `${Math.round(p.riposteWindowMs)}ms` : '-'}`,
    `lockout     ${p.parryLockoutMs > 0 ? `${Math.round(p.parryLockoutMs)}ms` : '-'}`,
    `iframes     ${p.iframeMs > 0 ? `${Math.round(p.iframeMs)}ms` : '-'}`,
    '',
    `parry       onset ${parry.onsetMs}  perfect ${parry.perfectMs}  late ${parry.lateMs}`,
    `            buffer ${parry.bufferMs}  arc ${parry.arcDeg}  lockout ${parry.whiffLockoutMs}`,
    '',
    `timescale   world ${scales.world.toFixed(2)}  player ${scales.player.toFixed(2)}`,
    `slowmo      ${world.slowMo.active ? 'ACTIVE' : 'idle'}  used ${subject(world, info.localPlayer).slowMoUsedThisEncounter}  charge ${world.slowMo.charge}`,
    `            last ${world.slowMo.lastTrigger ?? '-'}  cd ${Math.round(subject(world, info.localPlayer).slowMoCooldownMs)}ms`,
    `hitstop     ${world.hitstopMs > 0 ? `${world.hitstopMs.toFixed(1)}ms` : '-'}`,
    '',
    ...masteryLines(info.mastery),
    '',
    `enemies     ${world.enemies.filter((e) => e.state.kind !== 'dead').length} alive`,
  ];

  for (const e of world.enemies) {
    if (e.state.kind === 'dead') continue;
    lines.push(
      `  ${String(e.id).padStart(2)} ${e.archetype.padEnd(8)} ${e.state.kind.padEnd(10)} ` +
        `hp ${e.hp.toFixed(0).padStart(3)} poise ${e.poise.toFixed(0).padStart(3)}`,
    );
  }

  if (info.invincible || info.infiniteStamina) {
    lines.push('', `cheats      ${[info.invincible && 'invincible', info.infiniteStamina && 'stamina'].filter(Boolean).join(' ')}`);
  }

  lines.push('', 'recent events');
  for (const e of info.recentEvents.slice(-14)) lines.push(`  ${e}`);

  lines.push(
    '',
    'WASD move   mouse aim   LMB/J light   RMB/K heavy',
    'Shift guard+parry   Space step   F focus',
    'R restart   P pause   O step 1 tick   shift+O back 1 tick   H hitboxes',
    'T timeline  U hud     E export run    V replay last   6 fps meter',
    'K turntable role   L pose',
    '7 import run (a pilot run replays as it loads)',
    'C route: the first crown, court to throne',
    '/ camera: action frames the fight, static holds the room',
    '\\ weather: clear/drizzle/rain/storm — the live room only',
    '[ ] combat  ; \' slowmo   , . encounter   - = seed',
    'X reset selections to defaults',
    `tick ${TICK_MS.toFixed(2)}ms`,
  );

  return lines.join('\n');
};
