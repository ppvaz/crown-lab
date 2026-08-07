
import type { Vec2, World } from '../sim/types';
import { arenaVertices } from '../sim/arena';
import type { Camera } from './iso';
import { worldToScreenAtElevation } from './iso';
import { withAlpha } from './palette';
import { mixHex } from './draw-primitives';
import type { Ambience } from './ambience';
import { drawSky, drawParallax } from './sky';
import type { FacadeWall, WallFace } from './facade';
import {
  ARCHITRAVE_RELIEF,
  ARCHITRAVE_SCALE,
  ARCH_SEGMENTS,
  BASE_COURSE_RELIEF,
  CORNICE_RELIEF,
  COURSE_RELIEF,
  COURSE_STEP,
  GLAZING_SCALE,
  PILASTER_RELIEF,
  PLINTH_DROP,
  REVEAL_DEPTH,
  SILL_RELIEF,
  TRACERY_RELIEF,
  WALL_HEIGHT,
  WALL_INSET,
  WALL_THICKNESS,
  WINDOW_MIN_ZOOM,
  facadePoint,
  fillRelieved,
  layOutWall,
  traceBaseCourse,
  traceCornice,
  traceCourses,
  traceOpenings,
  tracePilasters,
  traceSills,
  traceTracery,
  visibleWallLayout,
} from './facade';

export type MazePortalDirection = 'up' | 'down';


