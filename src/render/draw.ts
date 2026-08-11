
import type { CombatConfig, PowerKind, World } from '../sim/types';
import type { ArchetypeColor, Palette } from './palette';
import type { ResolvedPresentation } from '../lab/presentation';
import type { Camera } from './iso';
import { depthOf, isNearViewport } from './iso';
import type { ModelBank } from './models';
import type { RoomRegistry } from './rooms/theme';
import { drawArenaProp, drawFloorPillar } from './arena-decor';
import { drawEncounterBackground } from './background';
import { isPublicRoom } from '../game/public-profile';
import type { MazePortalDirection } from './atmosphere';
import { ambienceFor, drawDust, drawFillLight, drawParallax, drawRoomAir, drawSky, drawSlowMo, drawVignette } from './atmosphere';
import type { PowerStand } from '../game/armoury';
import { STAND_REACH } from '../game/armoury';
import { drawPowerStand } from './armoury';
import { HERALD } from '../game/herald';
import { drawHerald } from './herald';
import { drawCinematicGrounding, drawCinematicPost } from './apotheosis/render';
import type { ApotheosisConfig } from './apotheosis/config';
import { sceneTimeMs } from './draw-primitives';
import { drawArena, visiblePropsFor } from './draw-arena';
import { drawEnemy, drawEnemyOverhead } from './draw-enemy';
import { drawCompanion, drawCompanionOverhead, drawPartnerHealth, drawPlayer, dressingFor } from './draw-actors';
import { drawChannelCone, drawPowerPreview } from './draw-powers';
import { drawPickup, drawProjectiles } from './draw-projectiles';

export interface FloorPad {
  at: { x: number; y: number };
  draw: () => void;
}

export interface SceneBody {
  at: { x: number; y: number };
  draw: () => void;
}

export interface DrawOpts {
  localPlayer: number;
  cfg: CombatConfig;
  pal: Palette;
  pres: ResolvedPresentation;
  models: ModelBank;
  apotheosis: ApotheosisConfig;
  rooms: RoomRegistry;
  archetypeColor: ArchetypeColor;
  enemyBody?: (archetype: string) => ((
    ctx: CanvasRenderingContext2D,
    cam: Camera,
    enemy: World['enemies'][number],
  ) => boolean) | null;
  shotBody?: (
    ctx: CanvasRenderingContext2D,
    cam: Camera,
    world: World,
    shot: World['projectiles'][number],
    pal: Palette,
  ) => boolean;
  showHitboxes: boolean;
  aimDistance: number | null;
  stands?: readonly PowerStand[];
  equippedPower?: PowerKind;
  herald?: boolean;
  pillars?: readonly { at: { x: number; y: number }; radius: number }[];
  floorPads?: readonly FloorPad[];
  bodies?: readonly SceneBody[];
  groundFx?: () => void;
  roomLayers?: {
    drawBehind: (ctx: CanvasRenderingContext2D, cam: Camera) => void;
    drawInFront: (ctx: CanvasRenderingContext2D, cam: Camera) => void;
  };
  roomOccluders?: readonly { at: { x: number; y: number }; draw: () => void }[];
  mazePortalDirection?: MazePortalDirection;
  kingDressing?: readonly KingDressing[];
}

export interface KingDressing {
  pal: Palette;
  models: ModelBank;
  body?: (ctx: CanvasRenderingContext2D, cam: Camera, king: World['players'][number]) => boolean;
}

