
import type { CombatConfig, Player, World } from '../sim/types';
import { powerPickupInReach } from '../sim/pickups';
import type { Camera } from './iso';
import { ISO_X, ISO_Y, groundEllipse, worldToScreen } from './iso';
import { POWER_COLOR, drawPowerObject } from './armoury';
import type { Palette } from './palette';
import type { LayoutFrame } from './layout';
import { drawFloatingLabel } from './text';
import type { DrawOpts } from './draw';
import { TAU, mixHex, sceneTimeMs } from './draw-primitives';

export const drawProjectiles = (
  ctx: CanvasRenderingContext2D,
  world: World,
  cam: Camera,
  opts: DrawOpts,
): void => {
  const pal = opts.pal;
  for (const shot of world.projectiles) {
    const p = worldToScreen(cam, shot.pos);
    if (shot.kind === 'falling') {
      const radius = shot.impactRadius ?? 0;
      const remaining = Math.max(0, shot.lifeMs / Math.max(1, shot.maxLifeMs));
      const urgency = 1 - remaining;
      const ring = groundEllipse(cam, radius);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';

      ctx.strokeStyle = pal.unparryable;
      ctx.lineWidth = 1.5 + urgency * 1.5;
      ctx.globalAlpha = 0.45 + urgency * 0.45;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, ring.rx, ring.ry, 0, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 0.08 + urgency * 0.16;
      ctx.fillStyle = pal.unparryable;
      ctx.fill();
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.ellipse(
        p.x,
        p.y,
        ring.rx * Math.max(0.08, remaining),
        ring.ry * Math.max(0.08, remaining),
        0,
        0,
        TAU,
      );
      ctx.stroke();

      ctx.lineWidth = Math.max(1, (1.1 + urgency * 0.8) * cam.zoom);
      for (let notch = 0; notch < 4; notch += 1) {
        const angle = notch * (TAU / 4) + TAU / 8;
        const outer = {
          x: p.x + Math.cos(angle) * ring.rx,
          y: p.y + Math.sin(angle) * ring.ry,
        };
        const tangent = angle + Math.PI / 2;
        const half = 5 * cam.zoom;
        const tip = {
          x: p.x + Math.cos(angle) * ring.rx * 0.82,
          y: p.y + Math.sin(angle) * ring.ry * 0.82,
        };
        ctx.globalAlpha = 0.36 + urgency * 0.5;
        ctx.beginPath();
        ctx.moveTo(outer.x + Math.cos(tangent) * half, outer.y + Math.sin(tangent) * half);
        ctx.lineTo(tip.x, tip.y);
        ctx.lineTo(outer.x - Math.cos(tangent) * half, outer.y - Math.sin(tangent) * half);
        ctx.stroke();
      }

      const height = 34 + remaining * 120;
      ctx.fillStyle = pal.projectile;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - height - 8);
      ctx.lineTo(p.x + 5, p.y - height);
      ctx.lineTo(p.x, p.y - height + 8);
      ctx.lineTo(p.x - 5, p.y - height);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = pal.unparryable;
      ctx.lineCap = 'round';
      for (let streak = -1; streak <= 1; streak += 1) {
        const x = p.x + streak * 10 * cam.zoom;
        const tail = p.y - height - (12 + (streak + 1) * 7) * cam.zoom;
        const head = p.y - height + (9 - Math.abs(streak) * 2) * cam.zoom;
        ctx.globalAlpha = (0.18 + urgency * 0.42) * (streak === 0 ? 1 : 0.64);
        ctx.lineWidth = Math.max(0.8, (streak === 0 ? 2 : 1.1) * cam.zoom);
        ctx.beginPath();
        ctx.moveTo(x, tail);
        ctx.lineTo(x, head);
        ctx.stroke();
      }
      ctx.restore();
      continue;
    }

    const color = shot.reflected ? pal.projectileReflected : pal.projectile;




    if (shot.shardIntegrity !== undefined) {
      const maxIntegrity = Math.max(1, shot.shardMaxIntegrity ?? 1);
      const spent = Math.max(0, maxIntegrity - shot.shardIntegrity);
      const critical = shot.shardIntegrity <= 0;
      const now = sceneTimeMs(world);

      const lift = 30 * cam.zoom + Math.sin(now / 145 + shot.id) * 2.5 * cam.zoom;
      const air = { x: p.x, y: p.y - lift };
      const shadow = groundEllipse(cam, 0.42);
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = pal.floor;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + 2, shadow.rx, shadow.ry, 0, 0, TAU);
      ctx.fill();

      const trailAt = worldToScreen(cam, {
        x: shot.pos.x - shot.vel.x * 0.055,
        y: shot.pos.y - shot.vel.y * 0.055,
      });
      ctx.globalAlpha = 0.38;
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1.5, 2.6 * cam.zoom);
      ctx.beginPath();
      ctx.moveTo(trailAt.x, trailAt.y - lift);
      ctx.lineTo(air.x, air.y);
      ctx.stroke();
      const half = 0.52 * ISO_X * cam.zoom;
      const wide = half * 0.44;



      const yaw = now / 1180 + shot.id * 2.3;
      const pitch = Math.sin(now / 1870 + shot.id * 1.1) * 0.85;
      const cp = Math.cos(pitch);
      const sp = Math.sin(pitch);
      const project = (x: number, y: number, z: number) => {
        const ry = y * cp - z * sp;
        const rz = y * sp + z * cp;
        return { x, y: ry * (ISO_Y / ISO_X) - rz * 0.34, z: rz };
      };
      const corner = (k: number) => {
        const a = yaw + (k * Math.PI) / 2;
        return project(Math.cos(a) * wide, Math.sin(a) * wide, 0);
      };
      const girdle = [corner(0), corner(1), corner(2), corner(3)];
      const poleUp = project(0, 0, half);
      const poleDown = project(0, 0, -half);
      const at = (c: { x: number; y: number }) => ({ x: air.x + c.x, y: air.y + c.y });
      const top = { x: air.x + poleUp.x, y: air.y + poleUp.y };
      const bottom = { x: air.x + poleDown.x, y: air.y + poleDown.y };
      const face = (points: { x: number; y: number }[], fill: string, alpha: number): void => {
        ctx.globalAlpha = alpha;
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (const q of points.slice(1)) ctx.lineTo(q.x, q.y);
        ctx.closePath();
        ctx.fill();
      };

      const pulse = critical ? 0.55 + 0.45 * Math.sin(now / 110) : 0.3;
      ctx.globalAlpha = pulse * 0.45;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(air.x, air.y, half * 1.6, half * 1.6 * (ISO_Y / ISO_X), 0, 0, TAU);
      ctx.fill();

      const faces: { pts: { x: number; y: number }[]; depth: number; lit: number }[] = [];
      for (let k = 0; k < 4; k++) {
        const a = girdle[k];
        const b = girdle[(k + 1) % 4];
        const depth = (a.z + b.z) / 2;
        const lit = 0.5 - (a.x + b.x) / (4 * wide) + depth * 0.18;
        faces.push({ pts: [top, at(a), at(b)], depth: (depth + poleUp.z) / 2, lit: lit + 0.18 });
        faces.push({ pts: [bottom, at(a), at(b)], depth: (depth + poleDown.z) / 2, lit: lit - 0.16 });
      }
      faces.sort((f, g) => f.depth - g.depth);
      for (const f of faces) {
        face(f.pts, color, 1);
        const shade = Math.max(0, Math.min(1, f.lit));
        if (shade > 0.5) face(f.pts, pal.hudText, (shade - 0.5) * 0.9);
        else face(f.pts, '#000', (0.5 - shade) * 0.8);
      }

      if (spent > 0) {
        ctx.globalAlpha = 0.95;
        ctx.strokeStyle = pal.hudText;
        ctx.lineWidth = Math.max(1, half * 0.085);
        ctx.lineCap = 'round';
        for (let i = 0; i < spent; i++) {
          const a = girdle[(i + shot.id) % 4];
          const b = girdle[(i + shot.id + 1) % 4];
          const pole = i % 2 === 0 ? top : bottom;
          const t = 0.34 + ((i * 3 + shot.id) % 3) * 0.16;
          const from = { x: air.x + a.x, y: air.y + a.y };
          const to = { x: pole.x + b.x * (1 - t), y: pole.y + (b.y - (pole.y - air.y)) * (1 - t) };
          ctx.beginPath();
          ctx.moveTo(from.x, from.y);
          ctx.lineTo(to.x, to.y);
          ctx.stroke();
        }
        ctx.lineCap = 'butt';
      }

      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = pal.hudText;
      ctx.lineWidth = Math.max(1, half * 0.06);
      ctx.beginPath();
      for (let k = 0; k < 4; k++) {
        const c = at(girdle[k]);
        if (k === 0) ctx.moveTo(c.x, c.y);
        else ctx.lineTo(c.x, c.y);
      }
      ctx.closePath();
      ctx.stroke();

      ctx.globalAlpha = 1;
      continue;
    }



    if (shot.hazard === true) {
      const spin = sceneTimeMs(world) / 420 + shot.id * 1.7;
      const long = 0.62 * ISO_X * cam.zoom;
      const short = long * 0.6;
      const thick = Math.max(2, long * 0.2);
      const cs = Math.cos(spin);
      const sn = Math.sin(spin);
      const at = (dx: number, dy: number, lift = 0) => ({
        x: p.x + dx * cs - dy * sn,
        y: p.y + (dx * sn + dy * cs) * (ISO_Y / ISO_X) - lift,
      });
      const quad = (points: { x: number; y: number }[]): void => {
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (const point of points.slice(1)) ctx.lineTo(point.x, point.y);
        ctx.closePath();
        ctx.fill();
      };
      const ground = groundEllipse(cam, 0.3);
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = pal.floor;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + thick * 0.35, ground.rx, ground.ry, 0, 0, TAU);
      ctx.fill();

      ctx.globalAlpha = 1;
      ctx.fillStyle = mixHex(color, pal.floor, 0.45);
      quad([at(-long, -short), at(long, -short), at(long, short), at(-long, short)]);
      ctx.fillStyle = pal.hudText;
      quad([
        at(-long * 0.94, short * 0.94),
        at(long * 0.94, short * 0.94),
        at(long * 0.94, short * 0.94, thick),
        at(-long * 0.94, short * 0.94, thick),
      ]);
      ctx.fillStyle = mixHex(pal.hudText, pal.floor, 0.3);
      quad([
        at(long * 0.94, -short * 0.94),
        at(long * 0.94, short * 0.94),
        at(long * 0.94, short * 0.94, thick),
        at(long * 0.94, -short * 0.94, thick),
      ]);
      ctx.fillStyle = color;
      quad([
        at(-long, -short, thick),
        at(long, -short, thick),
        at(long, short, thick),
        at(-long, short, thick),
      ]);
      ctx.strokeStyle = mixHex(color, pal.floor, 0.62);
      ctx.lineWidth = Math.max(1.2, cam.zoom * 1.6);
      const spineA = at(0, -short, thick);
      const spineB = at(0, short, thick);
      ctx.beginPath();
      ctx.moveTo(spineA.x, spineA.y);
      ctx.lineTo(spineB.x, spineB.y);
      ctx.stroke();
      continue;
    }

    const tail = worldToScreen(cam, {
      x: shot.pos.x - shot.vel.x * 0.04,
      y: shot.pos.y - shot.vel.y * 0.04,
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(tail.x, tail.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, TAU);
    ctx.fill();
  }
};


