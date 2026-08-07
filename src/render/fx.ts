
import type { EntityId, Player, SimEvent, Vec2, World } from '../sim/types';
import type { Palette } from './palette';
import type { ArchetypeColor } from './palette';
import { PALETTE, publicArchetypeColor } from './palette';
import type { ResolvedPresentation } from '../lab/presentation';
import type { Camera } from './iso';
import { groundEllipse, worldToScreen } from './iso';
import { drawBlinkTrail, drawPullHooks, drawPushWave } from './power-fx';
import {
  APOTHEOSIS_OFF,
  type ApotheosisConfig,
} from './apotheosis/config';
import { drawCinematicImpactStars } from './apotheosis/render';

interface Flash {
  at: Vec2;
  color: string;
  radius: number;
  ageMs: number;
  lifeMs: number;
  kind: ImpactKind;
  facing: number;
}

type ImpactKind =
  | 'pulse'
  | 'light_hit'
  | 'heavy_hit'
  | 'guard'
  | 'parry'
  | 'guard_break'
  | 'damage'
  | 'stagger'
  | 'defeat'
  | 'roar'
  | 'projectile'
  | 'power';

interface Spark {
  at: Vec2;
  vel: Vec2;
  color: string;
  ageMs: number;
  lifeMs: number;
}

interface Cone {
  at: Vec2;
  power: string;
  from: Vec2;
  facing: number;
  range: number;
  arcDeg: number;
  color: string;
  ageMs: number;
  sweepMs: number;
  lifeMs: number;
}

interface Bolt {
  from: Vec2;
  to: Vec2;
  color: string;
  ageMs: number;
  lifeMs: number;
}

const mix = (a: string, b: string, t: number): string => {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const k = Math.max(0, Math.min(1, t));
  const ch = (shift: number): number => {
    const ca = (pa >> shift) & 255;
    const cb = (pb >> shift) & 255;
    return Math.round(ca + (cb - ca) * k);
  };
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
};

let sparkSeed = 0x2f6e2b1;
const jitter = (): number => {
  sparkSeed = (sparkSeed * 1664525 + 1013904223) >>> 0;
  return sparkSeed / 4294967296;
};

export class FxLayer {
  private flashes: Flash[] = [];
  private sparks: Spark[] = [];
  private cones: Cone[] = [];
  private bolts: Bolt[] = [];
  private shakeMs = 0;
  private shakeAmp = 0;
  private lastStrain = 0;
  private lastOvercast = false;
  private pal: Palette = { ...PALETTE };
  private archetypeColor: ArchetypeColor = publicArchetypeColor;
  private pres: ResolvedPresentation | null = null;
  private apotheosis: ApotheosisConfig = APOTHEOSIS_OFF;

  configure(
    pres: ResolvedPresentation,
    pal: Palette,
    apotheosis: ApotheosisConfig,
    archetypeColor?: ArchetypeColor,
  ): void {
    this.pres = pres;
    this.pal = pal;
    this.apotheosis = apotheosis;
    if (archetypeColor !== undefined) this.archetypeColor = archetypeColor;
  }

  private get particles(): number {
    return this.pres?.visual.particleDensity ?? 1;
  }

  private get screen(): number {
    return this.pres?.visual.screenEffects ?? 1;
  }

  private get camera(): number {
    return this.pres?.visual.cameraEffects ?? 1;
  }

  private powerColor(power: string, strain = 0, overcast = false): string {
    if (power === 'pull') return this.pal.stagger;
    if (power === 'push') return this.pal.danger;
    if (power === 'freeze') return '#78e7ff';
    if (power === 'incinerate') return '#ff7a35';
    if (power === 'turncoat') return '#c47aff';
    if (power === 'blink') return this.pal.parryFlash;
    if (power !== 'lightning') return this.pal.hit;
    if (overcast) return this.pal.lightningOvercast;
    const t = Math.max(0, Math.min(1, strain));
    return t <= 0.5
      ? mix(this.pal.lightning, this.pal.lightningStrained, t / 0.5)
      : mix(this.pal.lightningStrained, this.pal.lightningOvercast, (t - 0.5) / 0.5);
  }

  reset(): void {
    this.flashes = [];
    this.sparks = [];
    this.cones = [];
    this.bolts = [];
    this.shakeMs = 0;
    this.shakeAmp = 0;
  }

