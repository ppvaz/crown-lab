

export type Ms = number;

export type Tick = number;

export const TICK_HZ = 120;
export const TICK_MS: Ms = 1000 / TICK_HZ;

export const msToTicks = (ms: Ms): number => Math.round(ms / TICK_MS);
export const ticksToMs = (ticks: number): Ms => ticks * TICK_MS;

export interface TimeScales {
  world: number;
  player: number;
}

export const NORMAL_TIME: TimeScales = { world: 1, player: 1 };


export interface Vec2 {
  x: number;
  y: number;
}

export type Radians = number;

export interface Obstacle {
  at: Vec2;
  radius: number;
}

export interface Obstacle {
  at: Vec2;
  radius: number;
}

export interface Arena {
  halfExtents: Vec2;
  obstacles?: Obstacle[];
  vertices?: Vec2[];
  outline?: Vec2[];
  regions?: Vec2[][];
  gates?: Array<{
    id: string;
    from: Vec2;
    to: Vec2;
    lockUntilWaveCleared: string;
  }>;
  elevationRamp?: {
    axis: 'x' | 'y';
    from: number;
    to: number;
    height: number;
    steps: number;
  };
}


export type EntityId = number;

export const PLAYER_ID: EntityId = 0;

export const ROOM_ID: EntityId = -1;

export type PlayerStateKind =
  | 'idle'
  | 'move'
  | 'windup'
  | 'active'
  | 'recovery'
  | 'guard'
  | 'parry'
  | 'stagger'
  | 'step'
  | 'dead';

export type AttackKind = 'light' | 'heavy';

export interface PlayerState {
  kind: PlayerStateKind;
  enteredTick: Tick;
  elapsedMs: Ms;
  attack: AttackKind | null;
  struck: EntityId[];
  earned?: boolean;
  chainStep?: number;
}

export interface Player {
  id: EntityId;
  pos: Vec2;
  vel: Vec2;
  facing: Radians;
  hp: number;
  maxHp: number;
  stamina: number;
  maxStamina: number;
  state: PlayerState;
  iframeMs: Ms;
  riposteWindowMs: Ms;
  parryStreak: number;
  shoveVel?: Vec2;
  shoveMs?: Ms;
  regenDelayMs: Ms;
  parryLockoutMs: Ms;
  powerCooldownMs: Ms;
  powerChannelMs: Ms;
  powerTickMs: Ms;
  powerTicks: number;
  slowMoCooldownMs: Ms;
  slowMoUsedThisEncounter: number;
  chainStep?: number;
  chainIdleMs?: Ms;
  hitstopMs?: Ms;
}

export type EnemyArchetype =
  | 'guard'
  | 'duelist'
  | 'archer'
  | 'first_blade'
  | 'captain'
  | 'captain_read'
  | 'rain_boss'
  | 'chancellor'
  | 'elite_guard'
  | 'mesh_guard'
  | 'pike_novice'
  | 'pike_boss'
  | 'thorn_marshal'
  | 'queen'
  | 'glass_regent';

export type EnemyStateKind =
  | 'entrance_fall'
  | 'entrance_roar'
  | 'phase_roar'
  | 'idle'
  | 'approach'
  | 'reposition'
  | 'sequence_reposition'
  | 'edge_reposition'
  | 'telegraph'
  | 'attack'
  | 'recovery'
  | 'stagger'
  | 'dead';

export interface EnemyState {
  kind: EnemyStateKind;
  enteredTick: Tick;
  elapsedMs: Ms;
  attackIndex: number;
  telegraphJitterMs: Ms;
  struck: EntityId[];
}

export interface Enemy {
  id: EntityId;
  archetype: EnemyArchetype;
  pos: Vec2;
  vel: Vec2;
  facing: Radians;
  hp: number;
  maxHp: number;
  poise: number;
  maxPoise: number;
  state: EnemyState;
  attackCooldownMs: Ms;
  sequenceStep?: number;
  sequenceAngle?: Radians;
  sequenceParries?: number;
  sequencePhrases?: number;
  phase?: number;
  edgeStep?: number;
  glideTarget?: Vec2;
  staggerAfterAttack?: boolean;
  patternStep?: number;
  guardAbsorbs?: number;
  guardImpactTick?: Tick;
  guardImpactParried?: boolean;
  summoned?: EntityId[];
  summonedAtPhrase?: number;
  frozenMs?: Ms;
  burningMs?: Ms;
  burnTickMs?: Ms;
  burnTickIntervalMs?: Ms;
  burnDamage?: number;
  turncoatMs?: Ms;
  hitstopMs?: Ms;
  warded?: boolean;
  wardPushCooldownMs?: Ms;
  staggerOverrideMs?: Ms;
  hasSlammed?: boolean;
}