const drawFacade = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  walls: readonly FacadeWall[],
  ambience: Ambience,
  spacing: number,
  floor: readonly Vec2[],
): void => {
  if (spacing <= 0 || cam.zoom < WINDOW_MIN_ZOOM || walls.length === 0) return;

  ctx.lineWidth = 1;

  const faces: readonly WallFace[] = walls.map((wall) => ({
    wall,
    layout: visibleWallLayout(cam, wall, spacing, floor, ambience.windowStyle),
  }));

  fillRelieved(
    ctx,
    (relief) => traceCourses(ctx, cam, walls, spacing * 1.5, relief),
    COURSE_RELIEF,
    withAlpha(ambience.fill, 0.2),
    withAlpha(ambience.skyHigh, 0.4),
  );

  fillRelieved(
    ctx,
    (relief) => tracePilasters(ctx, cam, faces, relief),
    PILASTER_RELIEF,
    withAlpha(ambience.skyHigh, 0.62),
    withAlpha(ambience.fill, 0.14),
  );
  ctx.strokeStyle = withAlpha(ambience.skyHigh, 0.42);
  ctx.stroke();

  traceOpenings(ctx, cam, faces, ARCHITRAVE_SCALE, 0, ambience.windowStyle);
  ctx.fillStyle = withAlpha(ambience.fill, 0.22);
  ctx.fill();
  const bounds = traceOpenings(
    ctx,
    cam,
    faces,
    ARCHITRAVE_SCALE,
    ARCHITRAVE_RELIEF,
    ambience.windowStyle,
  );
  if (bounds === null) return;
  ctx.fillStyle = withAlpha(ambience.skyHigh, 0.5);
  ctx.fill();
  ctx.strokeStyle = withAlpha(ambience.fill, 0.3);
  ctx.stroke();




  traceOpenings(ctx, cam, faces, 1, 0, ambience.windowStyle);
  ctx.save();
  ctx.clip();
  ctx.fillStyle = withAlpha(ambience.skyHigh, 0.94);
  ctx.fill();
  traceOpenings(ctx, cam, faces, 1, -REVEAL_DEPTH, ambience.windowStyle);
  ctx.clip();
  drawSky(ctx, cam, ambience);
  drawParallax(ctx, cam, ambience);


  const glass =
    ambience.glassStyle === 'amber'
      ? { color: ambience.key, alpha: 0.18 }
      : ambience.glassStyle === 'frost'
        ? { color: '#b8d8ef', alpha: 0.24 }
        : ambience.glassStyle === 'smoke'
          ? { color: ambience.skyLow, alpha: 0.38 }
          : ambience.glassStyle === 'crimson'
            ? { color: '#74283b', alpha: 0.26 }
            : { color: ambience.fill, alpha: 0.16 };
  ctx.fillStyle = withAlpha(glass.color, glass.alpha);
  ctx.fillRect(bounds.minX, bounds.minY, bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);

  const sheen = ctx.createLinearGradient(bounds.minX, bounds.minY, bounds.maxX, bounds.maxY);
  sheen.addColorStop(0, withAlpha(ambience.fill, 0));
  sheen.addColorStop(0.44, withAlpha(ambience.fill, 0));
  sheen.addColorStop(0.5, withAlpha('#ffffff', 0.12));
  sheen.addColorStop(0.56, withAlpha(ambience.fill, 0));
  sheen.addColorStop(1, withAlpha(ambience.fill, 0));
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = sheen;
  ctx.fillRect(bounds.minX, bounds.minY, bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
  ctx.restore();

  traceOpenings(ctx, cam, faces, 1, 0, ambience.windowStyle);
  ctx.strokeStyle = withAlpha(ambience.fill, 0.4);
  ctx.stroke();

  fillRelieved(
    ctx,
    (relief) => traceTracery(ctx, cam, faces, -REVEAL_DEPTH + relief, ambience.windowStyle),
    TRACERY_RELIEF,
    withAlpha(ambience.fill, 0.34),
    withAlpha(ambience.skyHigh, 0.72),
  );

  traceOpenings(ctx, cam, faces, GLAZING_SCALE, -REVEAL_DEPTH, ambience.windowStyle);
  ctx.strokeStyle = withAlpha(ambience.skyHigh, 0.4);
  ctx.stroke();

  fillRelieved(
    ctx,
    (relief) => traceSills(ctx, cam, faces, relief, ambience.windowStyle),
    SILL_RELIEF,
    withAlpha(ambience.fill, 0.4),
    withAlpha(ambience.skyHigh, 0.72),
  );
  ctx.strokeStyle = withAlpha(ambience.key, 0.26);
  ctx.stroke();
};

const drawWallCondition = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  walls: readonly FacadeWall[],
  ambience: Ambience,
): void => {
  if (
    ambience.wallCondition === 'plain' ||
    ambience.windowSpacing <= 0 ||
    cam.zoom < WINDOW_MIN_ZOOM ||
    walls.length === 0
  ) {
    return;
  }

  ctx.save();
  ctx.beginPath();
  for (let wallIndex = 0; wallIndex < walls.length; wallIndex += 1) {
    const wall = walls[wallIndex];
    const length = Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y);
    if (length < 2.2) continue;
    const at = (distance: number, elevation: number) =>
      facadePoint(cam, wall, length, distance, elevation, 0.03);

    if (ambience.wallCondition === 'kept') {
      const centre = length / 2;
      const points = [
        at(centre, 3.34),
        at(centre + 0.34, 2.82),
        at(centre, 2.3),
        at(centre - 0.34, 2.82),
      ];
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
      ctx.closePath();
      continue;
    }

    if (ambience.wallCondition === 'fortified') {
      for (const elevation of [1.55, 3.18]) {
        const from = at(0.5, elevation);
        const to = at(length - 0.5, elevation);
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
      }
      continue;
    }

    const cracks =
      ambience.wallCondition === 'damaged'
        ? [
            [0.3, 4.75, 1],
            [0.68, 4.28, -1],
          ]
        : [[wallIndex % 2 === 0 ? 0.38 : 0.62, 4.52, wallIndex % 2 === 0 ? 1 : -1]];
    for (const [fraction, top, direction] of cracks) {
      const start = length * fraction;
      const points = [
        at(start, top),
        at(start + 0.18 * direction, top - 0.62),
        at(start - 0.12 * direction, top - 1.08),
        at(start + 0.24 * direction, top - 1.72),
      ];
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    }
  }
  ctx.strokeStyle =
    ambience.wallCondition === 'kept'
      ? withAlpha(ambience.key, 0.28)
      : withAlpha(ambience.skyLow, ambience.wallCondition === 'damaged' ? 0.72 : 0.54);
  ctx.lineWidth = ambience.wallCondition === 'fortified' ? 2 : 1.25;
  ctx.stroke();
  ctx.restore();
};

