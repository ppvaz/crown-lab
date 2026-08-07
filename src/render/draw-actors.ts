
import type { Player, PowerKind, World } from '../sim/types';
import { playerAttackDef } from '../sim/types';
import type { Palette } from './palette';
import type { Camera } from './iso';
import { worldToScreen, worldToScreenAtElevation } from './iso';
import { attachment } from './actor-stack';
import { drawModel } from './models';
import type { Face } from './mesh';
import { arenaElevationAt } from '../sim/arena';
import { MARA_DOWNED_TOP_PX, MARA_TOP_PX, drawMaraFigure } from './escort';
import { reportUiRect } from './ui-probe';
import { drawBladeCrescent } from './apotheosis/render';
import type { DrawOpts, KingDressing } from './draw';
import { drawSlashArc, footprint, gaitPhaseFor, groundWedge, sceneTimeMs } from './draw-primitives';

export const drawProjectedGuardShield = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  world: World,
  at: { x: number; y: number },
  facing: number,
  radius: number,
  color: string,
  intensity: number,
): void => {
  const forward = { x: Math.cos(facing), y: Math.sin(facing) };
  const tangent = { x: -forward.y, y: forward.x };
  const distance = radius + 0.24;
  const halfWidth = radius * 0.92;
  const centre = {
    x: at.x + forward.x * distance,
    y: at.y + forward.y * distance,
  };
  const baseElevation = arenaElevationAt(world.arena, centre);
  const point = (across: number, elevation: number): { x: number; y: number } =>
    worldToScreenAtElevation(
      cam,
      {
        x: centre.x + tangent.x * across,
        y: centre.y + tangent.y * across,
      },
      baseElevation + elevation,
    );

  const top = point(0, 1.48);
  const upperRight = point(halfWidth * 0.78, 1.25);
  const right = point(halfWidth, 0.77);
  const lowerRight = point(halfWidth * 0.7, 0.3);
  const bottom = point(0, 0.12);
  const lowerLeft = point(-halfWidth * 0.7, 0.3);
  const left = point(-halfWidth, 0.77);
  const upperLeft = point(-halfWidth * 0.78, 1.25);
  const outline = [top, upperRight, right, lowerRight, bottom, lowerLeft, left, upperLeft];

  const midpoint = point(0, 0.78);
  const extent = Math.max(
    1,
    ...outline.map((p) => Math.hypot(p.x - midpoint.x, p.y - midpoint.y)),
  );
  const contour = (spread: number): void => {
    const scale = 1 + spread / extent;
    ctx.beginPath();
    for (let i = 0; i < outline.length; i++) {
      const x = midpoint.x + (outline[i].x - midpoint.x) * scale;
      const y = midpoint.y + (outline[i].y - midpoint.y) * scale;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  };

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  const reach = (10 + intensity * 12) * cam.zoom;
  const bands: ReadonlyArray<readonly [number, number, number]> = [
    [0.62, 4.4, 0.05],
    [0.32, 3.0, 0.09],
    [0.12, 2.0, 0.13],
  ];
  ctx.strokeStyle = color;
  for (const [offset, width, alpha] of bands) {
    ctx.globalAlpha = alpha * (0.6 + intensity * 0.4);
    ctx.lineWidth = Math.max(1, width * cam.zoom);
    contour(reach * offset);
    ctx.stroke();
  }

  contour(0);
  ctx.globalAlpha = 0.12 + intensity * 0.16;
  ctx.fillStyle = color;
  ctx.fill();
  ctx.globalAlpha = 0.48 + intensity * 0.42;
  ctx.lineWidth = Math.max(1.4, (1.5 + intensity) * cam.zoom);
  ctx.stroke();

  const centreHigh = point(0, 1.24);
  const centreLow = point(0, 0.25);
  const bandLeft = point(-halfWidth * 0.73, 0.76);
  const bandRight = point(halfWidth * 0.73, 0.76);
  const innerPlanes = (): void => {
    ctx.beginPath();
    ctx.moveTo(centreHigh.x, centreHigh.y);
    ctx.lineTo(centreLow.x, centreLow.y);
    ctx.moveTo(bandLeft.x, bandLeft.y);
    ctx.lineTo(bandRight.x, bandRight.y);
    ctx.stroke();
  };
  ctx.globalAlpha = (0.3 + intensity * 0.35) * 0.28;
  ctx.lineWidth = Math.max(2.4, (4.2 + intensity * 2) * cam.zoom);
  innerPlanes();
  ctx.globalAlpha = 0.3 + intensity * 0.35;
  ctx.lineWidth = Math.max(1.2, (1.2 + intensity * 0.6) * cam.zoom);
  innerPlanes();

  const centreMid = point(0, 0.76);
  ctx.globalAlpha = 0.07 + intensity * 0.08;
  ctx.beginPath();
  ctx.moveTo(top.x, top.y);
  ctx.lineTo(upperRight.x, upperRight.y);
  ctx.lineTo(right.x, right.y);
  ctx.lineTo(centreMid.x, centreMid.y);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
};

export const drawPartnerHealth = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  opts: DrawOpts,
  king: Player,
  dressing: { pal: Palette },
): void => {
  if (!opts.pres.hud.health) return;
  const at = worldToScreen(cam, king.pos);
  const top = at.y - opts.models.models.player.heightPx * cam.zoom - 12;
  const width = 42 * cam.zoom;
  ctx.save();
  ctx.fillStyle = opts.pal.wall;
  ctx.fillRect(at.x - width / 2, top, width, 4);
  ctx.fillStyle = dressing.pal.player;
  ctx.fillRect(at.x - width / 2, top, width * Math.max(0, king.hp / Math.max(1, king.maxHp)), 4);
  ctx.restore();
  reportUiRect('world.player.health', at.x - width / 2, top, width, 4, String(king.id));
};

