
import type { Enemy, EnemyArchetype, World } from '../sim/types';
import { TICK_MS, enemyGuardIsUp } from '../sim/types';
import type { Camera } from './iso';
import { groundEllipse, worldToScreen } from './iso';
import type { ActorCommand } from './actor-stack';
import { composeActor } from './actor-stack';
import { drawModel } from './models';
import { arenaElevationAt } from '../sim/arena';
import { drawLightningField } from './lightning';
import { drawBurning, drawFrostShards, drawTurncoatRing } from './power-fx';
import { reportUiRect } from './ui-probe';
import { drawBladeCrescent } from './apotheosis/render';
import type { DrawOpts } from './draw';
import { TAU, footprint, gaitPhaseFor, groundWedge, mixHex, sceneTimeMs, screenPolygon, telegraphProgress } from './draw-primitives';

const LIGHTNING_CONE: Readonly<Partial<Record<EnemyArchetype, string>>> = {
  chancellor: 'rain_focus',
};

const lightningConeAttack = (archetype: EnemyArchetype): string | null => {
  if (!__CROWN_LAB__) return null;
  return LIGHTNING_CONE[archetype] ?? null;
};



const lightningArcs = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  origin: { x: number; y: number },
  facing: number,
  range: number,
  arcDeg: number,
  color: string,
  phase: number,
): void => {
  drawLightningField(ctx, cam, origin, facing, range, arcDeg, color, phase * 1000, 0.85);
};

const drawUnparryableRim = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  at: { x: number; y: number },
  facing: number,
  range: number,
  arcDeg: number,
  color: string,
  progress: number,
): void => {
  const half = (arcDeg * Math.PI) / 360;
  const teeth = Math.max(8, Math.ceil(arcDeg / 10));
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = color;
  ctx.lineJoin = 'miter';
  ctx.lineCap = 'round';
  ctx.globalAlpha = 0.42 + progress * 0.38;
  ctx.lineWidth = Math.max(1.2, 1.7 * cam.zoom);
  ctx.beginPath();
  for (let index = 0; index <= teeth * 2; index += 1) {
    const unit = index / (teeth * 2);
    const angle = facing - half + unit * half * 2;
    const tooth = index % 2 === 0 ? 1 : 0.91;
    const point = worldToScreen(cam, {
      x: at.x + Math.cos(angle) * range * tooth,
      y: at.y + Math.sin(angle) * range * tooth,
    });
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  }
  ctx.stroke();

  const tangent = { x: -Math.sin(facing), y: Math.cos(facing) };
  for (let index = 0; index < 3; index += 1) {
    const distance = range * (0.44 + index * 0.18);
    const width = range * (0.08 + index * 0.012);
    const tip = {
      x: at.x + Math.cos(facing) * (distance - range * 0.09),
      y: at.y + Math.sin(facing) * (distance - range * 0.09),
    };
    const left = {
      x: at.x + Math.cos(facing) * distance + tangent.x * width,
      y: at.y + Math.sin(facing) * distance + tangent.y * width,
    };
    const right = {
      x: at.x + Math.cos(facing) * distance - tangent.x * width,
      y: at.y + Math.sin(facing) * distance - tangent.y * width,
    };
    const a = worldToScreen(cam, left);
    const b = worldToScreen(cam, tip);
    const c = worldToScreen(cam, right);
    ctx.globalAlpha = (0.32 + progress * 0.52) * (0.72 + index * 0.14);
    ctx.lineWidth = Math.max(1, 1.5 * cam.zoom);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.stroke();
  }
  ctx.restore();
};