const drawWallDisplay = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  walls: readonly FacadeWall[],
  ambience: Ambience,
): void => {
  if (
    ambience.wallDisplay === 'none' ||
    ambience.windowSpacing <= 0 ||
    cam.zoom < WINDOW_MIN_ZOOM ||
    walls.length === 0
  ) {
    return;
  }

  const anchors = walls.flatMap((wall) => {
    const layout = layOutWall(wall, Math.max(2.4, ambience.windowSpacing), ambience.windowStyle);
    const centre =
      layout.openings.length >= 2
        ? (layout.openings[0] + layout.openings[1]) / 2
        : layout.openings.length === 0 && layout.length >= 2.4
          ? layout.length / 2
          : null;
    return centre === null ? [] : [{ wall, length: layout.length, centre }];
  });
  if (anchors.length === 0) return;

  const point = (
    anchor: (typeof anchors)[number],
    distance: number,
    elevation: number,
  ): Vec2 => facadePoint(cam, anchor.wall, anchor.length, distance, elevation, 0.045);
  const tracePolygon = (points: readonly Vec2[]): void => {
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.closePath();
  };

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(1, 1.35 * cam.zoom);

  ctx.beginPath();
  for (const anchor of anchors) {
    const c = anchor.centre;
    if (ambience.wallDisplay === 'heraldry') {
      tracePolygon([
        point(anchor, c - 0.44, 3.72),
        point(anchor, c + 0.44, 3.72),
        point(anchor, c + 0.44, 1.8),
        point(anchor, c, 2.08),
        point(anchor, c - 0.44, 1.8),
      ]);
    } else if (ambience.wallDisplay === 'arms') {
      tracePolygon([
        point(anchor, c, 3.56),
        point(anchor, c + 0.5, 2.76),
        point(anchor, c, 1.96),
        point(anchor, c - 0.5, 2.76),
      ]);
    } else if (ambience.wallDisplay === 'records') {
      for (const offset of [-0.34, 0, 0.34]) {
        tracePolygon([
          point(anchor, c + offset - 0.12, 3.32),
          point(anchor, c + offset + 0.12, 3.32),
          point(anchor, c + offset + 0.12, 2.08),
          point(anchor, c + offset - 0.12, 2.08),
        ]);
      }
    } else if (ambience.wallDisplay === 'service') {
      tracePolygon([
        point(anchor, c - 0.36, 3.12),
        point(anchor, c - 0.04, 3.12),
        point(anchor, c - 0.04, 2.18),
        point(anchor, c - 0.2, 2.36),
        point(anchor, c - 0.36, 2.18),
      ]);
    }
  }
  ctx.fillStyle = withAlpha(
    ambience.wallDisplay === 'service' ? ambience.fill : ambience.key,
    ambience.wallDisplay === 'heraldry' ? 0.2 : ambience.wallDisplay === 'service' ? 0.24 : 0.12,
  );
  ctx.fill();

  ctx.beginPath();
  for (const anchor of anchors) {
    const c = anchor.centre;
    if (ambience.wallDisplay === 'heraldry') {
      const diamond = [
        point(anchor, c, 3.3),
        point(anchor, c + 0.22, 2.78),
        point(anchor, c, 2.26),
        point(anchor, c - 0.22, 2.78),
      ];
      tracePolygon(diamond);
    } else if (ambience.wallDisplay === 'arms') {
      const a0 = point(anchor, c - 0.52, 2.08);
      const a1 = point(anchor, c + 0.52, 3.42);
      const b0 = point(anchor, c + 0.52, 2.08);
      const b1 = point(anchor, c - 0.52, 3.42);
      ctx.moveTo(a0.x, a0.y);
      ctx.lineTo(a1.x, a1.y);
      ctx.moveTo(b0.x, b0.y);
      ctx.lineTo(b1.x, b1.y);
      const rail0 = point(anchor, c - 0.6, 1.92);
      const rail1 = point(anchor, c + 0.6, 1.92);
      ctx.moveTo(rail0.x, rail0.y);
      ctx.lineTo(rail1.x, rail1.y);
    } else if (ambience.wallDisplay === 'records') {
      const shelf0 = point(anchor, c - 0.56, 1.96);
      const shelf1 = point(anchor, c + 0.56, 1.96);
      ctx.moveTo(shelf0.x, shelf0.y);
      ctx.lineTo(shelf1.x, shelf1.y);
      for (const offset of [-0.34, 0, 0.34]) {
        const spine0 = point(anchor, c + offset, 2.18);
        const spine1 = point(anchor, c + offset, 3.18);
        ctx.moveTo(spine0.x, spine0.y);
        ctx.lineTo(spine1.x, spine1.y);
      }
    } else {
      const rail0 = point(anchor, c - 0.62, 3.18);
      const rail1 = point(anchor, c + 0.62, 3.18);
      ctx.moveTo(rail0.x, rail0.y);
      ctx.lineTo(rail1.x, rail1.y);
      for (const [index, offset] of [-0.44, -0.15, 0.15, 0.44].entries()) {
        const top = point(anchor, c + offset, 3.18);
        const bottom = point(anchor, c + offset, index % 2 === 0 ? 2.26 : 2.48);
        const hook = point(anchor, c + offset + 0.12, index % 2 === 0 ? 2.38 : 2.6);
        ctx.moveTo(top.x, top.y);
        ctx.lineTo(bottom.x, bottom.y);
        ctx.lineTo(hook.x, hook.y);
      }
    }
  }
  ctx.strokeStyle = withAlpha(
    ambience.key,
    ambience.wallDisplay === 'service' ? 0.28 : 0.4,
  );
  ctx.stroke();
  ctx.restore();
};

