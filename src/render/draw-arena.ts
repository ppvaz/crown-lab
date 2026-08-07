
import type { World } from '../sim/types';
import type { Palette } from './palette';
import type { Camera } from './iso';
import { groundEllipse, worldToScreen, worldToScreenAtElevation } from './iso';
import type { RoomRegistry } from './rooms/theme';
import { arenaGateIsClosed, arenaVertices } from '../sim/arena';
import { arenaPropsFor, drawArenaFloor, drawArenaFoundation } from './arena-decor';
import { isPublicRoom } from '../game/public-profile';
import { ambienceFor, drawFloorFog, drawFloorLight, drawRoomShell, drawWindowLight, lightsFor } from './atmosphere';
import { drawCinematicFloor, drawCinematicFoundation } from './apotheosis/render';
import type { DrawOpts } from './draw';
import { TAU, clipAtY, sceneTimeMs, screenPolygon, spanAtY } from './draw-primitives';

export const visiblePropsFor = (world: World, rooms: RoomRegistry): ReturnType<typeof arenaPropsFor> => {
  const vertices = arenaVertices(world.arena);
  if (vertices.length < 3) return arenaPropsFor(rooms, world);
  const centroid = vertices.reduce(
    (sum, point) => ({
      x: sum.x + point.x / vertices.length,
      y: sum.y + point.y / vertices.length,
    }),
    { x: 0, y: 0 },
  );
  return arenaPropsFor(rooms, world).filter(
    (prop) => prop.at.x - centroid.x + (prop.at.y - centroid.y) > 0,
  );
};

const emitterPositions = (world: World, rooms: RoomRegistry): Array<{ x: number; y: number }> =>
  visiblePropsFor(world, rooms)
    .filter(
      (prop) =>
        prop.kind === 'brazier' || prop.kind === 'ceremonial_brazier' || prop.kind === 'column',
    )
    .map((prop) => prop.at);

const drawSteppedSurface = (
  ctx: CanvasRenderingContext2D,
  world: World,
  cam: Camera,
  pal: Palette,
): boolean => {
  const ramp = world.arena.elevationRamp;
  if (ramp === undefined || ramp.axis !== 'y' || ramp.from <= ramp.to) return false;
  const outline = arenaVertices(world.arena);
  const upper = clipAtY(outline, ramp.to, true);

  ctx.save();
  screenPolygon(ctx, cam, upper, ramp.height);
  ctx.fillStyle = pal.floor;
  ctx.fill();
  ctx.strokeStyle = pal.floorGrid;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  const run = (ramp.from - ramp.to) / ramp.steps;
  for (let step = ramp.steps - 1; step >= 0; step--) {
    const nearY = ramp.from - run * step;
    const farY = ramp.from - run * (step + 1);
    const nearSpan = spanAtY(outline, nearY);
    const farSpan = spanAtY(outline, farY);
    if (nearSpan === null || farSpan === null) continue;
    const elevation = ((step + 1) / ramp.steps) * ramp.height;
    const lowerElevation = (step / ramp.steps) * ramp.height;
    const tread = [
      { x: farSpan[0], y: farY },
      { x: farSpan[1], y: farY },
      { x: nearSpan[1], y: nearY },
      { x: nearSpan[0], y: nearY },
    ];
    screenPolygon(ctx, cam, tread, elevation);
    ctx.fillStyle = pal.floor;
    ctx.fill();
    ctx.strokeStyle = pal.floorGrid;
    ctx.lineWidth = 1.4;
    ctx.stroke();

    const highRight = worldToScreenAtElevation(
      cam,
      { x: nearSpan[1], y: nearY },
      elevation,
    );
    const highLeft = worldToScreenAtElevation(
      cam,
      { x: nearSpan[0], y: nearY },
      elevation,
    );
    const lowLeft = worldToScreenAtElevation(
      cam,
      { x: nearSpan[0], y: nearY },
      lowerElevation,
    );
    const lowRight = worldToScreenAtElevation(
      cam,
      { x: nearSpan[1], y: nearY },
      lowerElevation,
    );
    ctx.beginPath();
    ctx.moveTo(highLeft.x, highLeft.y);
    ctx.lineTo(highRight.x, highRight.y);
    ctx.lineTo(lowRight.x, lowRight.y);
    ctx.lineTo(lowLeft.x, lowLeft.y);
    ctx.closePath();
    ctx.fillStyle = pal.wall;
    ctx.globalAlpha = 0.72;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = pal.floorGrid;
    ctx.stroke();
  }
  ctx.restore();
  return true;
};