export interface Companion {
  id: EntityId;
  name: string;
  pos: Vec2;
  vel: Vec2;
  facing: Radians;
  hp: number;
  maxHp: number;
  radius: number;
  state: 'following' | 'downed';
}

const GUARDED_STATES: readonly EnemyStateKind[] = ['idle', 'approach', 'reposition'];

export const enemyGuardIsUp = (enemy: Enemy, ecfg: EnemyConfig): boolean =>
  ecfg.defence !== undefined && GUARDED_STATES.includes(enemy.state.kind);

export const enemyIsInvulnerable = (enemy: Enemy): boolean =>
  enemy.state.kind === 'entrance_fall' ||
  enemy.state.kind === 'entrance_roar' ||
  enemy.state.kind === 'phase_roar' ||
  enemy.warded === true;

export interface Projectile {
  id: EntityId;
  kind: 'linear' | 'falling';
  ownerId: EntityId;
  pos: Vec2;
  vel: Vec2;
  damage: number;
  hostileTo: 'player' | 'enemy';
  reflected: boolean;
  turncoat?: boolean;
  hazard?: boolean;
  lifeMs: Ms;
  maxLifeMs: Ms;
  impactRadius?: number;
  shardIntegrity?: number;
  shardMaxIntegrity?: number;
  rally?: number;
}


export interface Intent {
  move: Vec2;
  facing: Radians | null;
  lightPressed: boolean;
  heavyPressed: boolean;
  guardHeld: boolean;
  guardPressed: boolean;
  stepPressed: boolean;
  focusPressed: boolean;
  interactPressed: boolean;
  powerPressed: boolean;
  powerHeld: boolean;
  aimDistance: number | null;
}

export const NEUTRAL_INTENT: Intent = {
  move: { x: 0, y: 0 },
  facing: null,
  lightPressed: false,
  heavyPressed: false,
  guardHeld: false,
  guardPressed: false,
  stepPressed: false,
  focusPressed: false,
  interactPressed: false,
  powerPressed: false,
  powerHeld: false,
  aimDistance: null,
};


export interface AttackDef {
  windupMs: Ms;
  activeMs: Ms;
  recoveryMs: Ms;
  damage: number;
  poiseDamage: number;
  range: number;
  arcDeg: number;
  maxTargets: number;
  staminaCost: number;
  turnRateDuringWindup: number;
  hitstopMs: Ms;
  knockback: number;
}

export interface ChainStepDef extends AttackDef {
  pose: AttackKind;
}

export interface ChainDef {
  steps: ChainStepDef[];
  resetMs: Ms;
  persistThroughStep: boolean;
  persistThroughGuard: boolean;
}

export interface ReflectDef {
  damageScale: number;
  speedScale: number;
  poiseDamage: number;
}

export interface ParryDef {
  onsetMs: Ms;
  perfectMs: Ms;
  lateMs: Ms;
  bufferMs: Ms;
  whiffLockoutMs: Ms;
  arcDeg: number;
  staminaReward: number;
  poiseDamage: number;
  hitstopMs: Ms;
  riposteWindowMs: Ms;
  riposteWindupScale: number;
  reflect: ReflectDef;
}

export interface GuardDef {
  chipFraction: number;
  staminaPerHit: number;
  moveSpeedMult: number;
  arcDeg: number;
  guardBreakStaggerMs: Ms;
}

export interface StepDef {
  distance: number;
  durationMs: Ms;
  iframeMs: Ms;
  staminaCost: number;
  recoveryMs: Ms;
}

export interface PlayerConfig {
  maxHp: number;
  maxStamina: number;
  staminaRegenPerSec: number;
  staminaOnKill: number;
  staminaRegenDelayMs: Ms;
  moveSpeed: number;
  acceleration: number;
  deceleration: number;
  turnRate: number;
  radius: number;
  attacks: Record<AttackKind, AttackDef>;
  chain?: ChainDef;
  parry: ParryDef;
  guard: GuardDef;
  step: StepDef;
}

export const playerAttackDef = (state: PlayerState, pc: PlayerConfig): AttackDef | null => {
  if (state.attack === null) return null;
  if (pc.chain !== undefined && state.chainStep !== undefined) {
    return pc.chain.steps[state.chainStep];
  }
  return pc.attacks[state.attack];
};

export type AttackTell =
  | 'jab'
  | 'chop'
  | 'sweep'
  | 'thrust';

