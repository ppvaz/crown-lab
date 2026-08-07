
import type { CombatConfig, World } from '../sim/types';
import type { Palette } from './palette';
import type { ArchetypeColor } from './palette';
import type { ResolvedPresentation } from '../lab/presentation';
import { reportUiFrame, reportUiRect, reportUiText } from './ui-probe';
import { drawWrappedText, fitText } from './text';
import type { UiElementId } from './ui-elements';
import { AFFORDANCE_ROWS, regionRow, type LayoutFrame, type Rect } from './layout';
import type { Copy } from '../game/copy';
import {
  drawDiamond,
  drawOrnamentalRule,
  UI_DISPLAY_FONT,
  UI_TEXT_FONT,
} from './ui-ornaments';

export interface HudOpts {
  cfg: CombatConfig;
  pal: Palette;
  archetypeColor: ArchetypeColor;
  pres: ResolvedPresentation;
  localPlayer: number;
  attempt: number;
  replaying: boolean;
  viewW: number;
  viewH: number;
  waveCount: number;
  touchControls?: boolean;
  showPowerCooldown?: boolean;
  tutorialPrompt?: string | null;
  routePrompted?: boolean;
  outcomeLabels?: { cleared: string; timeout: string; dead: string };
  copy: Copy;
  retryHint: string;
  frame: LayoutFrame;
}

const bar = (
  id: UiElementId,
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  frac: number,
  bg: string,
  color: string,
): void => {
  ctx.fillStyle = bg;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w * Math.max(0, Math.min(1, frac)), h);
  reportUiRect(id, x, y, w, h);
};