const edgeOutward = (a: Vec2, b: Vec2): Vec2 => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  return length <= 1e-9 ? { x: 0, y: 0 } : { x: dy / length, y: -dx / length };
};

export const wallFootprint = (
  vertices: readonly Vec2[],
  inset: number,
): Vec2[] => {
  return vertices.map((vertex, i) => {
    const previous = vertices[(i - 1 + vertices.length) % vertices.length];
    const next = vertices[(i + 1) % vertices.length];
    const before = edgeOutward(previous, vertex);
    const after = edgeOutward(vertex, next);
    const denominator = 1 + before.x * after.x + before.y * after.y;
    if (denominator <= 1e-9) {
      const fallback = Math.hypot(after.x, after.y) > 0 ? after : before;
      return { x: vertex.x + fallback.x * inset, y: vertex.y + fallback.y * inset };
    }
    const scale = inset / denominator;
    return {
      x: vertex.x + (before.x + after.x) * scale,
      y: vertex.y + (before.y + after.y) * scale,
    };
  });
};

const portalArchPoints = (
  cam: Camera,
  wall: FacadeWall,
  length: number,
  width: number,
  head: number,
  apex: number,
  relief: number,
): Vec2[] => {
  const centre = length / 2;
  const half = width / 2;
  const points = [
    facadePoint(cam, wall, length, centre - half, 0, relief),
    facadePoint(cam, wall, length, centre + half, 0, relief),
    facadePoint(cam, wall, length, centre + half, head, relief),
  ];
  for (let step = 1; step < ARCH_SEGMENTS; step++) {
    const angle = (step / ARCH_SEGMENTS) * Math.PI;
    points.push(
      facadePoint(
        cam,
        wall,
        length,
        centre + half * Math.cos(angle),
        head + (apex - head) * Math.sin(angle),
        relief,
      ),
    );
  }
  points.push(facadePoint(cam, wall, length, centre - half, head, relief));
  return points;
};