export interface EnemyAttackDef {
  id: string;
  telegraphMs: Ms;
  telegraphJitterMs: Ms;
  feint?: {
    atMs: Ms;
    resetMs: Ms;
  };
  activeMs: Ms;
  recoveryMs: Ms;
  range: number;
  arcDeg: number;
  damage: number;
  lungeDistance: number;
  turnRateDuringWindup?: number;
  traversesArena?: boolean;
  parryable: boolean;
  kind: 'melee' | 'projectile' | 'rain' | 'volley' | 'shockwave';
  tell?: AttackTell;
  projectileSpeed?: number;
  rain?: {
    impactDelayMs: Ms;
    impactRadius: number;
    offsets: Vec2[];
  };
}

export interface EnemyConfig {
  archetype: EnemyArchetype;
  boss?: {
    name: string;
    entranceFallMs: Ms;
    introRoarMs: Ms;
    phaseTwoHpFraction: number;
    phaseRoarMs: Ms;
    phaseThreeHpFraction?: number;
  };
  maxHp: number;
  maxPoise: number;
  poiseRegenPerSec: number;
  moveSpeed: number;
  acceleration: number;
  turnRate: number;
  radius: number;
  knockbackScale?: number;
  preferredRange: number;
  attackRange: number;
  attacks: EnemyAttackDef[];
  defence?: {
    arcDeg: number;
    chipFraction: number;
    provokedCooldownMs: Ms;
    unearned?: {
      parryEveryNth: number;
      parryStaminaCost: number;
      counterCooldownMs: Ms;
      parryHitstopMs: Ms;
    };
  };
  volley?: {
    integrity: number;
    maxLive: readonly [number, number];
    speedScalePerReturn: number;
    shatterDamage: number;
    shatterStaggerMs: Ms;
    wardRadius: number;
    wardPushDistance: number;
    shardLifeMs: Ms;
    shockwave: {
      cornerRadius: number;
      damage: number;
      openingShoveMs: Ms;
    };
    reserveCooldownMs: Ms;
    wardPushMs: Ms;
    homingRateRad: number;
    wardPushCooldownMs: Ms;
  };
  attackPattern?: number[];
  attackPatternPhaseTwo?: number[];
  summon?: {
    archetype: EnemyArchetype;
    fromPhase: number;
    everyPhrases: number;
    maxAlive: number;
    offsets: Vec2[];
  };
  attackCooldownMs: Ms;
  attackCooldownJitterMs: Ms;
  staggerMs: Ms;
  sequence?: {
    attackIndices: number[];
    altAttackIndices?: number[];
    repositionMs: Ms;
    orbitRadius: number;
    angleStepRad: Radians;
    idleOrbitScale: number;
    phaseTwo?: {
      attackIndices: number[];
      repositionMs: Ms;
      orbitRadius: number;
      angleStepRad: Radians;
      edgeVisits: number;
      edgeInset: number;
      edgeMoveTimeoutMs: Ms;
      moveSpeedScale: number;
      glideSpeed: number;
    };
    movements?: SequenceMovement[];
  };
}

export interface SequenceMovement {
  attackIndices: number[];
  altAttackIndices?: number[];
  repositionMs: Ms;
  orbitRadius: number;
  angleStepRad: Radians;
  moveSpeedScale: number;
}


export type PowerKind =
  | 'none'
  | 'lightning'
  | 'blink'
  | 'pull'
  | 'push'
  | 'freeze'
  | 'incinerate'
  | 'turncoat';

export interface PowerDef {
  channeled: boolean;
  channelWindupMs: Ms;
  tickIntervalMs: Ms;
  staminaPerTick: number;
  damageRampTick: number;
  damageRampMult: number;
  channelMoveMult: number;
  releaseRecoveryMs: Ms;
  castMs: Ms;
  recoveryMs: Ms;
  cooldownMs: Ms;
  staminaCost: number;
  range: number;
  arcDeg: number;
  damage: number;
  poiseDamage: number;
  originOffset: number;
  sweepMs: Ms;
  maxTargets: number;
  falloff: number;
  distance: number;
  iframeMs: Ms;
  forceSpeed: number;
  effectDurationMs?: Ms;
  effectTickMs?: Ms;
  damagePerTick?: number;
  overcastHpCost: number;
  hitstopMs: Ms;
}

export interface FriendlyFire {
  melee: boolean;
  projectiles: boolean;
  poise: boolean;
}

export interface DropConfig {
  chance: number;
  weights: Record<PickupKind, number>;
  healthAmount: number;
  staminaAmount: number;
  powerAmount: number;
  lifeMs: Ms;
  pickupRadius: number;
  bossesDrop: boolean;
}

export interface CombatConfig {
  id: string;
  description: string;
  player: PlayerConfig;
  drops: DropConfig;
  enemies: Record<EnemyArchetype, EnemyConfig>;
  friendlyFire: FriendlyFire;
  power: PowerKind;
  powers: Record<Exclude<PowerKind, 'none'>, PowerDef>;
  maxSimultaneousAttackers: number;
  projectileRadius: number;
  projectileLifeMs: Ms;
}