export const drawPickup = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  pickup: World['pickups'][number],
  opts: DrawOpts,
): void => {
  const pal = opts.pal;
  const remaining = pickup.lifeMs / Math.max(1, pickup.totalLifeMs);
  const expiring = remaining < 0.25;
  const blink = expiring
    ? 0.35 + 0.65 * Math.abs(Math.sin((1 - remaining) * 34 + pickup.id))
    : 1;

  const offered = pickup.offers;
  const color =
    pickup.kind === 'health'
      ? pal.danger
      : pickup.kind === 'stamina'
        ? pal.stamina
        : offered === undefined
          ? pal.lightning
          : POWER_COLOR[offered];
  const at = worldToScreen(cam, pickup.pos);
  const bob = Math.sin(pickup.lifeMs / 220 + pickup.id) * 3 * cam.zoom;
  const r = 7 * cam.zoom;

  ctx.save();
  const ellipse = groundEllipse(cam, 0.3);
  ctx.globalAlpha = 0.3 * blink;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(at.x, at.y, ellipse.rx, ellipse.ry, 0, 0, TAU);
  ctx.fill();

  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.5 * blink;
  const glow = ctx.createRadialGradient(at.x, at.y - r - bob, 0, at.x, at.y - r - bob, r * 3);
  glow.addColorStop(0, color);
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(at.x, at.y - r - bob, r * 3, 0, TAU);
  ctx.fill();

  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = blink;
  ctx.fillStyle = color;
  ctx.strokeStyle = pal.hudText;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  if (pickup.kind === 'health') {
    const arm = r * 0.36;
    ctx.rect(at.x - arm, at.y - r - bob - r * 0.9, arm * 2, r * 1.8);
    ctx.rect(at.x - r * 0.9, at.y - r - bob - arm, r * 1.8, arm * 2);
  } else if (pickup.kind === 'stamina') {
    const cy = at.y - r - bob;
    ctx.moveTo(at.x + r * 0.15, cy - r);
    ctx.lineTo(at.x - r * 0.55, cy + r * 0.1);
    ctx.lineTo(at.x - r * 0.05, cy + r * 0.1);
    ctx.lineTo(at.x - r * 0.15, cy + r);
    ctx.lineTo(at.x + r * 0.55, cy - r * 0.1);
    ctx.lineTo(at.x + r * 0.05, cy - r * 0.1);
    ctx.closePath();
  } else if (offered !== undefined) {
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = blink;
    ctx.fillStyle = pal.floor;
    ctx.strokeStyle = pal.playerAccent;
    ctx.lineWidth = Math.max(0.8, cam.zoom);
    ctx.beginPath();
    ctx.moveTo(at.x, at.y - bob - 5 * cam.zoom);
    ctx.lineTo(at.x + 7 * cam.zoom, at.y - bob - 2 * cam.zoom);
    ctx.lineTo(at.x, at.y - bob + cam.zoom);
    ctx.lineTo(at.x - 7 * cam.zoom, at.y - bob - 2 * cam.zoom);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    drawPowerObject(
      ctx,
      offered,
      { x: at.x, y: at.y - bob },
      0.31 * cam.zoom,
      pal,
      blink,
      0.9 + 0.1 * Math.sin(pickup.lifeMs / 180 + pickup.id),
    );
    return;
  } else {
    const cy = at.y - r - bob;
    ctx.moveTo(at.x, cy - r);
    ctx.lineTo(at.x + r * 0.34, cy - r * 0.34);
    ctx.lineTo(at.x + r, cy);
    ctx.lineTo(at.x + r * 0.34, cy + r * 0.34);
    ctx.lineTo(at.x, cy + r);
    ctx.lineTo(at.x - r * 0.34, cy + r * 0.34);
    ctx.lineTo(at.x - r, cy);
    ctx.lineTo(at.x - r * 0.34, cy - r * 0.34);
    ctx.closePath();
  }
  ctx.fill();
  ctx.stroke();
  ctx.restore();
};

export const drawPickupPrompt = (
  ctx: CanvasRenderingContext2D,
  world: World,
  cam: Camera,
  pal: Palette,
  frame: LayoutFrame,
  cfg: CombatConfig,
  king: Player,
  interact: string,
): void => {
  const pickup = powerPickupInReach(world, cfg, king);
  if (pickup === null) return;
  const p = worldToScreen(cam, pickup.pos);
  const type = frame.type;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = `${Math.max(type.base, type.base * cam.zoom)}px ui-monospace, monospace`;
  ctx.fillStyle = pal.playerAccent;
  drawFloatingLabel(
    ctx,
    'pickup.power.prompt',
    `${interact}  SWITCH POWER`,
    frame.content,
    p.x,
    p.y - 36 * cam.zoom,
  );
  ctx.restore();
};