export const drawScene = (
  ctx: CanvasRenderingContext2D,
  world: World,
  cam: Camera,
  opts: DrawOpts,
): void => {
  const ambience = ambienceFor(opts.rooms, world.encounter.defId);
  drawSky(ctx, cam, ambience);
  drawParallax(ctx, cam, ambience);
  if (__CROWN_LAB__) drawEncounterBackground(ctx, world, cam, opts.pal);
  if (__CROWN_LAB__ && opts.roomLayers) opts.roomLayers.drawBehind(ctx, cam);
  else drawArena(ctx, world, cam, opts);
  opts.groundFx?.();

  const actors: Array<{ depth: number; draw: () => void; ground?: () => void }> = [];
  for (const pad of opts.floorPads ?? []) {
    if (!isNearViewport(cam, pad.at)) continue;
    actors.push({ depth: depthOf(pad.at), draw: pad.draw });
  }
  const propsAllowed = __CROWN_LAB__ || isPublicRoom(world.encounter.defId);
  for (const prop of propsAllowed ? visiblePropsFor(world, opts.rooms) : []) {
    if (!isNearViewport(cam, prop.at)) continue;
    actors.push({
      depth: depthOf(prop.at),
      draw: () => drawArenaProp(ctx, world, cam, prop, opts.pal, opts.rooms, sceneTimeMs(world)),
    });
  }
  for (const pickup of world.pickups) {
    if (!isNearViewport(cam, pickup.pos)) continue;
    actors.push({ depth: depthOf(pickup.pos), draw: () => drawPickup(ctx, cam, pickup, opts) });
  }
  const stands = opts.stands ?? [];
  let nearestStand: PowerStand | null = null;
  let nearestDistance = STAND_REACH;
  for (const stand of stands) {
    const d = Math.min(
      ...world.players.map((player) => Math.hypot(player.pos.x - stand.at.x, player.pos.y - stand.at.y)),
    );
    if (d <= nearestDistance) {
      nearestStand = stand;
      nearestDistance = d;
    }
  }
  stands.forEach((stand, index) => {
    if (!isNearViewport(cam, stand.at)) return;
    actors.push({
      depth: depthOf(stand.at),
      draw: () =>
        drawPowerStand(
          ctx,
          cam,
          opts.pal,
          stand,
          stand.kind === opts.equippedPower,
          stand === nearestStand,
          sceneTimeMs(world),
          index,
        ),
    });
  });
  (opts.pillars ?? []).forEach((pillar, index) => {
    if (!isNearViewport(cam, pillar.at)) return;
    actors.push({
      depth: depthOf(pillar.at),
      draw: () =>
        drawFloorPillar(ctx, world, cam, pillar.at, pillar.radius, opts.pal, opts.rooms, sceneTimeMs(world), index),
    });
  });
  for (const occluder of opts.roomOccluders ?? []) {
    if (!isNearViewport(cam, occluder.at)) continue;
    actors.push({ depth: depthOf(occluder.at), draw: occluder.draw });
  }
  if (opts.herald === true && isNearViewport(cam, HERALD.at)) {
    actors.push({
      depth: depthOf(HERALD.at),
      draw: () => drawHerald(ctx, cam, opts.pal, sceneTimeMs(world)),
    });
  }
  for (const body of opts.bodies ?? []) {
    if (!isNearViewport(cam, body.at)) continue;
    actors.push({ depth: depthOf(body.at), draw: body.draw });
  }
  for (let i = 0; i < world.players.length; i++) {
    const king = world.players[i];
    const partner = i !== opts.localPlayer;
    const dressing = dressingFor(opts, i);
    actors.push({
      depth: depthOf(king.pos),
      ...(opts.apotheosis.actorLighting
        ? {
            ground: () =>
              drawCinematicGrounding(
                ctx,
                cam,
                king.pos,
                opts.cfg.player.radius,
                dressing.pal.playerAccent,
                partner ? 0.72 : 1,
                opts.apotheosis.cachedContactShadow,
              ),
          }
        : {}),
      draw: () => {
        drawPlayer(ctx, world, cam, opts, king, dressing);
        if (partner) drawPartnerHealth(ctx, cam, opts, king, dressing);
      },
    });
  }
  if (world.companion !== null) {
    actors.push({
      depth: depthOf(world.companion.pos),
      draw: () => drawCompanion(ctx, world, cam, opts),
    });
  }
  for (const enemy of world.enemies) {
    if (enemy.state.kind === 'dead') continue;
    if (!isNearViewport(cam, enemy.pos)) continue;
    actors.push({
      depth: depthOf(enemy.pos),
      ...(opts.apotheosis.actorLighting
        ? {
            ground: () =>
              drawCinematicGrounding(
                ctx,
                cam,
                enemy.pos,
                opts.cfg.enemies[enemy.archetype].radius,
                opts.archetypeColor(enemy.archetype),
                enemy.state.kind === 'stagger' ? 1.18 : 0.86,
                opts.apotheosis.cachedContactShadow,
              ),
          }
        : {}),
      draw: () => drawEnemy(ctx, world, cam, enemy, opts),
    });
  }
  actors.sort((a, b) => a.depth - b.depth);
  for (const actor of actors) {
    actor.ground?.();
    actor.draw();
  }

  for (const enemy of world.enemies) {
    if (enemy.state.kind === 'dead') continue;
    if (!isNearViewport(cam, enemy.pos)) continue;
    drawEnemyOverhead(ctx, cam, enemy, opts);
  }
  drawCompanionOverhead(ctx, world, cam, opts);

  drawChannelCone(ctx, world, cam, opts);
  drawPowerPreview(ctx, world, cam, opts);
  drawProjectiles(ctx, world, cam, opts);

  if (__CROWN_LAB__ && opts.roomLayers) opts.roomLayers.drawInFront(ctx, cam);

  drawFillLight(ctx, cam, ambience);
  drawRoomAir(ctx, world, cam, opts.rooms, ambience, sceneTimeMs(world));
  drawDust(ctx, cam, ambience, sceneTimeMs(world));
  drawVignette(ctx, cam, ambience);

  drawSlowMo(ctx, cam, ambience, 1 - world.slowMo.scales.world, sceneTimeMs(world));
  if (opts.apotheosis.postProcessing) {
    drawCinematicPost(
      ctx,
      cam,
      ambience,
      sceneTimeMs(world),
      Math.max(1 - world.slowMo.scales.world, world.hitstopMs > 0 ? 0.8 : 0),
      opts.apotheosis.lowResBloomBlur,
    );
  }
};

export { telegraphProgress } from './draw-primitives';
export { drawProjectedGuardShield, drawCompanion, drawCompanionOverhead } from './draw-actors';