export type SlowMoMode =
  | 'none'
  | 'static'
  | 'mastery_taper'
  | 'assist'
  | 'player_focus';

export type SlowMoTrigger =
  | 'perfect_parry'
  | 'parry_streak'
  | 'near_miss'
  | 'lethal_heavy'
  | 'last_enemy'
  | 'multi_threat'
  | 'manual';

export interface SlowMoConfig {
  mode: SlowMoMode;
  triggers: SlowMoTrigger[];
  intensity: number;
  worldScale: number;
  playerScale: number;
  durationMs: Ms;
  blendMs: Ms;
  cooldownMs: Ms;
  maxPerEncounter: number;
  endOnDecisiveAction: boolean;
  streakThreshold: number;
  chargePerActivation: number;
}

export interface SlowMoState {
  active: boolean;
  remainingMs: Ms;
  charge: number;
  scales: TimeScales;
  lastTrigger: SlowMoTrigger | null;
  pending: SlowMoTrigger | null;
  pendingOwner: EntityId | null;
  ownerId: EntityId | null;
}


export interface WaveSpawn {
  archetype: EnemyArchetype;
  at: Vec2;
  facing?: Radians;
}

export interface WaveDef {
  id: string;
  spawns: WaveSpawn[];
  atMs: Ms | null;
}

export interface EncounterHazard {
  kind: 'books';
  count: number;
  phaseTwoCount?: number;
  speed: number;
  damage: number;
}

export interface EncounterDef {
  id: string;
  description: string;
  tutorial?: 'fundamentals' | 'defense' | 'focus' | 'power';
  exploration?: boolean;
  arena: Arena;
  playerStart: Vec2;
  waves: WaveDef[];
  hazard?: EncounterHazard;
  timeLimitMs: Ms | null;
}

export interface EncounterState {
  defId: string;
  nextWave: number;
  elapsedMs: Ms;
  spawnedWaves: string[];
  clearedWaves: string[];
  hazardsSpawned: number;
}


export type SimEventType =
  | 'run_started'
  | 'run_ended'
  | 'wave_spawned'
  | 'arena_gate_opened'
  | 'companion_hit'
  | 'companion_downed'
  | 'player_state_change'
  | 'attack_started'
  | 'attack_whiffed'
  | 'chain_reset'
  | 'hit_landed'
  | 'enemy_blocked'
  | 'enemy_parried'
  | 'hit_received'
  | 'guard_success'
  | 'guard_broken'
  | 'parry_success'
  | 'parry_failed'
  | 'step_started'
  | 'stamina_empty'
  | 'enemy_telegraph'
  | 'enemy_feint'
  | 'enemy_attack'
  | 'boss_intro_landed'
  | 'boss_intro_roar_started'
  | 'boss_fight_started'
  | 'boss_phase_roar_started'
  | 'enemy_sequence_step'
  | 'enemy_phase_changed'
  | 'enemy_staggered'
  | 'enemy_summoned'
  | 'enemy_died'
  | 'pickup_dropped'
  | 'pickup_taken'
  | 'pickup_expired'
  | 'projectile_fired'
  | 'projectile_impact'
  | 'projectile_reflected'
  | 'volley_served'
  | 'volley_returned'
  | 'volley_shattered'
  | 'volley_ward_pushed'
  | 'power_used'
  | 'power_hit'
  | 'power_overcast'
  | 'power_released'
  | 'enemy_status_applied'
  | 'enemy_status_tick'
  | 'enemy_status_ended'
  | 'friendly_fire'
  | 'player_died'
  | 'encounter_cleared'
  | 'slowmo_started'
  | 'slowmo_ended';

export interface SimEvent {
  tick: Tick;
  type: SimEventType;
  actor?: EntityId;
  target?: EntityId;
  data?: Record<string, number | string | boolean>;
}


export type RunOutcome = 'running' | 'cleared' | 'dead' | 'timeout';

export interface RngState {
  seed: number;
  value: number;
}

export type PickupKind = 'health' | 'stamina' | 'power';

export interface Pickup {
  id: EntityId;
  kind: PickupKind;
  pos: Vec2;
  amount: number;
  offers?: Exclude<PowerKind, 'none'>;
  lifeMs: Ms;
  totalLifeMs: Ms;
}

export interface World {
  tick: Tick;
  rng: RngState;
  dropRng: RngState;
  arena: Arena;
  players: Player[];
  companion: Companion | null;
  enemies: Enemy[];
  projectiles: Projectile[];
  encounter: EncounterState;
  slowMo: SlowMoState;
  hitstopMs: Ms;
  outcome: RunOutcome;
  events: SimEvent[];
  pickups: Pickup[];
  nextId: EntityId;
}