const tracePortalArch = (ctx: CanvasRenderingContext2D, points: readonly Vec2[]): void => {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.closePath();
};

const drawPortalInteriorSteps = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  wall: FacadeWall,
  length: number,
  opening: readonly Vec2[],
  ambience: Ambience,
  direction: MazePortalDirection,
): void => {
  const tangent = {
    x: (wall.b.x - wall.a.x) / length,
    y: (wall.b.y - wall.a.y) / length,
  };
  const threshold = {
    x: (wall.a.x + wall.b.x) / 2 + wall.outward.x * 0.08,
    y: (wall.a.y + wall.b.y) / 2 + wall.outward.y * 0.08,
  };
  const rawDepth =
    direction === 'up'
      ? wall.outward
      : {
          x: wall.outward.x - tangent.x * 0.55,
          y: wall.outward.y - tangent.y * 0.55,
        };
  const depthLength = Math.hypot(rawDepth.x, rawDepth.y) || 1;
  const depthDirection = {
    x: rawDepth.x / depthLength,
    y: rawDepth.y / depthLength,
  };
  const depth = 1.65;
  const halfWidth = Math.min(0.96, length / 2 - 0.28);
  const steps = 4;
  const positionAt = (t: number): Vec2 => ({
    x: threshold.x + depthDirection.x * depth * t,
    y: threshold.y + depthDirection.y * depth * t,
  });
  const elevationAt = (t: number): number => (direction === 'up' ? 0.92 : -0.48) * t;
  const corner = (position: Vec2, side: number, elevation: number): Vec2 =>
    worldToScreenAtElevation(
      cam,
      {
        x: position.x + tangent.x * halfWidth * side,
        y: position.y + tangent.y * halfWidth * side,
      },
      elevation,
    );

  ctx.save();
  tracePortalArch(ctx, opening);
  ctx.clip();

  const landingNear = positionAt(0);
  const landingFar = positionAt(1);
  const landing = [
    corner(landingNear, -1, direction === 'down' ? -0.02 : 0),
    corner(landingNear, 1, direction === 'down' ? -0.02 : 0),
    corner(landingFar, 1, direction === 'down' ? elevationAt(1) : 0),
    corner(landingFar, -1, direction === 'down' ? elevationAt(1) : 0),
  ];
  ctx.beginPath();
  ctx.moveTo(landing[0].x, landing[0].y);
  for (let i = 1; i < landing.length; i++) ctx.lineTo(landing[i].x, landing[i].y);
  ctx.closePath();
  ctx.fillStyle = withAlpha(ambience.skyLow, 0.86);
  ctx.fill();

  const nosings: Array<[Vec2, Vec2]> = [];
  for (let i = steps - 1; i >= 0; i--) {
    const nearT = i / steps;
    const farT = (i + 1) / steps;
    const nearPosition = positionAt(nearT);
    const farPosition = positionAt(farT);
    const nearElevation = elevationAt(nearT);
    const farElevation = elevationAt(farT);
    const tread = [
      corner(nearPosition, -1, farElevation),
      corner(nearPosition, 1, farElevation),
      corner(farPosition, 1, farElevation),
      corner(farPosition, -1, farElevation),
    ];
    ctx.beginPath();
    ctx.moveTo(tread[0].x, tread[0].y);
    for (let point = 1; point < tread.length; point++) {
      ctx.lineTo(tread[point].x, tread[point].y);
    }
    ctx.closePath();
    ctx.fillStyle =
      direction === 'up'
        ? mixHex(ambience.skyHigh, ambience.fill, 0.5 - farT * 0.18)
        : mixHex(ambience.skyHigh, ambience.fill, 0.4 - farT * 0.18);
    ctx.fill();

    const riser = [
      corner(nearPosition, -1, nearElevation),
      corner(nearPosition, 1, nearElevation),
      corner(nearPosition, 1, farElevation),
      corner(nearPosition, -1, farElevation),
    ];
    ctx.beginPath();
    ctx.moveTo(riser[0].x, riser[0].y);
    for (let point = 1; point < riser.length; point++) {
      ctx.lineTo(riser[point].x, riser[point].y);
    }
    ctx.closePath();
    ctx.fillStyle = mixHex(ambience.skyLow, '#000000', 0.38 + farT * 0.44);
    ctx.fill();
    nosings.push([tread[0], tread[1]]);
  }

  ctx.beginPath();
  for (const [left, right] of nosings) {
    ctx.moveTo(left.x, left.y);
    ctx.lineTo(right.x, right.y);
  }
  ctx.strokeStyle = withAlpha(ambience.fill, direction === 'up' ? 0.3 : 0.34);
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
};

