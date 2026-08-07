
import type {
  CombatConfig,
  EncounterDef,
  EntityId,
  Intent,
  Ms,
  SlowMoConfig,
  World,
} from './types';
import { NEUTRAL_INTENT, TICK_MS } from './types';
import { add, dist, norm, scale, sub } from './vec';
import { stepPlayer } from './player';
import { stepPowers } from './powers';
import { stepEnemy } from './enemy';
import { stepProjectiles } from './projectile';
import { stepPickups } from './pickups';
import { stepEncounter } from './encounter';
import { currentScales, stepSlowMo } from './slowmo';
import { clampArenaMovement } from './arena';
import { stepCompanion } from './companion';
import { stepEnemyStatuses } from './status';
import { cos, sin } from './trig';

const PLAYER_PUSH_SHARE = 0.25;

const EMPTY_FROZEN: ReadonlySet<EntityId> = new Set<EntityId>();

const separate = (world: World, cfg: CombatConfig): void => {
  const pr = cfg.player.radius;
  const playersBefore = new Map(world.players.map((p) => [p.id, { ...p.pos }]));
  const movedPlayers = new Set<EntityId>();
  const enemiesBefore = new Map(
    world.enemies.map((enemy) => [enemy.id, { ...enemy.pos }]),
  );
  const movedEnemies = new Set<number>();
  const companionBefore =
    world.companion === null ? null : { ...world.companion.pos };
  let companionMoved = false;

  const companion = world.companion;
  for (const p of world.players) {
    if (companion !== null && companion.state !== 'downed') {
      const d = dist(p.pos, companion.pos);
      const overlap = pr + companion.radius - d;
      if (overlap > 0) {
        const axis =
          d > 0
            ? norm(sub(companion.pos, p.pos))
            : { x: cos(p.facing), y: sin(p.facing) };
        companion.pos = add(companion.pos, scale(axis, overlap));
        companionMoved = true;
      }
    }

    const stepping = p.state.kind === 'step';

    for (const e of world.enemies) {
      if (e.state.kind === 'dead') continue;
      if (stepping) continue;
      const attack = cfg.enemies[e.archetype].attacks[e.state.attackIndex];
      if (e.state.kind === 'attack' && attack?.traversesArena) {
        continue;
      }
      const er = cfg.enemies[e.archetype].radius;
      const d = dist(p.pos, e.pos);
      const overlap = pr + er - d;
      if (overlap <= 0) continue;
      const axis =
        d > 0 ? norm(sub(e.pos, p.pos)) : { x: cos(e.facing), y: sin(e.facing) };
      p.pos = add(p.pos, scale(axis, -overlap * PLAYER_PUSH_SHARE));
      e.pos = add(e.pos, scale(axis, overlap * (1 - PLAYER_PUSH_SHARE)));
      movedPlayers.add(p.id);
      movedEnemies.add(e.id);
    }
  }

  for (let i = 0; i < world.enemies.length; i++) {
    const a = world.enemies[i];
    if (a.state.kind === 'dead') continue;
    const ar = cfg.enemies[a.archetype].radius;
    for (let j = i + 1; j < world.enemies.length; j++) {
      const b = world.enemies[j];
      if (b.state.kind === 'dead') continue;
      const br = cfg.enemies[b.archetype].radius;
      const d = dist(a.pos, b.pos);
      const overlap = ar + br - d;
      if (overlap <= 0) continue;
      const axis =
        d > 0 ? norm(sub(b.pos, a.pos)) : { x: cos(a.facing), y: sin(a.facing) };
      a.pos = add(a.pos, scale(axis, -overlap * 0.5));
      b.pos = add(b.pos, scale(axis, overlap * 0.5));
      movedEnemies.add(a.id);
      movedEnemies.add(b.id);
    }
    if (companion !== null && companion.state !== 'downed') {
      const d = dist(a.pos, companion.pos);
      const overlap = ar + companion.radius - d;
      if (overlap > 0) {
        const axis =
          d > 0
            ? norm(sub(companion.pos, a.pos))
            : { x: cos(a.facing), y: sin(a.facing) };
        a.pos = add(a.pos, scale(axis, -overlap * 0.5));
        companion.pos = add(companion.pos, scale(axis, overlap * 0.5));
        movedEnemies.add(a.id);
        companionMoved = true;
      }
    }
  }

  for (const p of world.players) {
    if (!movedPlayers.has(p.id)) continue;
    p.pos = clampArenaMovement(world, playersBefore.get(p.id) ?? p.pos, p.pos, pr);
  }
  for (const e of world.enemies) {
    if (e.state.kind === 'dead' || !movedEnemies.has(e.id)) continue;
    const er = cfg.enemies[e.archetype].radius;
    e.pos = clampArenaMovement(world, enemiesBefore.get(e.id) ?? e.pos, e.pos, er);
  }
  if (companion !== null && companionBefore !== null && companionMoved) {
    companion.pos = clampArenaMovement(
      world,
      companionBefore,
      companion.pos,
      companion.radius,
    );
  }
};