const drawArenaGates = (
  ctx: CanvasRenderingContext2D,
  world: World,
  cam: Camera,
  pal: Palette,
): void => {
  for (const gate of world.arena.gates ?? []) {
    const from = worldToScreen(cam, gate.from);
    const to = worldToScreen(cam, gate.to);
    const closed = arenaGateIsClosed(world, gate);
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    if (length <= 0) continue;
    const nx = -dy / length;
    const ny = dx / length;

    ctx.save();
    ctx.strokeStyle = closed ? pal.danger : pal.hudDim;
    ctx.fillStyle = ctx.strokeStyle;
    ctx.globalAlpha = closed ? 0.9 : 0.38;
    ctx.lineCap = 'square';
    if (closed) {
      ctx.lineWidth = Math.max(5, 7 * cam.zoom);
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
      ctx.strokeStyle = pal.wall;
      ctx.lineWidth = Math.max(1.5, 2 * cam.zoom);
      for (let bar = 0; bar <= 5; bar++) {
        const t = bar / 5;
        const x = from.x + dx * t;
        const y = from.y + dy * t;
        ctx.beginPath();
        ctx.moveTo(x - nx * 7 * cam.zoom, y - ny * 7 * cam.zoom);
        ctx.lineTo(x + nx * 7 * cam.zoom, y + ny * 7 * cam.zoom);
        ctx.stroke();
      }
    }
    for (const point of [from, to]) {
      ctx.beginPath();
      ctx.arc(point.x, point.y, Math.max(3, 4 * cam.zoom), 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }
};


const drawShockwaveShelter = (
  ctx: CanvasRenderingContext2D,
  world: World,
  cam: Camera,
  opts: DrawOpts,
): void => {
  const h = world.arena.halfExtents;
  for (const enemy of world.enemies) {
    if (
      enemy.state.kind !== 'telegraph' &&
      (!__CROWN_LAB__ || enemy.state.kind !== 'attack')
    ) continue;
    const ecfg = opts.cfg.enemies[enemy.archetype];
    const def = ecfg.attacks[enemy.state.attackIndex];
    if (def === undefined || def.kind !== 'shockwave') continue;
    const wave = ecfg.volley?.shockwave;
    if (wave === undefined) continue;

    const releasing = __CROWN_LAB__ && enemy.state.kind === 'attack';
    const total = Math.max(
      1,
      releasing ? def.activeMs : def.telegraphMs + enemy.state.telegraphJitterMs,
    );
    const t = Math.min(1, enemy.state.elapsedMs / total);

    ctx.save();
    ctx.globalAlpha = releasing ? 0.4 * (1 - t * 0.55) : 0.1 + t * 0.3;
    ctx.fillStyle = opts.pal.unparryable;
    ctx.fillRect(
      cam.width * -1,
      cam.height * -1,
      cam.width * 3,
      cam.height * 3,
    );
    ctx.globalCompositeOperation = 'destination-out';
    ctx.globalAlpha = 1;
    for (const cx of [-h.x, h.x]) {
      for (const cy of [-h.y, h.y]) {
        const centre = worldToScreen(cam, { x: cx, y: cy });
        const ring = groundEllipse(cam, wave.cornerRadius);
        ctx.beginPath();
        ctx.ellipse(centre.x, centre.y, ring.rx, ring.ry, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();

    if (releasing) {
      const centre = worldToScreen(cam, enemy.pos);
      const radius = Math.hypot(h.x, h.y) * (0.08 + t * 0.92);
      const ring = groundEllipse(cam, radius);
      ctx.save();
      ctx.globalAlpha = 0.9 * (1 - t * 0.45);
      ctx.strokeStyle = opts.pal.unparryable;
      ctx.lineWidth = 5 - t * 2;
      ctx.beginPath();
      ctx.ellipse(centre.x, centre.y, ring.rx, ring.ry, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    ctx.strokeStyle = opts.pal.hudText;
    ctx.lineWidth = 1.5 + t * 2;
    ctx.globalAlpha = releasing ? 0.92 - t * 0.22 : 0.35 + t * 0.5;
    for (const cx of [-h.x, h.x]) {
      for (const cy of [-h.y, h.y]) {
        const centre = worldToScreen(cam, { x: cx, y: cy });
        const ring = groundEllipse(cam, wave.cornerRadius);
        ctx.beginPath();
        ctx.ellipse(centre.x, centre.y, ring.rx, ring.ry, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
};

export const drawArena = (
  ctx: CanvasRenderingContext2D,
  world: World,
  cam: Camera,
  opts: DrawOpts,
): void => {
  const h = world.arena.halfExtents;
  const pal = opts.pal;
  const vertices = arenaVertices(world.arena);
  const corners = vertices.map((p) => worldToScreenAtElevation(cam, p, 0));

  const ambience = ambienceFor(opts.rooms, world.encounter.defId);
  const mazePortalDirection = opts.mazePortalDirection ?? 'up';
  drawRoomShell(ctx, world, cam, ambience, pal.wall, mazePortalDirection);
  if (__CROWN_LAB__ || isPublicRoom(world.encounter.defId)) {
    drawArenaFoundation(ctx, world, cam, pal, opts.rooms);
  }
  if (opts.apotheosis.architecture) {
    drawCinematicFoundation(ctx, cam, vertices, pal, ambience);
  }

  ctx.fillStyle = pal.floor;
  ctx.beginPath();
  ctx.moveTo(corners[0].x, corners[0].y);
  for (let i = 1; i < corners.length; i++) ctx.lineTo(corners[i].x, corners[i].y);
  ctx.closePath();
  ctx.fill();

  const hasSteppedSurface = drawSteppedSurface(ctx, world, cam, pal);

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(corners[0].x, corners[0].y);
  for (let i = 1; i < corners.length; i++) ctx.lineTo(corners[i].x, corners[i].y);
  ctx.closePath();
  ctx.clip();

  if (opts.apotheosis.floorMaterial) {
    drawCinematicFloor(ctx, world, cam, pal, ambience, opts.apotheosis.cachedFloorDetail);
  }

  if (__CROWN_LAB__ || isPublicRoom(world.encounter.defId)) {
    drawArenaFloor(ctx, world, cam, pal, opts.rooms);
  }
  drawWindowLight(ctx, world, cam, opts.rooms, ambience);
  const roomEmitters = [
    ...emitterPositions(world, opts.rooms),
    ...(opts.pillars ?? []).map((pillar) => pillar.at),
  ];
  drawFloorLight(ctx, cam, ambience, lightsFor(world, roomEmitters), sceneTimeMs(world));
  drawFloorFog(ctx, world, cam, ambience);

  if (opts.pres.visual.floorGrid && !hasSteppedSurface) {
    ctx.strokeStyle = pal.floorGrid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = Math.ceil(-h.x); x <= h.x; x++) {
      const a = worldToScreen(cam, { x, y: -h.y });
      const b = worldToScreen(cam, { x, y: h.y });
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    for (let y = Math.ceil(-h.y); y <= h.y; y++) {
      const a = worldToScreen(cam, { x: -h.x, y });
      const b = worldToScreen(cam, { x: h.x, y });
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
  }
  drawShockwaveShelter(ctx, world, cam, opts);
  ctx.restore();

  const boundaryCorners = vertices.map((p) => worldToScreen(cam, p));
  ctx.strokeStyle = pal.wall;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(boundaryCorners[0].x, boundaryCorners[0].y);
  for (let i = 1; i < boundaryCorners.length; i++) {
    ctx.lineTo(boundaryCorners[i].x, boundaryCorners[i].y);
  }
  ctx.closePath();
  ctx.stroke();
  drawArenaGates(ctx, world, cam, pal);
};
