
import type {
  CombatConfig,
  Enemy,
  EncounterDef,
  EntityId,
  Ms,
  Player,
  Vec2,
  WaveDef,
  WaveSpawn,
  World,
} from './types';
import { PLAYER_ID, ROOM_ID } from './types';
import { spawnProjectile } from './projectile';
import { angleOf, len, sub } from './vec';
import { makeRng } from './rng';
import { nearestLivingPlayer, patternFor } from './enemy';
import { clampToArena } from './arena';
import { cos, sin } from './trig';
import { emit } from './events';

const aliveCount = (world: World): number => {
  let n = 0;
  for (const e of world.enemies) if (e.state.kind !== 'dead') n += 1;
  return n;
};

const spawnEnemy = (world: World, cfg: CombatConfig, spawn: WaveSpawn): Enemy => {
  const ecfg = cfg.enemies[spawn.archetype];
  const toPlayer = sub(nearestLivingPlayer(world.players, spawn.at).pos, spawn.at);
  const enemy: Enemy = {
    id: world.nextId++,
    archetype: spawn.archetype,
    pos: { x: spawn.at.x, y: spawn.at.y },
    vel: { x: 0, y: 0 },
    facing: spawn.facing ?? (len(toPlayer) > 0 ? angleOf(toPlayer) : 0),
    hp: ecfg.maxHp,
    maxHp: ecfg.maxHp,
    poise: ecfg.maxPoise,
    maxPoise: ecfg.maxPoise,
    state: {
      kind: ecfg.boss === undefined ? 'idle' : 'entrance_fall',
      enteredTick: world.tick,
      elapsedMs: 0,
      attackIndex: 0,
      telegraphJitterMs: 0,
      struck: [],
    },
    attackCooldownMs: ecfg.attackCooldownMs,
    sequenceStep: -1,
    sequenceAngle: 0,
    sequenceParries: 0,
    phase: 1,
    edgeStep: 0,
    glideTarget: undefined,
    staggerAfterAttack: false,
    patternStep: 0,
  };
  if (ecfg.volley !== undefined) enemy.warded = true;
  world.enemies.push(enemy);
  return enemy;
};

const spawnWave = (world: World, cfg: CombatConfig, wave: WaveDef): void => {
  for (const spawn of wave.spawns) spawnEnemy(world, cfg, spawn);
  world.encounter.spawnedWaves.push(wave.id);
  emit(world, 'wave_spawned', {
    data: {
      wave: wave.id,
      count: wave.spawns.length,
      atMs: wave.atMs ?? -1,
      elapsedMs: world.encounter.elapsedMs,
    },
  });
};

const stepSummons = (world: World, cfg: CombatConfig): void => {
  const summoners = world.enemies.length;
  for (let i = 0; i < summoners; i++) {
    const enemy = world.enemies[i];
    if (enemy.state.kind === 'dead') continue;
    const ecfg = cfg.enemies[enemy.archetype];
    const call = ecfg.summon;
    if (call === undefined || call.offsets.length === 0) continue;
    if ((enemy.phase ?? 1) < call.fromPhase) continue;

    const pattern = patternFor(ecfg, enemy);
    if (pattern === undefined || pattern.length === 0) continue;
    const phrases = Math.floor((enemy.patternStep ?? 0) / pattern.length);
    if (phrases <= 0) continue;
    if (phrases % call.everyPhrases !== 0) continue;
    if (enemy.summonedAtPhrase === phrases) continue;

    enemy.summonedAtPhrase = phrases;

    const called = enemy.summoned ?? [];
    const stillAlive = world.enemies.filter(
      (other) => called.includes(other.id) && other.state.kind !== 'dead',
    ).length;
    if (stillAlive >= call.maxAlive) continue;

    const radius = cfg.enemies[call.archetype].radius;
    const forward = { x: cos(enemy.facing), y: sin(enemy.facing) };
    const ids: EntityId[] = [];
    for (const offset of call.offsets) {
      const at = clampToArena(
        world.arena,
        {
          x: enemy.pos.x + forward.x * offset.x - forward.y * offset.y,
          y: enemy.pos.y + forward.y * offset.x + forward.x * offset.y,
        },
        radius,
      );
      ids.push(spawnEnemy(world, cfg, { archetype: call.archetype, at }).id);
    }

    enemy.summoned = [...called, ...ids];
    emit(world, 'enemy_summoned', {
      actor: enemy.id,
      data: {
        archetype: call.archetype,
        count: ids.length,
        phrase: phrases,
        phase: enemy.phase ?? 1,
      },
    });
  }
};

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