export const dressingFor = (opts: DrawOpts, seat: number): KingDressing =>
  opts.kingDressing?.[seat] ?? { pal: opts.pal, models: opts.models };

const HIDE_FREE_ARM: ReadonlySet<Face['part']> = new Set(['armLead']);

const SLASH_ELEVATION = 1.1;

const FORWARD_ARM = 1.4;
const BACKWARD_ARM = -0.9;
const ARM_RAMP_MS = 450;
const GUARD_ARM = 0.9;

const powerArmAngle = (power: PowerKind, channelMs: number): number => {
  const t = Math.min(1, channelMs / ARM_RAMP_MS);
  if (power === 'pull') return FORWARD_ARM + (BACKWARD_ARM - FORWARD_ARM) * t;
  if (power === 'push') return BACKWARD_ARM + (FORWARD_ARM - BACKWARD_ARM) * t;
  return FORWARD_ARM;
};

export const drawPlayer = (
  ctx: CanvasRenderingContext2D,
  world: World,
  cam: Camera,
  opts: DrawOpts,
  p: Player,
  dressing: KingDressing,
): void => {
  const pal = opts.pal;
  const pc = opts.cfg.player;
  const kind = p.state.kind;


  const attackDef =
    (kind === 'windup' || kind === 'active' || kind === 'recovery') && p.state.attack !== null
      ? playerAttackDef(p.state, pc)
      : null;
  const poseProgress =
    attackDef === null
      ? undefined
      : Math.min(
          1,
          p.state.elapsedMs /
            Math.max(
              1,
              kind === 'windup'
                ? attackDef.windupMs
                : kind === 'active'
                  ? attackDef.activeMs
                  : attackDef.recoveryMs,
            ),
        );

  const contactEvent = world.events.find(
    (event) =>
      ((event.type === 'hit_landed' || event.type === 'enemy_blocked') && event.actor === p.id) ||
      (event.type === 'enemy_parried' && event.target === p.id),
  );
  const contactId =
    contactEvent?.type === 'enemy_parried'
      ? contactEvent.actor
      : contactEvent?.target ?? (kind === 'active' ? p.state.struck[0] : undefined);
  const contactedEnemy = world.enemies.find((enemy) => enemy.id === contactId);

  if ((kind === 'windup' || kind === 'active') && p.state.attack !== null) {
    const def = playerAttackDef(p.state, pc)!;
    const live = kind === 'active';
    const t = live ? 1 : Math.min(1, p.state.elapsedMs / Math.max(1, def.windupMs));
    groundWedge(ctx, cam, p.pos, p.facing, def.range * (live ? 1 : 0.35 + t * 0.65), def.arcDeg);
    ctx.globalAlpha = live ? 0.45 : 0.12;
    ctx.fillStyle = pal.playerAccent;
    ctx.fill();
    ctx.globalAlpha = 1;
    if (live && opts.apotheosis.combatFx) {
      drawBladeCrescent(
        ctx,
        cam,
        p.pos,
        p.facing,
        def.range,
        def.arcDeg,
        pal.parryFlash,
        p.state.attack === 'heavy' ? 1.15 : 0.82,
      );
    }
    if (live && contactedEnemy !== undefined) {
      drawSlashArc(ctx, cam, p.pos, contactedEnemy.pos, pal.hudText, SLASH_ELEVATION, 0);
    }
  }

  if (kind === 'guard' || kind === 'parry') {
    const arc = kind === 'parry' ? pc.parry.arcDeg : pc.guard.arcDeg;
    groundWedge(ctx, cam, p.pos, p.facing, pc.radius + 0.75, arc);
    ctx.globalAlpha = kind === 'parry' ? 0.42 : 0.2;
    ctx.fillStyle = kind === 'parry' ? pal.parryFlash : pal.hudText;
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  const body =
    kind === 'dead'
      ? pal.hudDim
      : kind === 'stagger'
        ? pal.danger
        : p.iframeMs > 0
          ? pal.stagger
          : dressing.pal.player;

  const guarding = kind === 'guard' || kind === 'parry';





  if (dressing.body !== undefined) {
    dressing.body(ctx, cam, p);
    if (guarding) {
      drawProjectedGuardShield(
        ctx, cam, world, p.pos, p.facing, pc.radius, pal.parryFlash, kind === 'parry' ? 1 : 0.62,
      );
    }
  } else drawModel(ctx, cam, dressing.models, 'player', {
    at: p.pos,
    facing: p.facing,
    radius: pc.radius,
    tint: body,
    outline: p.riposteWindowMs > 0 ? pal.parryFlash : pal.playerAccent,
    pal: dressing.pal,
    showFacing: opts.pres.visual.facingMarks,
    state: kind,
    poseProgress,
    gaitPhase: gaitPhaseFor(world, kind),
    hiddenParts: guarding || p.powerChannelMs > 0 ? undefined : HIDE_FREE_ARM,
    powerArm:
      p.powerChannelMs > 0
        ? powerArmAngle(opts.cfg.power, p.powerChannelMs)
        : guarding
          ? GUARD_ARM
          : undefined,
    weaponContact:
      contactedEnemy === undefined
        ? undefined
        : {
            at: contactedEnemy.pos,
            heightPx: opts.models.models[contactedEnemy.archetype]?.heightPx ?? 50,
            radius: opts.cfg.enemies[contactedEnemy.archetype].radius,
          },
    stack: guarding
      ? [
          attachment({
            facing: p.facing,
            forward: pc.radius + 0.24,
            draw: () =>
              drawProjectedGuardShield(
                ctx,
                cam,
                world,
                p.pos,
                p.facing,
                pc.radius,
                pal.parryFlash,
                kind === 'parry' ? 1 : 0.62,
              ),
          }),
        ]
      : undefined,
  });

  if (opts.showHitboxes) {
    ctx.strokeStyle = pal.hudDim;
    ctx.lineWidth = 1;
    footprint(ctx, cam, p.pos, pc.radius);
    ctx.stroke();
  }
};

export const drawCompanion = (
  ctx: CanvasRenderingContext2D,
  world: World,
  cam: Camera,
  opts: DrawOpts,
): void => {
  const companion = world.companion;
  if (companion === null) return;
  const at = worldToScreen(cam, companion.pos);
  const moving = Math.hypot(companion.vel.x, companion.vel.y) > 0.25;
  drawMaraFigure(ctx, cam, opts.pal, at, {
    downed: companion.state === 'downed',
    facing: companion.facing,
    timeMs: sceneTimeMs(world),
    gaitPhase: moving ? gaitPhaseFor(world, 'move') : 0,
  });

};

export const drawCompanionOverhead = (
  ctx: CanvasRenderingContext2D,
  world: World,
  cam: Camera,
  opts: DrawOpts,
): void => {
  const companion = world.companion;
  if (companion === null) return;
  const at = worldToScreen(cam, companion.pos);

  const silhouetteTop = companion.state === 'downed' ? MARA_DOWNED_TOP_PX : MARA_TOP_PX;
  const top = at.y - silhouetteTop * cam.zoom - 12;
  const width = 42 * cam.zoom;
  ctx.save();
  ctx.fillStyle = opts.pal.wall;
  ctx.fillRect(at.x - width / 2, top, width, 4);
  ctx.fillStyle = opts.pal.projectileReflected;
  ctx.fillRect(
    at.x - width / 2,
    top,
    width * (companion.hp / Math.max(1, companion.maxHp)),
    4,
  );
  reportUiRect('world.companion.health', at.x - width / 2, top, width, 4);
  ctx.restore();
};