const drawFirstBladeGlideWake = (
  ctx: CanvasRenderingContext2D,
  world: World,
  cam: Camera,
  enemy: Enemy,
  color: string,
): void => {
  const forward = { x: Math.cos(enemy.facing), y: Math.sin(enemy.facing) };
  const tangent = { x: -forward.y, y: forward.x };
  const elevation = arenaElevationAt(world.arena, enemy.pos) + 0.46;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 3; i++) {
    const length = 0.75 + i * 0.42;
    const offset = (i - 1) * 0.26;
    const root = {
      x: enemy.pos.x - forward.x * 0.16 + tangent.x * offset,
      y: enemy.pos.y - forward.y * 0.16 + tangent.y * offset,
    };
    screenPolygon(
      ctx,
      cam,
      [
        {
          x: root.x + tangent.x * 0.11,
          y: root.y + tangent.y * 0.11,
        },
        {
          x: root.x - forward.x * length,
          y: root.y - forward.y * length,
        },
        {
          x: root.x - tangent.x * 0.11,
          y: root.y - tangent.y * 0.11,
        },
      ],
      elevation - i * 0.06,
    );
    ctx.globalAlpha = 0.18 - i * 0.045;
    ctx.fillStyle = color;
    ctx.fill();
  }
  ctx.restore();
};