  consume(events: readonly SimEvent[], world: World): void {
    const kingOf = (actor: EntityId | undefined): Player =>
      world.players.find((player) => player.id === actor) ?? world.players[0];
    for (const ev of events) {
      const king = kingOf('actor' in ev ? ev.actor : undefined);
      if (__CROWN_LAB__) {
        switch (ev.type) {
          case 'volley_served': {
            const id = Number(ev.data?.projectile ?? -1);
            const shard = world.projectiles.find((shot) => shot.id === id);
            if (shard !== undefined) {
              this.flash(shard.pos, this.pal.projectile, 0.65, 150);
              this.burst(shard.pos, this.pal.projectile, 5);
            }
            continue;
          }
          case 'volley_returned': {
            const id = Number(ev.data?.projectile ?? -1);
            const shard = world.projectiles.find((shot) => shot.id === id);
            if (shard !== undefined) {
              this.flash(shard.pos, this.pal.projectileReflected, 0.5, 120);
              this.burst(shard.pos, this.pal.projectileReflected, 4);
            }
            continue;
          }
          case 'volley_shattered': {
            const at = {
              x: Number(ev.data?.x ?? 0),
              y: Number(ev.data?.y ?? 0),
            };
            const onEnemy = ev.data?.on === 'enemy';
            this.flash(
              at,
              onEnemy ? this.pal.stagger : this.pal.danger,
              2.1,
              360,
              onEnemy ? 'stagger' : 'damage',
            );
            this.burst(at, this.pal.hudText, 26);
            this.shake(onEnemy ? 9 : 7, 300);
            continue;
          }
          case 'volley_ward_pushed':
            this.flash(king.pos, this.pal.projectile, 1.25, 220);
            this.shake(ev.data?.teaching === 1 ? 5 : 2.5, 160);
            continue;
          default:
            break;
        }
      }
      switch (ev.type) {
        case 'boss_intro_landed': {
          const subject = world.enemies.find((e) => e.id === ev.actor);
          if (subject !== undefined) {
            const color = this.archetypeColor(subject.archetype);
            this.flash(subject.pos, color, 2.2, 360, 'heavy_hit', subject.facing);
            this.burst(subject.pos, color, 18);
          }
          this.shake(9, 320);
          break;
        }
        case 'boss_fight_started': {
          const subject = world.enemies.find((e) => e.id === ev.actor);
          if (subject !== undefined) {
            this.flash(subject.pos, this.pal.telegraph, 2.8, 420, 'roar', subject.facing);
          }
          this.shake(5, 220);
          break;
        }
        case 'boss_phase_roar_started': {
          const subject = world.enemies.find((e) => e.id === ev.actor);
          if (subject !== undefined) {
            const color = this.archetypeColor(subject.archetype);
            this.flash(subject.pos, color, 3.1, 520, 'roar', subject.facing);
            this.burst(subject.pos, color, 24);
          }
          this.shake(8, 360);
          break;
        }
        case 'parry_success': {
          this.flash(king.pos, this.pal.parryFlash, 1.6, 260, 'parry', king.facing);
          this.burst(king.pos, this.pal.parryFlash, 14);
          this.shake(7, 240);
          break;
        }
        case 'hit_landed': {
          const target = world.enemies.find((e) => e.id === ev.target);
          const at = target ? target.pos : king.pos;
          const heavy = ev.data?.attack === 'heavy';
          this.flash(
            at,
            this.pal.hit,
            heavy ? 1.25 : 0.9,
            heavy ? 210 : 150,
            heavy ? 'heavy_hit' : 'light_hit',
            king.facing,
          );
          this.burst(at, this.pal.hit, heavy ? 12 : 6, king.facing, heavy ? 0.9 : 0.62);
          this.shake(heavy ? 7 : 3.5, heavy ? 220 : 140);
          break;
        }
        case 'hit_received':
        case 'guard_broken': {
          const source = __CROWN_LAB__
            ? world.enemies.find((e) => e.id === ev.actor)
            : undefined;
          if (source?.archetype === 'chancellor' && ev.data?.attackId === 'rain_focus') {
            this.bolts.push({
              from: { ...source.pos },
              to: { ...king.pos },
              color: this.pal.lightning,
              ageMs: 0,
              lifeMs: 220,
            });
            this.flash(king.pos, this.pal.lightning, 1.3, 240, 'damage', king.facing);
            this.burst(king.pos, this.pal.lightning, 10);
            this.shake(6, 220);
            break;
          }
          this.flash(
            king.pos,
            this.pal.danger,
            1.3,
            240,
            ev.type === 'guard_broken' ? 'guard_break' : 'damage',
            king.facing,
          );
          this.burst(king.pos, this.pal.danger, 10);
          this.shake(ev.type === 'guard_broken' ? 8.5 : 6, ev.type === 'guard_broken' ? 300 : 220);
          break;
        }
        case 'guard_success': {
          this.flash(king.pos, this.pal.hudText, 1.0, 160, 'guard', king.facing);
          this.shake(3, 120);
          break;
        }
        case 'enemy_blocked': {
          const e = world.enemies.find((x) => x.id === ev.target);
          if (e) {
            this.flash(e.pos, this.pal.hudText, 1.1, 200, 'guard', e.facing);
            this.burst(e.pos, this.pal.hudText, 6);
            this.shake(2.5, 100);
          }
          break;
        }
        case 'enemy_parried': {
          const e = world.enemies.find((x) => x.id === ev.actor);
          if (e) {
            this.flash(e.pos, this.pal.parryFlash, 1.4, 260, 'parry', e.facing);
            this.burst(e.pos, this.pal.parryFlash, 12);
            this.shake(6, 220);
          }
          break;
        }
        case 'enemy_summoned': {
          const e = world.enemies.find((x) => x.id === ev.actor);
          if (e) {
            this.flash(e.pos, this.pal.danger, 1.6, 340, 'roar', e.facing);
            this.burst(e.pos, this.pal.danger, 14);
            this.shake(4.5, 220);
          }
          break;
        }
        case 'enemy_staggered': {
          const e = world.enemies.find((x) => x.id === ev.actor);
          if (e) this.flash(e.pos, this.pal.stagger, 1.4, 320, 'stagger', e.facing);
          break;
        }
        case 'enemy_died': {
          const e = world.enemies.find((x) => x.id === ev.actor);
          if (e) {
            this.flash(e.pos, this.pal.stagger, 1.8, 420, 'defeat', e.facing);
            this.burst(e.pos, this.pal.stagger, 18);
          }
          this.shake(3.5, 200);
          break;
        }
        case 'projectile_reflected': {
          this.flash(
            king.pos,
            this.pal.projectileReflected,
            1.2,
            220,
            'projectile',
            king.facing,
          );
          this.burst(king.pos, this.pal.projectileReflected, 10);
          break;
        }
        case 'projectile_impact': {
          const at = {
            x: Number(ev.data?.x ?? 0),
            y: Number(ev.data?.y ?? 0),
          };
          this.flash(at, this.pal.unparryable, 0.75, 170, 'projectile');
          this.burst(at, this.pal.projectile, 5);
          this.shake(ev.data?.outcome === 'miss' ? 1.2 : 3, 110);
          break;
        }
        case 'power_used': {
          const power = String(ev.data?.power ?? '');
          this.lastStrain = Number(ev.data?.strain ?? 0);
          this.lastOvercast = ev.data?.overcast === true;
          const range = Number(ev.data?.range ?? 0);
          if (range > 0 || power === 'blink') {
            const facing = Number(ev.data?.facing ?? 0);
            const offset = Number(ev.data?.originOffset ?? 0);
            this.cones.push({
              at: {
                x: king.pos.x + Math.cos(facing) * offset,
                y: king.pos.y + Math.sin(facing) * offset,
              },
              power,
              from: {
                x: Number(ev.data?.fromX ?? king.pos.x),
                y: Number(ev.data?.fromY ?? king.pos.y),
              },
              facing,
              range,
              arcDeg: Number(ev.data?.arcDeg ?? 60),
              color: this.powerColor(
                power,
                Number(ev.data?.strain ?? 0),
                ev.data?.overcast === true,
              ),
              ageMs: 0,
              sweepMs: Math.max(1, Number(ev.data?.sweepMs ?? 100)),
              lifeMs: Math.max(1, Number(ev.data?.sweepMs ?? 100)) + 170,
            });
          }
          if (power === 'lightning') {
            const facing = Number(ev.data?.facing ?? 0);
            const color = this.powerColor(power, this.lastStrain, this.lastOvercast);
            this.flash(king.pos, color, 1.1, 190, 'power', facing);
            this.burst(king.pos, color, 22, facing, 0.7);
          }
          this.shake(power === 'lightning' ? 4 : 2.5, 160);
          break;
        }
        case 'power_overcast': {
          this.flash(
            king.pos,
            this.pal.lightningOvercast,
            1.5,
            300,
            'damage',
            king.facing,
          );
          this.burst(king.pos, this.pal.lightningOvercast, 14);
          this.shake(7, 240);
          break;
        }
        case 'power_hit': {
          const target = world.enemies.find((e) => e.id === ev.target);
          if (target !== undefined) {
            const color = this.powerColor(String(ev.data?.power ?? ''), this.lastStrain, this.lastOvercast);
            if (ev.data?.power === 'lightning') {
              this.bolts.push({
                from: { ...king.pos },
                to: { ...target.pos },
                color,
                ageMs: 0,
                lifeMs: 220,
              });
            }
            this.flash(target.pos, color, 1.0, 200, 'power', king.facing);
            this.burst(target.pos, color, 10);
          }
          break;
        }
        default:
          break;
      }
    }
  }

