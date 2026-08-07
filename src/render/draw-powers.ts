
import type { Player, PowerDef, World } from '../sim/types';
import type { Camera } from './iso';
import { groundEllipse, worldToScreen } from './iso';
import { blinkTarget, pullTarget, targetsInCone } from '../sim/powers';
import { drawLightningField } from './lightning';
import { withAlpha as withAlphaHex } from './palette';
import type { DrawOpts } from './draw';
import { DEG, TAU, groundWedge, mixHex, sceneTimeMs } from './draw-primitives';

export const drawChannelCone = (
  ctx: CanvasRenderingContext2D,
  world: World,
  cam: Camera,
  opts: DrawOpts,
): void => {
  if (opts.cfg.power === 'none') return;
  const def = opts.cfg.powers[opts.cfg.power];
  if (def.channeled !== true) return;

  for (const p of world.players) {
    if (p.powerChannelMs <= 0) continue;
    drawOneChannelCone(ctx, world, cam, opts, p, def);
  }
};

const drawOneChannelCone = (
  ctx: CanvasRenderingContext2D,
  world: World,
  cam: Camera,
  opts: DrawOpts,
  p: Player,
  def: PowerDef,
): void => {
  const origin = {
    x: p.pos.x + Math.cos(p.facing) * def.originOffset,
    y: p.pos.y + Math.sin(p.facing) * def.originOffset,
  };

  const grow = Math.min(1, p.powerChannelMs / Math.max(1, def.channelWindupMs));
  const maxReach = def.range * (1 - (1 - grow) * (1 - grow));

  const blockers = world.enemies
    .filter((e) => e.state.kind !== 'dead')
    .map((e) => {
      const dx = e.pos.x - origin.x;
      const dy = e.pos.y - origin.y;
      const d = Math.hypot(dx, dy);
      const r = opts.cfg.enemies[e.archetype].radius;
      return { bearing: Math.atan2(dy, dx), d, halfWidth: d <= r ? Math.PI : Math.asin(r / d) };
    });

  const half = (def.arcDeg * DEG) / 2;
  const steps = Math.max(24, Math.round(def.arcDeg));
  const o = worldToScreen(cam, origin);

  ctx.beginPath();
  ctx.moveTo(o.x, o.y);
  for (let i = 0; i <= steps; i++) {
    const a = p.facing - half + (i / steps) * half * 2;
    let reach = maxReach;
    for (const b of blockers) {
      let delta = (a - b.bearing) % (Math.PI * 2);
      if (delta <= -Math.PI) delta += Math.PI * 2;
      if (delta > Math.PI) delta -= Math.PI * 2;
      if (Math.abs(delta) <= b.halfWidth) reach = Math.min(reach, Math.max(0, b.d - 0.25));
    }
    const q = worldToScreen(cam, {
      x: origin.x + Math.cos(a) * reach,
      y: origin.y + Math.sin(a) * reach,
    });
    ctx.lineTo(q.x, q.y);
  }
  ctx.closePath();

  const strain = 1 - p.stamina / Math.max(1, opts.cfg.player.maxStamina);
  const color =
    p.stamina <= 0
      ? opts.pal.lightningOvercast
      : strain <= 0.5
        ? mixHex(opts.pal.lightning, opts.pal.lightningStrained, strain / 0.5)
        : mixHex(opts.pal.lightningStrained, opts.pal.lightningOvercast, (strain - 0.5) / 0.5);



  const o2 = worldToScreen(cam, origin);
  const rimPx = maxReach * 34 * cam.zoom;
  const wash = ctx.createRadialGradient(o2.x, o2.y, 0, o2.x, o2.y, Math.max(1, rimPx));
  wash.addColorStop(0, withAlphaHex(color, 0.2));
  wash.addColorStop(0.55, withAlphaHex(color, 0.07));
  wash.addColorStop(1, withAlphaHex(color, 0));
  ctx.fillStyle = wash;
  ctx.fill();
  ctx.globalAlpha = 0.34;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.globalAlpha = 1;



  if (opts.cfg.power !== 'lightning') return;

  const struck = targetsInCone(world, p, opts.cfg, def).map((enemy) => ({
    at: enemy.pos,
    liftPx: (opts.models.models[enemy.archetype]?.heightPx ?? 48) * 0.5 * cam.zoom,
  }));
  const handLiftPx = opts.models.models.player.heightPx * 0.55 * cam.zoom;
  drawLightningField(
    ctx,
    cam,
    origin,
    p.facing,
    maxReach,
    def.arcDeg,
    color,
    sceneTimeMs(world),
    0.35 + grow * 0.65,
    struck,
    handLiftPx,
  );
};