export const drawEnemy = (
  ctx: CanvasRenderingContext2D,
  world: World,
  cam: Camera,
  enemy: Enemy,
  opts: DrawOpts,
): void => {
  if (enemy.state.kind === 'dead') return;
  const pal = opts.pal;
  const ecfg = opts.cfg.enemies[enemy.archetype];
  const def = ecfg.attacks[enemy.state.attackIndex];

  if (opts.pres.visual.telegraphs && enemy.state.kind === 'telegraph' && def !== undefined) {
    const t = telegraphProgress(
      def,
      enemy.state.elapsedMs,
      enemy.state.telegraphJitterMs,
    );
    const color = def.parryable ? pal.telegraph : pal.unparryable;

    if (def.kind === 'rain') {
      footprint(ctx, cam, enemy.pos, opts.cfg.enemies[enemy.archetype].radius * (1 + t * 1.8));
    } else {

      groundWedge(ctx, cam, enemy.pos, enemy.facing, def.range, def.arcDeg);
      ctx.save();
      ctx.globalAlpha = def.parryable ? 0.28 : 0.52;
      ctx.strokeStyle = color;
      ctx.lineWidth = def.parryable ? 1.25 : 1.75;
      if (def.parryable) ctx.setLineDash([5, 5]);
      ctx.stroke();
      ctx.restore();
      if (!def.parryable) {
        drawUnparryableRim(
          ctx,
          cam,
          enemy.pos,
          enemy.facing,
          def.range,
          def.arcDeg,
          color,
          t,
        );
      }
      groundWedge(ctx, cam, enemy.pos, enemy.facing, def.range * t, def.arcDeg);
    }
    const subtle = def.parryable;
    ctx.globalAlpha = subtle ? 0.06 + t * 0.22 : 0.12 + t * 0.2;
    ctx.fillStyle = color;
    ctx.fill();
    ctx.globalAlpha = subtle ? 0.34 + t * 0.5 : 0.72;
    ctx.strokeStyle = color;
    ctx.lineWidth = subtle ? 1.5 : 1.75;
    ctx.stroke();
    ctx.globalAlpha = 1;

    if (lightningConeAttack(enemy.archetype) === def.id && def.kind !== 'rain') {
      lightningArcs(
        ctx,
        cam,
        enemy.pos,
        enemy.facing,
        def.range * t,
        def.arcDeg,
        pal.lightning,
        enemy.state.elapsedMs / 1000,
      );
    }
  }

  if (enemy.state.kind === 'attack' && def !== undefined && def.kind === 'melee') {
    groundWedge(ctx, cam, enemy.pos, enemy.facing, def.range, def.arcDeg);
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = def.parryable ? pal.telegraph : pal.unparryable;
    ctx.fill();
    ctx.globalAlpha = 1;
    if (opts.apotheosis.combatFx) {
      drawBladeCrescent(
        ctx,
        cam,
        enemy.pos,
        enemy.facing,
        def.range,
        def.arcDeg,
        def.parryable ? pal.telegraph : pal.unparryable,
        def.parryable ? 0.72 : 0.92,
      );
    }
    if (lightningConeAttack(enemy.archetype) === def.id) {
      lightningArcs(
        ctx,
        cam,
        enemy.pos,
        enemy.facing,
        def.range,
        def.arcDeg,
        pal.lightning,
        enemy.state.elapsedMs / 1000,
      );
    }
  }




  const impactAgeMs =
    enemy.guardImpactTick === undefined
      ? Number.POSITIVE_INFINITY
      : (world.tick - enemy.guardImpactTick) * TICK_MS;
  const parriedImpact = enemy.guardImpactParried === true;
  const recoilMs = parriedImpact ? 260 : 170;
  const recoiling =
    impactAgeMs >= 0 && impactAgeMs < recoilMs && enemyGuardIsUp(enemy, ecfg);

  const defence = ecfg.defence;
  if (opts.pres.visual.telegraphs && defence !== undefined && enemyGuardIsUp(enemy, ecfg)) {
    groundWedge(ctx, cam, enemy.pos, enemy.facing, ecfg.radius + 0.75, defence.arcDeg);
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = pal.hudText;
    ctx.fill();
    ctx.globalAlpha = 0.3;
    ctx.strokeStyle = pal.hudText;
    ctx.lineWidth = 1.25;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  const staggered = enemy.state.kind === 'stagger';
  const lifecycle = ecfg.boss;
  const baseTint = opts.archetypeColor(enemy.archetype);
  const falling = enemy.state.kind === 'entrance_fall' && lifecycle !== undefined;
  const entranceRoar = enemy.state.kind === 'entrance_roar' && lifecycle !== undefined;
  const phaseRoar = enemy.state.kind === 'phase_roar' && lifecycle !== undefined;
  const roaring = entranceRoar || phaseRoar;
  const roarMs = entranceRoar
    ? lifecycle.introRoarMs
    : phaseRoar
      ? lifecycle.phaseRoarMs
      : 1;
  const gliding =
    enemy.state.kind === 'attack' && def?.kind === 'melee' && def.traversesArena === true;
  const fallT = falling
    ? Math.min(1, enemy.state.elapsedMs / Math.max(1, lifecycle.entranceFallMs))
    : 1;
  const easedFall = 1 - (1 - fallT) * (1 - fallT);


  const hovering = enemy.warded === true && ecfg.volley !== undefined;
  const grounded = ecfg.volley !== undefined && enemy.state.kind === 'stagger';
  const HOVER_PX = 54;
  const dropT = grounded ? Math.min(1, enemy.state.elapsedMs / 420) : 0;
  const elevationPx = falling
    ? (1 - easedFall) * 190
    : hovering
      ? HOVER_PX +
        Math.sin((sceneTimeMs(world) / 2300) * Math.PI * 2) * 5 +
        Math.sin((sceneTimeMs(world) / 1370) * Math.PI * 2) * 2.2 +
        Math.sin((sceneTimeMs(world) / 770) * Math.PI * 2) * 0.9
      : grounded
        ? HOVER_PX * (1 - dropT) * (1 - dropT)
        : roaring
          ? Math.abs(Math.sin((enemy.state.elapsedMs / 120) * Math.PI)) * 4
          : gliding
            ? 16 + Math.sin((enemy.state.elapsedMs / 95) * Math.PI) * 2
            : 0;
  const commands: ActorCommand[] = [];
  if (roaring) {
    commands.push({
      slot: 'rearEffects',
      draw: () => {
        const cycle = ((enemy.state.elapsedMs % Math.min(420, roarMs)) / Math.min(420, roarMs));
        for (let i = 0; i < 3; i++) {
          const t = (cycle + i / 3) % 1;
          const p = worldToScreen(cam, enemy.pos);
          const ring = groundEllipse(cam, ecfg.radius * (1.1 + t * 3.2));
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, ring.rx, ring.ry, 0, 0, TAU);
          ctx.globalAlpha = (1 - t) * 0.55;
          ctx.strokeStyle = baseTint;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      },
    });
  }
  const phaseTint =
    lifecycle !== undefined && enemy.phase === 2
      ? mixHex(baseTint, pal.floor, 0.48)
      : baseTint;
  const statusColor =
    (enemy.frozenMs ?? 0) > 0
      ? '#78e7ff'
      : (enemy.burningMs ?? 0) > 0
        ? '#ff7a35'
        : (enemy.turncoatMs ?? 0) > 0
          ? '#c47aff'
          : null;
  if (gliding && enemy.archetype === 'first_blade') {
    commands.push({
      slot: 'rearEffects',
      draw: () => drawFirstBladeGlideWake(ctx, world, cam, enemy, pal.firstBlade),
    });
  }
  const contactEvent =
    def?.kind !== 'melee'
      ? undefined
      : world.events.find(
          (event) =>
            ((event.type === 'hit_received' ||
              event.type === 'guard_success' ||
              event.type === 'guard_broken' ||
              event.type === 'friendly_fire') &&
              event.actor === enemy.id) ||
            (event.type === 'parry_success' && event.target === enemy.id),
        );
  const contactId =
    contactEvent?.type === 'parry_success'
      ? contactEvent.actor
      : contactEvent?.target ??
        (enemy.state.kind === 'attack' && def?.kind === 'melee'
          ? enemy.state.struck[0]
          : undefined);
  const contactedPlayer = world.players.find((player) => player.id === contactId);
  const contactedEnemy = world.enemies.find((body) => body.id === contactId);
  const weaponContact =
    contactedPlayer !== undefined
      ? {
          at: contactedPlayer.pos,
          heightPx: opts.models.models.player.heightPx,
          radius: opts.cfg.player.radius,
        }
      : contactedEnemy !== undefined
        ? {
            at: contactedEnemy.pos,
            heightPx: opts.models.models[contactedEnemy.archetype]?.heightPx ?? 50,
            radius: opts.cfg.enemies[contactedEnemy.archetype].radius,
          }
        : undefined;

  const meshBody = opts.enemyBody?.(enemy.archetype) ?? null;
  commands.push({
    slot: 'body',
    draw: () =>
      meshBody !== null ? meshBody(ctx, cam, enemy) : drawModel(ctx, cam, opts.models, enemy.archetype, {
        at: enemy.pos,
        facing: enemy.facing,
        radius: ecfg.radius,
        tint: staggered ? pal.stagger : phaseTint,
        outline: staggered ? pal.hudText : statusColor,
        pal,
        showFacing: opts.pres.visual.facingMarks,
        state: recoiling
          ? parriedImpact
            ? 'parry_impact'
            : 'guard_impact'
          : gliding && enemy.archetype === 'first_blade'
            ? 'glide'
            : enemy.state.kind,
        tell: def?.tell,
        poseProgress: recoiling
          ?
            1 - impactAgeMs / recoilMs
          : enemy.state.kind === 'telegraph' && def !== undefined
            ? telegraphProgress(def, enemy.state.elapsedMs, enemy.state.telegraphJitterMs)
            : enemy.state.kind === 'attack' && def !== undefined
              ? Math.min(1, enemy.state.elapsedMs / Math.max(1, def.activeMs))
              : enemy.state.kind === 'recovery' && def !== undefined
                ? Math.min(1, enemy.state.elapsedMs / Math.max(1, def.recoveryMs))
                : 1,
        gaitPhase: gaitPhaseFor(world, enemy.state.kind),
        weaponContact,
        elevationPx,
        shadowScale: falling ? 0.35 + easedFall * 0.65 : gliding ? 0.72 : 1,
      }),
  });


  const bodyLiftPx = (opts.models.models[enemy.archetype]?.heightPx ?? 46) * cam.zoom;
  if ((enemy.frozenMs ?? 0) > 0) {
    commands.push({
      slot: 'frontEffects',
      draw: () =>
        drawFrostShards(ctx, cam, enemy.pos, bodyLiftPx, '#78e7ff', Math.min(1, (enemy.frozenMs ?? 0) / 1400)),
    });
  }
  if ((enemy.burningMs ?? 0) > 0) {
    commands.push({
      slot: 'frontEffects',
      draw: () => drawBurning(ctx, cam, enemy.pos, bodyLiftPx, '#ff7a35', sceneTimeMs(world), enemy.id),
    });
  }
  if ((enemy.turncoatMs ?? 0) > 0) {
    const turncoatHold = Math.min(
      1,
      (enemy.turncoatMs ?? 0) / Math.max(1, opts.cfg.powers.turncoat.effectDurationMs ?? 1),
    );
    commands.push(
      {
        slot: 'rearEffects',
        draw: () =>
          drawTurncoatRing(
            ctx,
            cam,
            enemy.pos,
            bodyLiftPx,
            '#c47aff',
            sceneTimeMs(world),
            turncoatHold,
            'far',
          ),
      },
      {
        slot: 'frontEffects',
        draw: () =>
          drawTurncoatRing(
            ctx,
            cam,
            enemy.pos,
            bodyLiftPx,
            '#c47aff',
            sceneTimeMs(world),
            turncoatHold,
            'near',
          ),
      },
    );
  }
  composeActor(enemy.pos, commands).draw();

  if (statusColor !== null && !falling && !roaring) {
    const at = worldToScreen(cam, enemy.pos);
    const ring = groundEllipse(cam, ecfg.radius * 1.35);
    ctx.save();
    ctx.strokeStyle = statusColor;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.ellipse(at.x, at.y, ring.rx, ring.ry, 0, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([3, 4]);
    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    ctx.ellipse(at.x, at.y, ring.rx * 1.3, ring.ry * 1.3, 0, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  if (opts.showHitboxes) {
    ctx.strokeStyle = pal.hudDim;
    ctx.lineWidth = 1;
    footprint(ctx, cam, enemy.pos, ecfg.radius);
    ctx.stroke();
    if (def !== undefined) {
      ctx.strokeStyle = pal.telegraph;
      groundWedge(ctx, cam, enemy.pos, enemy.facing, def.range, def.arcDeg);
      ctx.stroke();
    }
  }
};

export const drawEnemyOverhead = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  enemy: Enemy,
  opts: DrawOpts,
): void => {
  const ecfg = opts.cfg.enemies[enemy.archetype];
  const lifecycle = ecfg.boss;
  const falling = enemy.state.kind === 'entrance_fall' && lifecycle !== undefined;
  const roaring =
    (enemy.state.kind === 'entrance_roar' || enemy.state.kind === 'phase_roar') &&
    lifecycle !== undefined;
  if (!opts.pres.hud.enemyHealth || ecfg.boss !== undefined || falling || roaring) return;

  const pal = opts.pal;
  const p = worldToScreen(cam, enemy.pos);
  const top = p.y - 46 * cam.zoom - 12;
  const w = 34 * cam.zoom;
  ctx.fillStyle = pal.hudDim;
  ctx.fillRect(p.x - w / 2, top, w, 3);
  ctx.fillStyle = opts.archetypeColor(enemy.archetype);
  ctx.fillRect(p.x - w / 2, top, w * Math.max(0, enemy.hp / enemy.maxHp), 3);
  reportUiRect('world.enemy.health', p.x - w / 2, top, w, 3, String(enemy.id));
  ctx.fillStyle = pal.stagger;
  ctx.fillRect(p.x - w / 2, top + 4, w * Math.max(0, enemy.poise / enemy.maxPoise), 2);
  reportUiRect('world.enemy.poise', p.x - w / 2, top + 4, w, 2, String(enemy.id));
};