  update(dtMs: number): void {
    for (const f of this.flashes) f.ageMs += dtMs;
    this.flashes = this.flashes.filter((f) => f.ageMs < f.lifeMs);

    const dtSec = dtMs / 1000;
    for (const s of this.sparks) {
      s.ageMs += dtMs;
      s.at = { x: s.at.x + s.vel.x * dtSec, y: s.at.y + s.vel.y * dtSec };
      s.vel = { x: s.vel.x * 0.92, y: s.vel.y * 0.92 };
    }
    this.sparks = this.sparks.filter((s) => s.ageMs < s.lifeMs);

    for (const c of this.cones) c.ageMs += dtMs;
    this.cones = this.cones.filter((c) => c.ageMs < c.lifeMs);
    for (const b of this.bolts) b.ageMs += dtMs;
    this.bolts = this.bolts.filter((b) => b.ageMs < b.lifeMs);

    this.shakeMs = Math.max(0, this.shakeMs - dtMs);
  }

  applyShake(cam: Camera): void {
    if (this.shakeMs <= 0) {
      cam.shake = { x: 0, y: 0 };
      return;
    }
    const k = this.shakeMs / 140;
    const amp = this.shakeAmp * Math.min(1, k);
    cam.shake = { x: (jitter() * 2 - 1) * amp, y: (jitter() * 2 - 1) * amp * 0.6 };
  }