const thawFrozen = (bodies: readonly { id: EntityId; hitstopMs?: Ms }[]): Set<EntityId> => {
  const frozen = new Set<EntityId>();
  for (const body of bodies) {
    if ((body.hitstopMs ?? 0) <= 0) continue;
    body.hitstopMs = Math.max(0, (body.hitstopMs ?? 0) - TICK_MS);
    frozen.add(body.id);
  }
  return frozen;
};

export const stepWorld = (
  world: World,
  intents: readonly Intent[],
  combat: CombatConfig,
  slowMo: SlowMoConfig,
  encounter: EncounterDef,
): void => {
  world.events.length = 0;
  world.tick += 1;

  stepSlowMo(world, slowMo, intents, TICK_MS);

  const paired = world.players.length > 1;
  if (!paired && world.hitstopMs > 0) {
    world.hitstopMs = Math.max(0, world.hitstopMs - TICK_MS);
    return;
  }
  const frozenPlayers = paired ? thawFrozen(world.players) : EMPTY_FROZEN;
  const frozenEnemies = paired ? thawFrozen(world.enemies) : EMPTY_FROZEN;

  const scales = currentScales(world);
  const playerDt = TICK_MS * scales.player;
  const worldDt = TICK_MS * scales.world;
  const playersBefore = new Map(world.players.map((p) => [p.id, { ...p.pos }]));
  const enemiesBefore = new Map(
    world.enemies.map((enemy) => [enemy.id, { ...enemy.pos }]),
  );
  const companionBefore =
    world.companion === null ? null : { ...world.companion.pos };

  for (let i = 0; i < world.players.length; i++) {
    const player = world.players[i];
    if (frozenPlayers.has(player.id)) continue;
    stepPlayer(world, player, intents[i] ?? NEUTRAL_INTENT, combat, playerDt);
  }
  for (let i = 0; i < world.players.length; i++) {
    const player = world.players[i];
    if (frozenPlayers.has(player.id)) continue;
    stepPowers(world, player, intents[i] ?? NEUTRAL_INTENT, combat, playerDt);
  }
  stepCompanion(world, world.players[0], playerDt);
  stepEnemyStatuses(world, worldDt);
  for (const enemy of world.enemies) {
    if (frozenEnemies.has(enemy.id)) continue;
    stepEnemy(world, enemy, combat, worldDt);
  }
  for (const player of world.players) {
    player.pos = clampArenaMovement(
      world,
      playersBefore.get(player.id) ?? player.pos,
      player.pos,
      combat.player.radius,
    );
  }
  for (const enemy of world.enemies) {
    if (enemy.state.kind === 'dead') continue;
    enemy.pos = clampArenaMovement(
      world,
      enemiesBefore.get(enemy.id) ?? enemy.pos,
      enemy.pos,
      combat.enemies[enemy.archetype].radius,
    );
  }
  if (world.companion !== null && companionBefore !== null) {
    world.companion.pos = clampArenaMovement(
      world,
      companionBefore,
      world.companion.pos,
      world.companion.radius,
    );
  }
  stepProjectiles(world, combat, worldDt);
  separate(world, combat);
  stepEncounter(world, encounter, combat, worldDt);
  stepPickups(world, combat, intents, worldDt);
};