const stepHazard = (world: World, cfg: CombatConfig): void => {


  const owner = world.enemies.find(
    (enemy) => enemy.state.kind !== 'dead' && cfg.enemies[enemy.archetype]?.hazard !== undefined,
  );
  if (owner === undefined) return;
  const hazard = cfg.enemies[owner.archetype].hazard;
  if (hazard === undefined) return;

  const phaseTwo = (owner.phase ?? 1) >= 2;
  const target = phaseTwo ? (hazard.phaseTwoCount ?? hazard.count) : hazard.count;
  if (target <= 0) return;

  let alive = 0;
  for (const shot of world.projectiles) if (shot.hazard === true) alive += 1;

  const h = world.arena.halfExtents;
  const span = Math.sqrt(h.x * h.x + h.y * h.y) * 2;
  const reach = Math.min(h.x, h.y) * 0.8;

  while (alive < target) {
    const index = world.encounter.hazardsSpawned;
    world.encounter.hazardsSpawned = index + 1;

    const heading = index * GOLDEN_ANGLE;
    const dir = { x: cos(heading), y: sin(heading) };
    const offset = (((index * 7) % 11) / 5 - 1) * reach;
    const at = clampToArena(
      world.arena,
      {
        x: -dir.x * span - dir.y * offset,
        y: -dir.y * span + dir.x * offset,
      },
      cfg.projectileRadius + 0.25,
    );

    const shot = spawnProjectile(
      world,
      cfg,
      at,
      dir,
      hazard.speed,
      hazard.damage,
      ROOM_ID,
    );
    shot.hazard = true;
    alive += 1;
  }
};

export const createWorld = (def: EncounterDef, cfg: CombatConfig, seed: number): World => {
  const pc = cfg.player;
  const start = { x: def.playerStart.x, y: def.playerStart.y };
  const toCentre = sub({ x: 0, y: 0 }, start);

  const world: World = {
    tick: 0,
    rng: makeRng(seed),
    dropRng: makeRng((seed ^ 0x9e3779b9) >>> 0),
    arena: {
      halfExtents: { ...def.arena.halfExtents },
      vertices: def.arena.vertices?.map((vertex) => ({ ...vertex })),
      obstacles: def.arena.obstacles?.map((obstacle) => ({
        at: { ...obstacle.at },
        radius: obstacle.radius,
      })),
      outline: def.arena.outline?.map((vertex) => ({ ...vertex })),
      regions: def.arena.regions?.map((region) =>
        region.map((vertex) => ({ ...vertex })),
      ),
      gates: def.arena.gates?.map((gate) => ({
        ...gate,
        from: { ...gate.from },
        to: { ...gate.to },
      })),
      elevationRamp:
        def.arena.elevationRamp === undefined ? undefined : { ...def.arena.elevationRamp },
    },
    players: [
      {
        id: PLAYER_ID,
        pos: start,
        vel: { x: 0, y: 0 },
        facing: len(toCentre) > 0 ? angleOf(toCentre) : 0,
        hp: pc.maxHp,
        maxHp: pc.maxHp,
        stamina: pc.maxStamina,
        maxStamina: pc.maxStamina,
        state: {
          kind: 'idle',
          enteredTick: 0,
          elapsedMs: 0,
          attack: null,
          struck: [],
        },
        iframeMs: 0,
        riposteWindowMs: 0,
        parryStreak: 0,
        regenDelayMs: 0,
        parryLockoutMs: 0,
        powerCooldownMs: 0,
        powerChannelMs: 0,
        powerTickMs: 0,
        powerTicks: 0,
        slowMoCooldownMs: 0,
        slowMoUsedThisEncounter: 0,
      },
    ],
    companion: null,
    enemies: [],
    projectiles: [],
    encounter: {
      defId: def.id,
      nextWave: 0,
      elapsedMs: 0,
      spawnedWaves: [],
      clearedWaves: [],
      hazardsSpawned: 0,
    },
    slowMo: {
      active: false,
      remainingMs: 0,
      charge: 0,
      seenAttacks: [],
      scales: { world: 1, player: 1 },
      lastTrigger: null,
      pending: null,
      pendingOwner: null,
      ownerId: null,
    },
    hitstopMs: 0,
    outcome: 'running',
    events: [],
    pickups: [],
    nextId: PLAYER_ID + 1,
  };

  emit(world, 'run_started', { data: { encounter: def.id, combat: cfg.id, seed } });
  return world;
};

