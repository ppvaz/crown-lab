
import type { Vec2 } from '../../sim/types';
import type { RoomTheme } from './theme';
import { lineOnGround, polygonOnGround, ringOnGround } from './theme';
import { worldToScreen } from '../iso';

export const FIRST_BLADE_ROOM: RoomTheme = {
  props: [
    { kind: 'gate', at: (h: Vec2) => ({ x: 0, y: -h.y - 0.72 }), variant: 0 },
    { kind: 'torn_banner', at: (h: Vec2) => ({ x: -3.7, y: -h.y - 0.58 }), variant: 0 },
    { kind: 'torn_banner', at: (h: Vec2) => ({ x: 3.1, y: -h.y - 0.58 }), variant: 1 },
    { kind: 'weapon_rack', at: (h: Vec2) => ({ x: -h.x - 0.58, y: -1.8 }), variant: 0 },
    { kind: 'weapon_rack', at: (h: Vec2) => ({ x: h.x + 0.58, y: 1.3 }), variant: 1 },
    { kind: 'ceremonial_brazier', at: (h: Vec2) => ({ x: -h.x - 0.62, y: -h.y - 0.62 }), variant: 0 },
    { kind: 'ceremonial_brazier', at: (h: Vec2) => ({ x: h.x + 0.62, y: -h.y - 0.62 }), variant: 1 },
    { kind: 'ceremonial_brazier', at: (h: Vec2) => ({ x: -h.x - 0.62, y: h.y + 0.62 }), variant: 2 },
    { kind: 'ceremonial_brazier', at: (h: Vec2) => ({ x: h.x + 0.62, y: h.y + 0.62 }), variant: 3 },
  ],


  foundation: (ctx, world, cam, pal) => {
    const h = world.arena.halfExtents;
    const corners = [
      { x: -h.x, y: -h.y },
      { x: h.x, y: -h.y },
      { x: h.x, y: h.y },
      { x: -h.x, y: h.y },
    ].map((point) => worldToScreen(cam, point));
    const drop = Math.max(9, 17 * cam.zoom);

    ctx.save();
    ctx.fillStyle = pal.wall;
    ctx.strokeStyle = pal.floorGrid;
    ctx.lineWidth = 1;

    for (const [a, b] of [
      [corners[1], corners[2]],
      [corners[2], corners[3]],
    ]) {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(b.x, b.y + drop);
      ctx.lineTo(a.x, a.y + drop);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    polygonOnGround(ctx, cam, [
      { x: -2.45, y: -h.y },
      { x: 2.45, y: -h.y },
      { x: 2.15, y: -h.y - 1.42 },
      { x: -2.15, y: -h.y - 1.42 },
    ]);
    ctx.fillStyle = pal.floor;
    ctx.fill();
    ctx.strokeStyle = pal.wall;
    ctx.lineWidth = 3;
    ctx.stroke();
    for (const y of [-h.y - 0.48, -h.y - 0.92]) {
      lineOnGround(ctx, cam, [
        { x: -2.3, y },
        { x: 2.3, y },
      ]);
      ctx.stroke();
    }
    ctx.restore();
  },

  markings: (ctx, cam, h, pal) => {
    const accent = pal.firstBlade;
    ctx.save();

    polygonOnGround(ctx, cam, [
      { x: -0.72, y: -h.y },
      { x: 0.72, y: -h.y },
      { x: 0.52, y: -2.8 },
      { x: -0.52, y: -2.8 },
    ]);
    ctx.fillStyle = accent;
    ctx.globalAlpha = 0.08;
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.globalAlpha = 0.2;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.strokeStyle = pal.wall;
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.8;
    for (const inset of [0.48, 0.78]) {
      polygonOnGround(ctx, cam, [
        { x: -h.x + inset, y: -h.y + inset },
        { x: h.x - inset, y: -h.y + inset },
        { x: h.x - inset, y: h.y - inset },
        { x: -h.x + inset, y: h.y - inset },
      ]);
      ctx.stroke();
    }

    ctx.globalAlpha = 0.28;
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ringOnGround(ctx, cam, { x: 0, y: 0 }, 2.35);
    ctx.stroke();

    for (const [from, to] of [
      [{ x: -2.25, y: -0.38 }, { x: 2.25, y: 0.38 }],
      [{ x: -0.38, y: 2.25 }, { x: 0.38, y: -2.25 }],
    ]) {
      lineOnGround(ctx, cam, [from, to]);
      ctx.stroke();
    }
    ctx.fillStyle = accent;
    ctx.globalAlpha = 0.18;
    ringOnGround(ctx, cam, { x: 0, y: 0 }, 0.34);
    ctx.fill();

    ctx.strokeStyle = pal.floorGrid;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.72;
    for (const scar of [
      [{ x: -7.9, y: -2.8 }, { x: -6.2, y: -2.15 }, { x: -5.1, y: -2.3 }],
      [{ x: 5.7, y: -4.8 }, { x: 7.4, y: -4.1 }],
      [{ x: 6.1, y: 3.4 }, { x: 7.8, y: 2.7 }, { x: 8.5, y: 2.9 }],
      [{ x: -6.8, y: 4.2 }, { x: -5.5, y: 3.35 }],
      [{ x: -1.9, y: -5.55 }, { x: -0.85, y: -5.2 }],
    ]) {
      lineOnGround(ctx, cam, scar);
      ctx.stroke();
    }

    ctx.restore();
  },

  accent: (pal, world) =>
    world.enemies.some((enemy) => enemy.archetype === 'first_blade' && enemy.phase === 2)
      ? pal.danger
      : pal.firstBlade,

  viewMargin: 125,
};