export const drawHud = (ctx: CanvasRenderingContext2D, world: World, opts: HudOpts): void => {
  const hud = opts.pres.hud;
  if (hud.level === 'none' && !hud.health && !opts.tutorialPrompt) return;

  const pal = opts.pal;
  const p = world.players[opts.localPlayer] ?? world.players[0];
  const frame = opts.frame;
  reportUiFrame(frame);
  const type = frame.type;

  const vitals = frame.regions.vitals;
  if (vitals !== undefined) {
    const x = vitals.x;
    ctx.font = `${type.small}px ui-monospace, Menlo, monospace`;
    ctx.textBaseline = 'alphabetic';
    const hpLabel = `${Math.ceil(p.hp)}/${p.maxHp}`;
    const readoutWidth =
      hud.health && hud.damageNumbers ? ctx.measureText(hpLabel).width + 8 : 0;
    const barWidth = Math.max(24, vitals.w - readoutWidth);

    const power = opts.cfg.power;
    const powerDef =
      opts.showPowerCooldown !== false && power !== 'none' && hud.stamina
        ? opts.cfg.powers[power]
        : null;
    const stack = [
      hud.health ? { height: 10, advance: 16 } : null,
      hud.stamina ? { height: 6, advance: 14 } : null,
      powerDef !== null ? { height: 4, advance: 12 } : null,
      hud.comboCounter ? { height: type.small, advance: type.small } : null,
    ].filter((entry): entry is { height: number; advance: number } => entry !== null);
    const resourceHeight = stack.reduce(
      (total, entry, index) =>
        total + (index === stack.length - 1 ? entry.height : entry.advance),
      0,
    );
    const resourceTop = vitals.y + Math.max(0, vitals.h - resourceHeight);
    let y = resourceTop;

    if (hud.health) {
      bar('hud.health.bar', ctx, x, y, barWidth, 10, p.hp / p.maxHp, pal.hudDim, pal.danger);
      if (hud.damageNumbers) {
        ctx.fillStyle = pal.hudText;
        ctx.fillText(hpLabel, x + barWidth + 8, y + 9);
        reportUiText(ctx, 'hud.health.text', hpLabel, x + barWidth + 8, y + 9);
      }
      y += 16;
    }

    if (hud.stamina) {
      bar('hud.stamina.bar', ctx, x, y, barWidth, 6, p.stamina / p.maxStamina, pal.hudDim, pal.stamina);
      y += 14;
    }

    if (powerDef !== null) {
      const ready = 1 - Math.min(1, p.powerCooldownMs / Math.max(1, powerDef.cooldownMs));
      bar('hud.power.bar', ctx, x, y, barWidth * 0.46, 4, ready, pal.hudDim, ready >= 1 ? pal.parryFlash : pal.hudDim);
      y += 12;
    }

    if (hud.comboCounter && p.parryStreak > 0) {
      ctx.fillStyle = pal.parryFlash;
      const streak = `${opts.copy.hud.parryStreak} ${p.parryStreak}`;
      ctx.fillText(streak, x, y + type.small - 3);
      reportUiText(ctx, 'hud.streak.text', streak, x, y + type.small - 3);
    }

  }

  const ripostePrompted =
    p.riposteWindowMs > 0 && hud.level !== 'none' && frame.regions.affordance !== undefined;
  if (ripostePrompted) {
    const affordance = frame.regions.affordance as Rect;
    ctx.font = `${type.base}px ui-monospace, Menlo, monospace`;
    ctx.fillStyle = pal.parryFlash;
    const width = ctx.measureText(opts.copy.hud.riposte).width;
    const rx = affordance.x + (affordance.w - width) / 2;
    const ry = regionRow(frame, affordance, 0, type.base);
    ctx.fillText(opts.copy.hud.riposte, rx, ry);
    reportUiText(ctx, 'hud.riposte.text', opts.copy.hud.riposte, rx, ry);
    ctx.font = `${type.small}px ui-monospace, Menlo, monospace`;
  }

  if (hud.peripheral && !opts.replaying) {
    const objective = frame.regions.objective;
    if (objective !== undefined) {
      const alive = world.enemies.filter((e) => e.state.kind !== 'dead').length;
      const seconds = (world.encounter.elapsedMs / 1000).toFixed(1);
      const words = opts.copy.hud;
      const full = [
        `${words.attempt} ${opts.attempt}`,
        ...(opts.waveCount > 0 ? [`${words.wave} ${world.encounter.nextWave}`] : []),
        `${words.enemies} ${alive}`,
        `${seconds}s`,
      ].join('   ');
      const short = [
        `#${opts.attempt}`,
        ...(opts.waveCount > 0 ? [`w${world.encounter.nextWave}`] : []),
        `x${alive}`,
        `${seconds}s`,
      ].join('  ');

      ctx.font = `${type.small}px ui-monospace, Menlo, monospace`;
      ctx.fillStyle = pal.hudText;
      const spelling = ctx.measureText(full).width <= objective.w ? full : short;
      const status = fitText(ctx, spelling, objective.w);
      const width = ctx.measureText(status).width;
      const sx = Math.max(objective.x, objective.x + objective.w - width);
      const sy = regionRow(frame, objective, 0);
      ctx.fillText(status, sx, sy);
      reportUiText(ctx, 'hud.peripheral.text', status, sx, sy, { full: spelling });
    }
  }

  const boss = world.enemies.find(
    (enemy) =>
      enemy.state.kind !== 'dead' && opts.cfg.enemies[enemy.archetype].boss !== undefined,
  );
  const bossDef = boss === undefined ? undefined : opts.cfg.enemies[boss.archetype].boss;
  const threat = frame.regions.threat;
  if (hud.health && boss !== undefined && bossDef !== undefined && threat !== undefined) {
    const width = Math.min(threat.w, 520);
    const left = threat.x + (threat.w - width) / 2;
    const top = threat.y + type.small;
    ctx.font = `${type.small}px ${UI_DISPLAY_FONT}`;
    ctx.fillStyle = pal.hudText;
    const nameWidth = ctx.measureText(bossDef.name).width;
    ctx.fillText(bossDef.name, threat.x + (threat.w - nameWidth) / 2, top);
    reportUiText(ctx, 'hud.boss.name', bossDef.name, threat.x + (threat.w - nameWidth) / 2, top);
    bar(
      'hud.boss.bar',
      ctx,
      left,
      top + 6,
      width,
      10,
      boss.hp / boss.maxHp,
      pal.hudDim,
      opts.archetypeColor(boss.archetype),
    );
    ctx.save();
    ctx.globalAlpha = 0.72;
    ctx.strokeStyle = pal.playerAccent;
    ctx.lineWidth = 1;
    ctx.strokeRect(left - 0.5, top + 5.5, width + 1, 11);
    drawDiamond(ctx, left - 4, top + 11, 3, pal.playerAccent);
    drawDiamond(ctx, left + width + 4, top + 11, 3, pal.playerAccent);
    ctx.restore();
    if (hud.damageNumbers) {
      const hp = `${Math.ceil(boss.hp)} / ${boss.maxHp}`;
      ctx.font = `${type.small}px ui-monospace, Menlo, monospace`;
      ctx.fillStyle = pal.hudText;
      const hpX = threat.x + (threat.w - ctx.measureText(hp).width) / 2;
      const hpY = top + 8 + 10 + type.small;
      ctx.fillText(hp, hpX, hpY);
      reportUiText(ctx, 'hud.boss.text', hp, hpX, hpY);
    }
  }

  if (opts.replaying) {
    const objective = frame.regions.objective;
    if (objective !== undefined) {
      ctx.font = `${type.base}px ui-monospace, Menlo, monospace`;
      ctx.fillStyle = pal.parryFlash;
      const rw = ctx.measureText(opts.copy.hud.replay).width;
      const rx = Math.max(objective.x, objective.x + objective.w - rw);
      const ry = regionRow(frame, objective, 0);
      ctx.fillText(opts.copy.hud.replay, rx, ry);
      reportUiText(ctx, 'hud.replay.text', opts.copy.hud.replay, rx, ry);
    }
    return;
  }

  const affordanceRegion = frame.regions.affordance;
  if (
    hud.prompts &&
    opts.tutorialPrompt !== null &&
    opts.tutorialPrompt !== undefined &&
    affordanceRegion !== undefined &&
    !ripostePrompted &&
    opts.routePrompted !== true
  ) {
    ctx.font = `${type.base}px ui-monospace, Menlo, monospace`;
    ctx.fillStyle = pal.hudText;
    ctx.textAlign = 'center';
    drawWrappedText(
      ctx,
      'hud.tutorial.text',
      opts.tutorialPrompt,
      affordanceRegion.w,
      AFFORDANCE_ROWS,
      affordanceRegion.x + affordanceRegion.w / 2,
      (row) => regionRow(frame, affordanceRegion, row, type.base),
    );
    ctx.textAlign = 'left';
  }

  const verdict = frame.regions.verdict;
  if (world.outcome !== 'running' && hud.prompts && verdict !== undefined) {
    ctx.font = `${type.display}px ${UI_DISPLAY_FONT}`;
    ctx.fillStyle = world.outcome === 'cleared' ? pal.stamina : pal.danger;
    const labels = opts.outcomeLabels;
    const label =
      world.outcome === 'cleared'
        ? (labels?.cleared ?? 'CLEARED')
        : world.outcome === 'timeout'
          ? (labels?.timeout ?? 'TIMEOUT')
          : (labels?.dead ?? 'DEAD');
    const labelX = verdict.x + (verdict.w - ctx.measureText(label).width) / 2;
    const labelY = verdict.y + type.display;
    const ruleWidth = Math.min(verdict.w, 360);
    drawOrnamentalRule(
      ctx,
      verdict.x + (verdict.w - ruleWidth) / 2,
      verdict.x + (verdict.w + ruleWidth) / 2,
      verdict.y + Math.max(1, type.small * 0.2),
      pal.playerAccent,
      0.64,
    );
    ctx.fillText(label, labelX, labelY);
    reportUiText(ctx, 'hud.outcome.text', label, labelX, labelY);

    ctx.font = `${type.small}px ${UI_TEXT_FONT}`;
    ctx.fillStyle = pal.hudText;
    const hint = opts.retryHint;
    const hintX = verdict.x + (verdict.w - ctx.measureText(hint).width) / 2;
    ctx.fillText(hint, hintX, labelY + type.small + 8);
    reportUiText(ctx, 'hud.retry.text', hint, hintX, labelY + type.small + 8);
  }
};