  drawGround(ctx: CanvasRenderingContext2D, cam: Camera, world: World): void {
    for (const c of this.cones) {
      const grow = Math.min(1, c.ageMs / c.sweepMs);
      const reach = c.range * (1 - (1 - grow) * (1 - grow));
      const fade = 1 - Math.max(0, (c.ageMs - c.sweepMs) / (c.lifeMs - c.sweepMs));

      const half = ((c.arcDeg * Math.PI) / 180) / 2;
      const steps = Math.max(8, Math.round(c.arcDeg / 5));
      const o = worldToScreen(cam, c.at);
      ctx.beginPath();
      ctx.moveTo(o.x, o.y);
      for (let i = 0; i <= steps; i++) {
        const a = c.facing - half + (i / steps) * half * 2;
        const p = worldToScreen(cam, {
          x: c.at.x + Math.cos(a) * reach,
          y: c.at.y + Math.sin(a) * reach,
        });
        ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();


      ctx.globalAlpha = 0.12 * fade;
      ctx.fillStyle = c.color;
      ctx.fill();
      ctx.globalAlpha = 0.4 * fade;
      ctx.strokeStyle = c.color;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.globalAlpha = 1;

      const t = 1 - fade;
      if (c.power === 'push') {
        drawPushWave(ctx, cam, c.at, reach, c.color, t);
      } else if (c.power === 'pull') {
        for (const enemy of world.enemies) {
          if (enemy.state.kind === 'dead') continue;
          const dx = enemy.pos.x - c.at.x;
          const dy = enemy.pos.y - c.at.y;
          if (Math.hypot(dx, dy) > c.range) continue;
          drawPullHooks(ctx, cam, c.from, enemy.pos, c.color, t);
        }
      } else if (c.power === 'blink') {
        drawBlinkTrail(ctx, cam, c.from, c.at, c.color, t);
      }
    }

    for (const f of this.flashes) {
      const t = f.ageMs / f.lifeMs;
      const p = worldToScreen(cam, f.at);
      const expand = f.kind === 'roar' ? 1.3 : f.kind === 'guard' ? 0.72 : 1;
      const { rx, ry } = groundEllipse(cam, f.radius * (0.4 + t * 0.9) * expand);
      ctx.save();
      ctx.globalAlpha = (1 - t) * (f.kind === 'guard' ? 0.32 : 0.55);
      ctx.strokeStyle = f.color;
      ctx.lineWidth =
        f.kind === 'parry' ? 2.4 : f.kind === 'guard_break' || f.kind === 'roar' ? 2.2 : 2;
      if (f.kind === 'guard_break' || f.kind === 'damage' || f.kind === 'stagger') {
        ctx.setLineDash([Math.max(3, rx * 0.16), Math.max(2, rx * 0.08)]);
      }
      ctx.beginPath();
      if (f.kind === 'guard') {
        const forward = worldToScreen(cam, {
          x: f.at.x + Math.cos(f.facing),
          y: f.at.y + Math.sin(f.facing),
        });
        const angle = Math.atan2(forward.y - p.y, forward.x - p.x);
        ctx.ellipse(p.x, p.y, rx, ry, 0, angle - Math.PI * 0.58, angle + Math.PI * 0.58);
      } else {
        ctx.ellipse(p.x, p.y, rx, ry, 0, 0, Math.PI * 2);
      }
      ctx.stroke();
      if (f.kind === 'parry') {
        ctx.globalAlpha *= 0.42;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, rx * 1.24, ry * 1.24, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    ctx.globalAlpha = 1;
  }

  drawAir(ctx: CanvasRenderingContext2D, cam: Camera): void {
    if (this.apotheosis.combatFx) {
      drawCinematicImpactStars(ctx, cam, this.flashes);
    }

    for (const b of this.bolts) {
      const t = b.ageMs / b.lifeMs;
      const from = worldToScreen(cam, b.from);
      const to = worldToScreen(cam, b.to);
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = b.color;
      ctx.lineWidth = 3 * (1 - t) + 1;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y - 18);
      const midX = (from.x + to.x) / 2;
      const midY = (from.y + to.y) / 2 - 12;
      const nudge = ((to.x - from.x) * 0.08 + (to.y - from.y) * 0.05) % 14;
      ctx.lineTo(midX + nudge, midY - nudge * 0.6);
      ctx.lineTo(to.x, to.y - 14);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;



    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const s of this.sparks) {
      const t = s.ageMs / s.lifeMs;
      const head = worldToScreen(cam, s.at);
      const tail = worldToScreen(cam, {
        x: s.at.x - s.vel.x * 0.03,
        y: s.at.y - s.vel.y * 0.03,
      });
      const fade = (1 - t) * (1 - t);
      ctx.globalAlpha = fade;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = Math.max(0.7, 2.4 * fade);
      ctx.beginPath();
      ctx.moveTo(tail.x, tail.y);
      ctx.lineTo(head.x, head.y);
      ctx.stroke();
    }
    ctx.restore();

    ctx.globalAlpha = 1;
  }

  private flash(
    at: Vec2,
    color: string,
    radius: number,
    lifeMs: number,
    kind: ImpactKind = 'pulse',
    facing = 0,
  ): void {
    if (this.screen <= 0) return;
    this.flashes.push({
      at: { ...at },
      color,
      radius,
      ageMs: 0,
      lifeMs: lifeMs * this.screen,
      kind,
      facing,
    });
  }

  private burst(
    at: Vec2,
    color: string,
    count: number,
    facing?: number,
    spread = Math.PI,
  ): void {
    const n = Math.round(count * this.particles);
    for (let i = 0; i < n; i++) {
      const a =
        facing === undefined
          ? jitter() * Math.PI * 2
          : facing + (jitter() - 0.5) * 2 * spread;
      const roll = jitter();
      const speed = 1.2 + roll * roll * 7;
      this.sparks.push({
        at: { ...at },
        vel: { x: Math.cos(a) * speed, y: Math.sin(a) * speed },
        color,
        ageMs: 0,
        lifeMs: 220 + jitter() * 340,
      });
    }
  }

  private shake(amp: number, ms: number): void {
    const scaled = amp * this.camera;
    if (scaled <= 0) return;
    this.shakeAmp = Math.max(this.shakeAmp * (this.shakeMs > 0 ? 1 : 0), scaled);
    this.shakeMs = Math.max(this.shakeMs, ms);
  }
}