const drawMazePortalFace = (
  ctx: CanvasRenderingContext2D,
  world: World,
  cam: Camera,
  ambience: Ambience,
  footprint: readonly Vec2[],
  outwards: readonly Vec2[],
  direction: MazePortalDirection,
): void => {
  if (world.encounter.defId !== 'maze_serpentine' || footprint.length < 2) return;
  const wall: FacadeWall = { a: footprint[0], b: footprint[1], outward: outwards[0] };
  const length = Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y);
  if (length <= 0) return;

  const outerWidth = Math.min(2.78, length - 0.16);
  const innerWidth = Math.max(0.5, outerWidth - 0.42);
  const outer = (relief: number) =>
    portalArchPoints(cam, wall, length, outerWidth, 3.86, 5.12, relief);

  const back = outer(0);
  tracePortalArch(ctx, back);
  ctx.fillStyle = mixHex(ambience.skyHigh, ambience.fill, 0.22);
  ctx.fill();
  const front = outer(0.18);
  tracePortalArch(ctx, front);
  ctx.fillStyle = mixHex(ambience.skyHigh, ambience.fill, 0.46);
  ctx.fill();

  const opening = portalArchPoints(cam, wall, length, innerWidth, 3.62, 4.82, 0.2);
  const top = Math.min(...opening.map((point) => point.y));
  const bottom = Math.max(...opening.map((point) => point.y));
  const voidGradient = ctx.createLinearGradient(0, top, 0, bottom);
  if (direction === 'up') {
    voidGradient.addColorStop(0, mixHex(ambience.skyLow, ambience.fill, 0.18));
    voidGradient.addColorStop(0.52, '#05070d');
    voidGradient.addColorStop(1, '#010207');
  } else {
    voidGradient.addColorStop(0, '#080b14');
    voidGradient.addColorStop(0.48, '#03040a');
    voidGradient.addColorStop(1, '#000000');
  }
  tracePortalArch(ctx, opening);
  ctx.fillStyle = voidGradient;
  ctx.fill();
  drawPortalInteriorSteps(ctx, cam, wall, length, opening, ambience, direction);
  tracePortalArch(ctx, opening);
  ctx.strokeStyle = withAlpha(ambience.key, 0.34);
  ctx.lineWidth = 1.4;
  ctx.stroke();

  const recess = portalArchPoints(cam, wall, length, innerWidth - 0.24, 3.48, 4.62, -0.08);
  tracePortalArch(ctx, recess);
  ctx.strokeStyle = withAlpha(ambience.fill, 0.26);
  ctx.lineWidth = 1;
  ctx.stroke();
};