export const drawPowerPreview = (
  ctx: CanvasRenderingContext2D,
  world: World,
  cam: Camera,
  opts: DrawOpts,
): void => {
  const kind = opts.cfg.power;
  if (
    kind !== 'blink' &&
    kind !== 'pull' &&
    kind !== 'push' &&
    kind !== 'freeze' &&
    kind !== 'incinerate' &&
    kind !== 'turncoat'
  ) {
    return;
  }

  const p = world.players[opts.localPlayer] ?? world.players[0];
  const def = opts.cfg.powers[kind];
  const ready = p.powerCooldownMs <= 0 && p.stamina >= def.staminaCost;
  if (!ready || p.state.kind === 'dead') return;

  const pal = opts.pal;
  ctx.save();


  ctx.setLineDash([4, 7]);
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.26;

  if (kind === 'blink') {
    const landing = blinkTarget(world, p, opts.cfg, def, opts.aimDistance);
    const from = worldToScreen(cam, p.pos);
    const to = worldToScreen(cam, landing);

    ctx.strokeStyle = pal.parryFlash;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();

    const { rx, ry } = groundEllipse(cam, opts.cfg.player.radius);
    ctx.beginPath();
    ctx.ellipse(to.x, to.y, rx, ry, 0, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = pal.parryFlash;
    ctx.fill();
    ctx.restore();
    return;
  }

  if (kind === 'push') {
    ctx.strokeStyle = pal.danger;
    groundWedge(ctx, cam, p.pos, p.facing, def.range, def.arcDeg);
    ctx.stroke();
    const candidates = targetsInCone(world, p, opts.cfg, def);
    const targets = def.maxTargets > 0 ? candidates.slice(0, def.maxTargets) : candidates;
    ctx.setLineDash([]);
    for (const target of targets) {
      const at = worldToScreen(cam, target.pos);
      const { rx, ry } = groundEllipse(cam, opts.cfg.enemies[target.archetype].radius + 0.2);
      ctx.beginPath();
      ctx.ellipse(at.x, at.y, rx, ry, 0, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
    return;
  }

  if (kind === 'freeze' || kind === 'incinerate' || kind === 'turncoat') {
    const color =
      kind === 'freeze' ? '#78e7ff' : kind === 'incinerate' ? '#ff7a35' : '#c47aff';
    ctx.strokeStyle = color;
    groundWedge(ctx, cam, p.pos, p.facing, def.range, def.arcDeg);
    ctx.stroke();
    const candidates = targetsInCone(world, p, opts.cfg, def);
    const targets = def.maxTargets > 0 ? candidates.slice(0, def.maxTargets) : candidates;
    ctx.setLineDash([]);
    for (const target of targets) {
      const at = worldToScreen(cam, target.pos);
      const { rx, ry } = groundEllipse(cam, opts.cfg.enemies[target.archetype].radius + 0.22);
      ctx.beginPath();
      ctx.ellipse(at.x, at.y, rx, ry, 0, 0, TAU);
      ctx.stroke();
      if (kind !== 'turncoat') continue;
      ctx.globalAlpha = 0.35;
      for (const formerAlly of world.enemies) {
        if (formerAlly.id === target.id || formerAlly.state.kind === 'dead') continue;
        const other = worldToScreen(cam, formerAlly.pos);
        ctx.beginPath();
        ctx.moveTo(at.x, at.y);
        ctx.lineTo(other.x, other.y);
        ctx.stroke();
      }
      ctx.globalAlpha = 0.26;
    }
    ctx.restore();
    return;
  }

  const target = pullTarget(world, p, opts.cfg, def);
  if (target === undefined) {
    ctx.restore();
    return;
  }

  const from = worldToScreen(cam, target.pos);
  const to = worldToScreen(cam, p.pos);
  ctx.strokeStyle = pal.stagger;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();

  const { rx, ry } = groundEllipse(cam, opts.cfg.enemies[target.archetype].radius + 0.2);
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.ellipse(from.x, from.y, rx, ry, 0, 0, TAU);
  ctx.stroke();
  ctx.restore();
};