export const stepPublicWorld = (
  world: World,
  intents: readonly Intent[],
  combat: CombatConfig,
  slowMo: SlowMoConfig,
  encounter: EncounterDef,
): void => {
  world.events.length = 0;
  world.tick += 1;

  stepSlowMo(world, slowMo, intents, TICK_MS);
  const paired = world.players.length > 1;
  if (!paired && world.hitstopMs > 0) {
    world.hitstopMs = Math.max(0, world.hitstopMs - TICK_MS);
    return;
  }
  const frozenPlayers = paired ? thawFrozen(world.players) : EMPTY_FROZEN;
  const frozenEnemies = paired ? thawFrozen(world.enemies) : EMPTY_FROZEN;

  const scales = currentScales(world);
  const playerDt = TICK_MS * scales.player;
  const worldDt = TICK_MS * scales.world;
  const playersBefore = new Map(world.players.map((p) => [p.id, { ...p.pos }]));
  const enemiesBefore = new Map(
    world.enemies.map((enemy) => [enemy.id, { ...enemy.pos }]),
  );

  for (let i = 0; i < world.players.length; i++) {
    const player = world.players[i];
    if (frozenPlayers.has(player.id)) continue;
    stepPlayer(world, player, intents[i] ?? NEUTRAL_INTENT, combat, playerDt);
  }
  stepCompanion(world, world.players[0], playerDt);

  for (let i = 0; i < world.players.length; i++) {
    const player = world.players[i];
    if (frozenPlayers.has(player.id)) continue;
    stepPowers(world, player, intents[i] ?? NEUTRAL_INTENT, combat, playerDt);
  }
  for (const enemy of world.enemies) {
    if (frozenEnemies.has(enemy.id)) continue;
    stepEnemy(world, enemy, combat, worldDt);
  }
  for (const player of world.players) {
    player.pos = clampArenaMovement(
      world,
      playersBefore.get(player.id) ?? player.pos,
      player.pos,
      combat.player.radius,
    );
  }
  for (const enemy of world.enemies) {
    if (enemy.state.kind === 'dead') continue;
    enemy.pos = clampArenaMovement(
      world,
      enemiesBefore.get(enemy.id) ?? enemy.pos,
      enemy.pos,
      combat.enemies[enemy.archetype].radius,
    );
  }
  stepProjectiles(world, combat, worldDt);
  separate(world, combat);
  stepEncounter(world, encounter, combat, worldDt);
  stepPickups(world, combat, intents, worldDt);
};

export const hashWorld = (world: World): number => {
  let h = 0x811c9dc5;
  const mix = (n: number): void => {
    const q = Math.round(n * 10000) | 0;
    h = Math.imul(h ^ (q & 0xffff), 0x01000193) >>> 0;
    h = Math.imul(h ^ ((q >>> 16) & 0xffff), 0x01000193) >>> 0;
  };

  mix(world.tick);
  mix(world.rng.value);
  mix(world.hitstopMs);
  mix(world.encounter.elapsedMs);
  mix(world.encounter.nextWave);
  mix(world.encounter.clearedWaves.length);
  mix(world.slowMo.remainingMs);
  mix(world.slowMo.scales.world);

  for (const p of world.players) {
    mix(p.pos.x);
    mix(p.pos.y);
    mix(p.facing);
    mix(p.hp);
    mix(p.stamina);
    mix(p.state.elapsedMs);
    mix(p.state.kind.length * 31 + p.state.kind.charCodeAt(0));
  }

  const companion = world.companion;
  if (companion !== null) {
    mix(companion.id);
    mix(companion.pos.x);
    mix(companion.pos.y);
    mix(companion.facing);
    mix(companion.hp);
    mix(companion.state === 'following' ? 1 : 0);
  }

  for (const e of world.enemies) {
    mix(e.id);
    mix(e.pos.x);
    mix(e.pos.y);
    mix(e.facing);
    mix(e.hp);
    mix(e.poise);
    mix(e.phase ?? 1);
    mix(e.sequenceStep ?? -1);
    mix(e.sequenceParries ?? 0);
    mix(e.edgeStep ?? 0);
    mix(e.patternStep ?? 0);
    mix(e.glideTarget?.x ?? 0);
    mix(e.glideTarget?.y ?? 0);
    mix(e.staggerAfterAttack ? 1 : 0);
    mix(e.frozenMs ?? 0);
    mix(e.burningMs ?? 0);
    mix(e.burnTickMs ?? 0);
    mix(e.burnTickIntervalMs ?? 0);
    mix(e.burnDamage ?? 0);
    mix(e.turncoatMs ?? 0);
    mix(e.state.elapsedMs);
    mix(e.state.telegraphJitterMs);
    mix(e.state.kind.length * 31 + e.state.kind.charCodeAt(0));
  }

  for (const s of world.projectiles) {
    mix(s.id);
    mix(s.kind === 'falling' ? 2 : 1);
    mix(s.ownerId);
    mix(s.pos.x);
    mix(s.pos.y);
    mix(s.vel.x);
    mix(s.vel.y);
    mix(s.damage);
    mix(s.turncoat ? 1 : 0);
    mix(s.lifeMs);
    mix(s.maxLifeMs);
    mix(s.impactRadius ?? 0);
  }

  return h >>> 0;
};