export const addPlayer = (world: World, cfg: CombatConfig, at: Vec2): Player => {
  const pc = cfg.player;
  const toCentre = sub({ x: 0, y: 0 }, at);
  const player: Player = {
    id: world.nextId++,
    pos: { x: at.x, y: at.y },
    vel: { x: 0, y: 0 },
    facing: len(toCentre) > 0 ? angleOf(toCentre) : 0,
    hp: pc.maxHp,
    maxHp: pc.maxHp,
    stamina: pc.maxStamina,
    maxStamina: pc.maxStamina,
    state: {
      kind: 'idle',
      enteredTick: world.tick,
      elapsedMs: 0,
      attack: null,
      struck: [],
    },
    iframeMs: 0,
    riposteWindowMs: 0,
    parryStreak: 0,
    regenDelayMs: 0,
    parryLockoutMs: 0,
    powerCooldownMs: 0,
    powerChannelMs: 0,
    powerTickMs: 0,
    powerTicks: 0,
    slowMoCooldownMs: 0,
    slowMoUsedThisEncounter: 0,
  };
  world.players.push(player);
  return player;
};

const finish = (world: World, outcome: 'cleared' | 'dead' | 'timeout'): void => {
  world.outcome = outcome;
  if (outcome === 'dead') {
    emit(world, 'player_died', { actor: PLAYER_ID });
  } else if (outcome === 'cleared') {
    emit(world, 'encounter_cleared', {
      data: { elapsedMs: world.encounter.elapsedMs },
    });
  }
  emit(world, 'run_ended', {
    data: {
      outcome,
      elapsedMs: world.encounter.elapsedMs,
      tick: world.tick,
      hpRemaining: world.players[0].hp,
    },
  });
};

export const stepEncounter = (
  world: World,
  def: EncounterDef,
  cfg: CombatConfig,
  dtMs: Ms,
): void => {
  if (world.outcome !== 'running') return;
  world.encounter.elapsedMs += dtMs;

  const latestWave = world.encounter.spawnedWaves.at(-1);
  if (
    latestWave !== undefined &&
    aliveCount(world) === 0 &&
    !world.encounter.clearedWaves.includes(latestWave)
  ) {
    world.encounter.clearedWaves.push(latestWave);
    for (const gate of world.arena.gates ?? []) {
      if (gate.lockUntilWaveCleared !== latestWave) continue;
      emit(world, 'arena_gate_opened', {
        data: { gate: gate.id, wave: latestWave },
      });
    }
  }

  for (;;) {
    const wave = def.waves[world.encounter.nextWave];
    if (wave === undefined) break;
    const due =
      wave.atMs !== null
        ? world.encounter.elapsedMs >= wave.atMs
        : world.encounter.nextWave === 0 || aliveCount(world) === 0;
    if (!due) break;
    spawnWave(world, cfg, wave);
    world.encounter.nextWave += 1;
  }

  stepSummons(world, cfg);
  stepHazard(world, cfg);

  const first = world.players[0];
  if (first.hp <= 0 || first.state.kind === 'dead') {
    finish(world, 'dead');
    return;
  }

  if (def.exploration === true) return;

  const allWavesOut = world.encounter.nextWave >= def.waves.length;
  if (allWavesOut && aliveCount(world) === 0) {
    finish(world, 'cleared');
    return;
  }

  if (def.timeLimitMs !== null && world.encounter.elapsedMs >= def.timeLimitMs) {
    finish(world, 'timeout');
  }
};