export const drawRoomShell = (
  ctx: CanvasRenderingContext2D,
  world: World,
  cam: Camera,
  ambience: Ambience,
  wallColor: string,
  mazePortalDirection: MazePortalDirection = 'up',
): void => {
  const vertices = arenaVertices(world.arena);
  if (vertices.length < 3) return;
  const footprint = wallFootprint(vertices, WALL_INSET);
  const floorScreen = vertices.map((point) => worldToScreenAtElevation(cam, point, 0));
  const crown = wallFootprint(vertices, WALL_INSET + WALL_THICKNESS);
  const outwards = vertices.map((a, i) =>
    edgeOutward(a, vertices[(i + 1) % vertices.length]),
  );
  const farEdge = outwards.map((outward) => outward.x + outward.y <= 0);
  const far: FacadeWall[] = [];
  const copings: Vec2[][] = [];
  const endCaps: Vec2[][] = [];

  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % vertices.length];
    if (!farEdge[i]) {
      const topA = worldToScreenAtElevation(cam, a, 0);
      const topB = worldToScreenAtElevation(cam, b, 0);
      const drop = PLINTH_DROP * 34 * cam.zoom;
      ctx.fillStyle = ambience.skyLow;
      ctx.beginPath();
      ctx.moveTo(topA.x, topA.y);
      ctx.lineTo(topB.x, topB.y);
      ctx.lineTo(topB.x, topB.y + drop);
      ctx.lineTo(topA.x, topA.y + drop);
      ctx.closePath();
      ctx.fill();
      continue;
    }


    const footA = footprint[i];
    const footB = footprint[(i + 1) % vertices.length];
    const baseA = worldToScreenAtElevation(cam, footA, 0);
    const baseB = worldToScreenAtElevation(cam, footB, 0);
    const topA = worldToScreenAtElevation(cam, footA, WALL_HEIGHT);
    const topB = worldToScreenAtElevation(cam, footB, WALL_HEIGHT);


    const top = Math.min(topA.y, topB.y);
    const bottom = Math.max(baseA.y, baseB.y);

    const gradient = ctx.createLinearGradient(0, top, 0, bottom);
    gradient.addColorStop(0, ambience.skyHigh);
    gradient.addColorStop(0.8, wallColor);
    gradient.addColorStop(1, mixHex(wallColor, ambience.key, 0.4));
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(baseA.x, baseA.y);
    ctx.lineTo(baseB.x, baseB.y);
    ctx.lineTo(topB.x, topB.y);
    ctx.lineTo(topA.x, topA.y);
    ctx.closePath();
    ctx.fill();

    const outward = outwards[i];
    const facade = {
      a: footA,
      b: footB,
      outward,
    };
    far.push(facade);

    copings.push([
      topA,
      topB,
      worldToScreenAtElevation(cam, crown[(i + 1) % vertices.length], WALL_HEIGHT),
      worldToScreenAtElevation(cam, crown[i], WALL_HEIGHT),
    ]);

    const capAt = (vertexIndex: number): Vec2[] => {
      const front = {
        x: footprint[vertexIndex].x - outward.x * CORNICE_RELIEF,
        y: footprint[vertexIndex].y - outward.y * CORNICE_RELIEF,
      };
      return [
        worldToScreenAtElevation(cam, front, 0),
        worldToScreenAtElevation(cam, crown[vertexIndex], 0),
        worldToScreenAtElevation(cam, crown[vertexIndex], WALL_HEIGHT),
        worldToScreenAtElevation(cam, front, WALL_HEIGHT),
      ];
    };
    const previous = (i - 1 + vertices.length) % vertices.length;
    const next = (i + 1) % vertices.length;
    if (!farEdge[previous]) endCaps.push(capAt(i));
    if (!farEdge[next]) endCaps.push(capAt(next));

    const shadow = ctx.createLinearGradient(0, bottom - 26 * cam.zoom, 0, bottom);
    shadow.addColorStop(0, withAlpha(ambience.skyLow, 0));
    shadow.addColorStop(1, withAlpha(ambience.skyLow, 0.55));
    ctx.fillStyle = shadow;
    ctx.beginPath();
    ctx.moveTo(baseA.x, baseA.y);
    ctx.lineTo(baseB.x, baseB.y);
    ctx.lineTo(topB.x, topB.y);
    ctx.lineTo(topA.x, topA.y);
    ctx.closePath();
    ctx.fill();
  }

  if (copings.length > 0) {

    ctx.beginPath();
    for (const quad of copings) {
      ctx.moveTo(quad[0].x, quad[0].y);
      for (let k = 1; k < quad.length; k++) ctx.lineTo(quad[k].x, quad[k].y);
      ctx.closePath();
    }
    ctx.fillStyle = ambience.skyHigh;
    ctx.fill();
    ctx.fillStyle = withAlpha(ambience.fill, 0.18);
    ctx.fill();


    ctx.beginPath();
    for (const quad of copings) {
      ctx.moveTo(quad[0].x, quad[0].y);
      ctx.lineTo(quad[1].x, quad[1].y);
      ctx.moveTo(quad[2].x, quad[2].y);
      ctx.lineTo(quad[3].x, quad[3].y);
    }
    ctx.strokeStyle = withAlpha(ambience.fill, 0.34);
    ctx.lineWidth = 1;
    ctx.stroke();
  }


  if (far.length > 0) {
    ctx.lineWidth = 1;
    fillRelieved(
      ctx,
      (relief) => traceCornice(ctx, cam, far, relief),
      CORNICE_RELIEF,
      withAlpha(ambience.fill, 0.34),
      withAlpha(ambience.skyHigh, 0.5),
    );
    ctx.strokeStyle = withAlpha(ambience.fill, 0.2);
    ctx.stroke();

    fillRelieved(
      ctx,
      (relief) => traceBaseCourse(ctx, cam, far, relief),
      BASE_COURSE_RELIEF,
      withAlpha(ambience.fill, 0.3),
      withAlpha(ambience.skyHigh, 0.62),
    );
    ctx.strokeStyle = withAlpha(ambience.fill, 0.24);
    ctx.stroke();
  }

  drawFacade(ctx, cam, far, ambience, ambience.windowSpacing, floorScreen);
  drawWallCondition(ctx, cam, far, ambience);
  drawWallDisplay(ctx, cam, far, ambience);
  if (__CROWN_LAB__) {
    drawMazePortalFace(
      ctx,
      world,
      cam,
      ambience,
      footprint,
      outwards,
      mazePortalDirection,
    );
  }


  if (endCaps.length > 0) {
    ctx.beginPath();
    for (const quad of endCaps) {
      ctx.moveTo(quad[0].x, quad[0].y);
      for (let i = 1; i < quad.length; i++) ctx.lineTo(quad[i].x, quad[i].y);
      ctx.closePath();
    }
    ctx.fillStyle = mixHex(wallColor, ambience.fill, 0.2);
    ctx.fill();
  }


  if (endCaps.length > 0) {
    ctx.beginPath();
    for (const quad of endCaps) {
      for (let elevation = COURSE_STEP; elevation < WALL_HEIGHT; elevation += COURSE_STEP) {
        const t = elevation / WALL_HEIGHT;
        const front = {
          x: quad[0].x + (quad[3].x - quad[0].x) * t,
          y: quad[0].y + (quad[3].y - quad[0].y) * t,
        };
        const back = {
          x: quad[1].x + (quad[2].x - quad[1].x) * t,
          y: quad[1].y + (quad[2].y - quad[1].y) * t,
        };
        ctx.moveTo(front.x, front.y);
        ctx.lineTo(back.x, back.y);
      }
    }
    ctx.strokeStyle = withAlpha(ambience.fill, 0.28);
    ctx.lineWidth = 1;
    ctx.stroke();
  }
};
