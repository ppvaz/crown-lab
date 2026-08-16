
import type {
  CombatConfig,
  ParryDef,
  PowerKind,
  SlowMoConfig,
} from '../sim/types';

import { ARCHER } from './enemies/archer';
import { CAPTAIN } from './enemies/captain';
import { CAPTAIN_READ } from './enemies/captain-read';
import { CHANCELLOR } from './enemies/chancellor';
import { DUELIST } from './enemies/duelist';
import { ELITE_GUARD } from './enemies/elite-guard';
import { FIRST_BLADE } from './enemies/first-blade';
import { GUARD } from './enemies/guard';
import { MESH_GUARD_ENEMY } from './enemies/mesh-guard';
import { PIKE_BOSS } from './enemies/pike-boss';
import { GLASS_REGENT } from './enemies/glass-regent';
import { QUEEN } from './enemies/queen';
import { PIKE_NOVICE } from './enemies/pike-novice';
import { RAIN_BOSS } from './enemies/rain-boss';
import { THORN_MARSHAL } from './enemies/thorn-marshal';

const clone = <T>(value: T): T => structuredClone(value);


const PARRY_BALANCED: ParryDef = {
  onsetMs: 40,
  perfectMs: 120,
  lateMs: 180,
  bufferMs: 70,
  whiffLockoutMs: 320,
  arcDeg: 180,
  staminaReward: 25,
  poiseDamage: 45,
  hitstopMs: 100,

  riposteWindowMs: 1400,
  riposteWindupScale: 0.25,

  reflect: { damageScale: 2, speedScale: 1.5, poiseDamage: 45 },
};

const PARRY_STRICT: ParryDef = {
  ...PARRY_BALANCED,
  reflect: { ...PARRY_BALANCED.reflect },
  onsetMs: 60,
  perfectMs: 70,
  lateMs: 110,
  bufferMs: 40,
};

const PARRY_GENEROUS: ParryDef = {
  ...PARRY_BALANCED,
  reflect: { ...PARRY_BALANCED.reflect },
  onsetMs: 20,
  perfectMs: 200,
  lateMs: 260,
  bufferMs: 120,
};

export const PARRY_PRESETS: Record<string, ParryDef> = {
  Parry_Balanced: PARRY_BALANCED,
  Parry_Strict: PARRY_STRICT,
  Parry_Generous: PARRY_GENEROUS,
};




const DEFAULT_DROPS = {
  chance: 0.25,
  weights: { health: 3, stamina: 4, power: 2 },
  healthAmount: 18,
  staminaAmount: 30,
  powerAmount: 0.5,
  lifeMs: 9000,
  pickupRadius: 0.55,
  bossesDrop: false,
};

export const DEFAULT_COMBAT: CombatConfig = {
  drops: { ...DEFAULT_DROPS },
  id: 'Default',
  description: 'Baseline feel. Every named preset is this, with one group moved.',
  player: {
    maxHp: 100,
    maxStamina: 100,
    staminaRegenPerSec: 22,
    staminaRegenDelayMs: 550,
    staminaOnKill: 0,
    moveSpeed: 4.2,
    acceleration: 26,
    deceleration: 34,
    turnRate: 9,
    radius: 0.45,
    attacks: {
      light: {
        windupMs: 130,
        activeMs: 70,
        recoveryMs: 260,
        damage: 18,
        poiseDamage: 24,
        range: 1.9,
        arcDeg: 100,
        maxTargets: 2,
        staminaCost: 12,
        turnRateDuringWindup: 3.0,
        hitstopMs: 85,
        knockback: 3.5,
      },
      heavy: {
        windupMs: 420,
        activeMs: 110,
        recoveryMs: 560,
        damage: 48,
        poiseDamage: 90,
        range: 2.4,
        arcDeg: 160,
        maxTargets: 5,
        staminaCost: 28,
        turnRateDuringWindup: 1.1,
        hitstopMs: 150,
        knockback: 9.0,
      },
    },
    parry: clone(PARRY_BALANCED),
    guard: {
      chipFraction: 0.18,
      staminaPerHit: 20,
      moveSpeedMult: 0.45,
      arcDeg: 170,
      guardBreakStaggerMs: 900,
    },
    step: {
      distance: 2.6,
      durationMs: 260,
      iframeMs: 0,
      staminaCost: 20,
      recoveryMs: 140,
    },
  },
  enemies: {
    guard: clone(GUARD),
    duelist: clone(DUELIST),
    archer: clone(ARCHER),
    first_blade: clone(FIRST_BLADE),
    captain: clone(CAPTAIN),
    captain_read: clone(CAPTAIN_READ),
    rain_boss: clone(RAIN_BOSS),
    chancellor: clone(CHANCELLOR),
    elite_guard: clone(ELITE_GUARD),
    pike_novice: clone(PIKE_NOVICE),
    pike_boss: clone(PIKE_BOSS),
    thorn_marshal: clone(THORN_MARSHAL),
    queen: clone(QUEEN),
    glass_regent: clone(GLASS_REGENT),
    mesh_guard: clone(MESH_GUARD_ENEMY),
  },
  maxSimultaneousAttackers: 2,
  projectileRadius: 0.18,
  projectileLifeMs: 3000,
  friendlyFire: { melee: false, projectiles: false, poise: false },

  weather: 'fixed',
  power: 'none',
  powers: {
    lightning: {
      channeled: true,
      channelWindupMs: 200,
      tickIntervalMs: 200,
      staminaPerTick: 9,



      damageRampTick: 2,
      damageRampMult: 2.2,
      channelMoveMult: 0.3,
      releaseRecoveryMs: 250,
      castMs: 0,
      recoveryMs: 180,
      cooldownMs: 2600,
      staminaCost: 12,
      range: 5.0,
      arcDeg: 80,
      damage: 5,
      poiseDamage: 5,
      originOffset: 0.55,
      sweepMs: 110,
      maxTargets: 0,


      falloff: 0.85,
      distance: 0,
      iframeMs: 0,
      forceSpeed: 0,
      hitstopMs: 0,
      overcastHpCost: 4,
    },
    blink: {
      channeled: false,
      channelWindupMs: 0,
      tickIntervalMs: 0,
      staminaPerTick: 0,
      damageRampTick: 0,
      damageRampMult: 1,
      channelMoveMult: 1,
      releaseRecoveryMs: 0,
      castMs: 0,
      recoveryMs: 120,
      cooldownMs: 2200,
      staminaCost: 18,
      range: 0,
      arcDeg: 0,
      damage: 0,
      poiseDamage: 0,
      originOffset: 0,
      sweepMs: 0,
      maxTargets: 0,
      falloff: 1,
      distance: 5.0,
      iframeMs: 90,
      forceSpeed: 0,
      hitstopMs: 0,
      overcastHpCost: 0,
    },
    pull: {
      channeled: false,
      channelWindupMs: 0,
      tickIntervalMs: 0,
      staminaPerTick: 0,
      damageRampTick: 0,
      damageRampMult: 1,
      channelMoveMult: 1,
      releaseRecoveryMs: 0,
      castMs: 0,
      recoveryMs: 220,
      cooldownMs: 3000,
      staminaCost: 20,
      range: 7.0,
      arcDeg: 50,
      damage: 0,
      poiseDamage: 40,
      originOffset: 0.4,
      sweepMs: 90,
      maxTargets: 1,
      falloff: 1,
      distance: 0,
      iframeMs: 0,
      forceSpeed: 11,
      hitstopMs: 40,
      overcastHpCost: 0,
    },
    push: {
      channeled: false,
      channelWindupMs: 0,
      tickIntervalMs: 0,
      staminaPerTick: 0,
      damageRampTick: 0,
      damageRampMult: 1,
      channelMoveMult: 1,
      releaseRecoveryMs: 0,
      castMs: 0,
      recoveryMs: 180,
      cooldownMs: 2400,
      staminaCost: 18,
      range: 4.8,
      arcDeg: 90,
      damage: 0,
      poiseDamage: 25,
      originOffset: 0.3,
      sweepMs: 100,
      maxTargets: 3,
      falloff: 1,
      distance: 0,
      iframeMs: 0,
      forceSpeed: 13,
      hitstopMs: 40,
      overcastHpCost: 0,
    },
    freeze: {
      channeled: false,
      channelWindupMs: 0,
      tickIntervalMs: 0,
      staminaPerTick: 0,
      damageRampTick: 0,
      damageRampMult: 1,
      channelMoveMult: 1,
      releaseRecoveryMs: 0,
      castMs: 0,
      recoveryMs: 240,
      cooldownMs: 4200,
      staminaCost: 24,
      range: 5.4,
      arcDeg: 72,
      damage: 0,
      poiseDamage: 0,
      originOffset: 0.35,
      sweepMs: 120,
      maxTargets: 3,
      falloff: 1,
      distance: 0,
      iframeMs: 0,
      forceSpeed: 0,
      effectDurationMs: 2200,
      hitstopMs: 35,
      overcastHpCost: 0,
    },
    incinerate: {
      channeled: false,
      channelWindupMs: 0,
      tickIntervalMs: 0,
      staminaPerTick: 0,
      damageRampTick: 0,
      damageRampMult: 1,
      channelMoveMult: 1,
      releaseRecoveryMs: 0,
      castMs: 0,
      recoveryMs: 260,
      cooldownMs: 3800,
      staminaCost: 22,
      range: 6.2,
      arcDeg: 48,
      damage: 8,
      poiseDamage: 5,
      originOffset: 0.4,
      sweepMs: 110,
      maxTargets: 1,
      falloff: 1,
      distance: 0,
      iframeMs: 0,
      forceSpeed: 0,
      effectDurationMs: 3200,
      effectTickMs: 500,
      damagePerTick: 7,
      hitstopMs: 45,
      overcastHpCost: 0,
    },
    turncoat: {
      channeled: false,
      channelWindupMs: 0,
      tickIntervalMs: 0,
      staminaPerTick: 0,
      damageRampTick: 0,
      damageRampMult: 1,
      channelMoveMult: 1,
      releaseRecoveryMs: 0,
      castMs: 0,
      recoveryMs: 320,
      cooldownMs: 7000,
      staminaCost: 30,
      range: 6.8,
      arcDeg: 42,
      damage: 0,
      poiseDamage: 0,
      originOffset: 0.4,
      sweepMs: 130,
      maxTargets: 1,
      falloff: 1,
      distance: 0,
      iframeMs: 0,
      forceSpeed: 0,
      effectDurationMs: 6000,
      hitstopMs: 40,
      overcastHpCost: 0,
    },
  },
};


const withParry = (id: string, description: string, parry: ParryDef): CombatConfig => {
  const cfg = clone(DEFAULT_COMBAT);
  cfg.id = id;
  cfg.description = description;
  cfg.player.parry = clone(parry);
  return cfg;
};

const withHeavy = (
  id: string,
  description: string,
  windupMs: number,
  recoveryMs: number,
): CombatConfig => {
  const cfg = clone(DEFAULT_COMBAT);
  cfg.id = id;
  cfg.description = description;
  cfg.player.attacks.heavy.windupMs = windupMs;
  cfg.player.attacks.heavy.recoveryMs = recoveryMs;
  return cfg;
};

const withMovement = (
  id: string,
  description: string,
  moveSpeed: number,
  acceleration: number,
  stepDistance: number,
): CombatConfig => {
  const cfg = clone(DEFAULT_COMBAT);
  cfg.id = id;
  cfg.description = description;
  cfg.player.moveSpeed = moveSpeed;
  cfg.player.acceleration = acceleration;
  cfg.player.step.distance = stepDistance;
  return cfg;
};

const KIT_SWORD_SHIELD: CombatConfig = /* @__PURE__ */ (() => {
  const cfg = clone(DEFAULT_COMBAT);
  cfg.id = 'Kit_Sword_Shield';
  cfg.description =
    'Sword, shield, parry. The kit constraint of the 45-second target — step configured out.';
  cfg.player.step = {
    distance: 0,
    durationMs: 1,
    iframeMs: 0,
    staminaCost: 0,
    recoveryMs: 0,
  };
  return cfg;
})();

const BROADSWORD: CombatConfig = /* @__PURE__ */ (() => {
  const cfg = clone(DEFAULT_COMBAT);
  cfg.id = 'Broadsword';
  cfg.description =
    'One attack verb, a three-step chain, the weight at the back. Does sequence commitment carry the depth verb selection used to?';
  cfg.player.chain = {
    steps: [
      {
        ...clone(DEFAULT_COMBAT.player.attacks.light),
        pose: 'light',
        windupMs: 220,
        activeMs: 80,
        recoveryMs: 300,
        damage: 16,
        poiseDamage: 20,
        staminaCost: 10,
        hitstopMs: 85,
      },
      {
        ...clone(DEFAULT_COMBAT.player.attacks.light),
        pose: 'light',
        windupMs: 280,
        activeMs: 90,
        recoveryMs: 380,
        damage: 26,
        poiseDamage: 35,
        staminaCost: 12,
        hitstopMs: 100,
        turnRateDuringWindup: 2.2,
      },
      {
        ...clone(DEFAULT_COMBAT.player.attacks.heavy),
        pose: 'heavy',
        windupMs: 380,
        activeMs: 110,
        recoveryMs: 410,
        damage: 56,
        poiseDamage: 95,
        staminaCost: 20,
        hitstopMs: 150,
      },
    ],
    resetMs: 1200,
    persistThroughStep: true,
    persistThroughGuard: true,
  };
  return cfg;
})();

const withFriendlyFire = (
  id: string,
  description: string,
  ff: CombatConfig['friendlyFire'],
): CombatConfig => {
  const cfg = clone(DEFAULT_COMBAT);
  cfg.id = id;
  cfg.description = description;
  cfg.friendlyFire = { ...ff };
  return cfg;
};

const withPower = (id: string, description: string, power: PowerKind): CombatConfig => {
  const cfg = clone(DEFAULT_COMBAT);
  cfg.id = id;
  cfg.description = description;
  cfg.power = power;
  return cfg;
};

const WALL: CombatConfig = {
  ...clone(DEFAULT_COMBAT),
  id: 'Wall',
  description:
    'A Muralha: no dodge, thin stamina, the parry pays for everything. Does the king start wanting to be attacked?',
  player: {
    ...clone(DEFAULT_COMBAT.player),
    maxStamina: 70,
    staminaRegenPerSec: 14,
    parry: {
      ...clone(DEFAULT_COMBAT.player.parry),
      staminaReward: 45,
      riposteWindowMs: 1800,
      riposteWindupScale: 0.15,
    },
    step: { distance: 0.6, durationMs: 260, iframeMs: 0, staminaCost: 35, recoveryMs: 200 },
  },
};

const HUNT: CombatConfig = {
  ...clone(DEFAULT_COMBAT),
  id: 'Hunt',
  description:
    'The Hunt: enemies die faster, kills pay stamina, the heavy cleaves wider. Does the room become one phrase — or spam?',
  player: {
    ...clone(DEFAULT_COMBAT.player),
    staminaOnKill: 25,
    parry: { ...clone(DEFAULT_COMBAT.player.parry), staminaReward: 35 },
    attacks: {
      light: clone(DEFAULT_COMBAT.player.attacks.light),
      heavy: { ...clone(DEFAULT_COMBAT.player.attacks.heavy), maxTargets: 5 },
    },
  },
  enemies: Object.fromEntries(
    Object.entries(clone(DEFAULT_COMBAT.enemies)).map(([key, def]) => [
      key,
      { ...def, maxHp: Math.round(def.maxHp * 0.6) },
    ]),
  ) as CombatConfig['enemies'],
};

const HUNT_REACH: CombatConfig = {
  ...clone(HUNT),
  id: 'Hunt_Reach',
  description:
    "A Cacada's rewards plus a quarter more enemy reach. Does paying for aggression work once retreating stops being free?",
  enemies: Object.fromEntries(
    Object.entries(clone(HUNT.enemies)).map(([key, def]) => [
      key,
      { ...def, attacks: def.attacks.map((a) => ({ ...a, range: a.range * 1.25 })) },
    ]),
  ) as CombatConfig['enemies'],
};

const ANVIL: CombatConfig = {
  ...clone(DEFAULT_COMBAT),
  id: 'Anvil',
  description:
    'A Bigorna: the king is the slowest body in the room. Facing replaces distance, and the heavy is how you make space.',
  player: {
    ...clone(DEFAULT_COMBAT.player),
    moveSpeed: 2.2,
    turnRate: 12,
    attacks: {
      light: clone(DEFAULT_COMBAT.player.attacks.light),
      heavy: {
        ...clone(DEFAULT_COMBAT.player.attacks.heavy),
        maxTargets: 4,
        knockback: 14,
        staminaCost: 22,
      },
    },
    guard: { ...clone(DEFAULT_COMBAT.player.guard), moveSpeedMult: 0.8 },
    step: { distance: 3.4, durationMs: 300, iframeMs: 200, staminaCost: 35, recoveryMs: 200 },
  },
  maxSimultaneousAttackers: 3,
};

const createCombatPresets = (): Record<string, CombatConfig> => ({
  Default: DEFAULT_COMBAT,

  Parry_Strict: withParry(
    'Parry_Strict',
    'Narrow windows. Does a small window still read as fair — is failure legibly mine?',
    PARRY_STRICT,
  ),
  Parry_Generous: withParry(
    'Parry_Generous',
    'Wide windows. Does generosity make parry the answer to everything?',
    PARRY_GENEROUS,
  ),

  Heavy_Fast: withHeavy(
    'Heavy_Fast',
    'Cheap heavy. Does it destroy the "I made this opening, now I collect" feeling?',
    240,
    300,
  ),
  Heavy_Committed: withHeavy(
    'Heavy_Committed',
    'Long wind-up, dangerous tail. Heavy but not unresponsive — where is the far edge?',
    600,
    800,
  ),

  Movement_Agile: withMovement(
    'Movement_Agile',
    'Hades-like mobility. Does movement outcompete the shield, making parry optional?',
    6.0,
    40,
    3.6,
  ),
  Movement_Deliberate: withMovement(
    'Movement_Deliberate',
    'The walking wall. Does the inevitable king still feel in control rather than sluggish?',
    3.2,
    16,
    1.4,
  ),

  Kit_Sword_Shield: KIT_SWORD_SHIELD,

  Broadsword: BROADSWORD,

  Wall: WALL,
  Hunt: HUNT,
  Hunt_Reach: HUNT_REACH,
  Anvil: ANVIL,

  FF_Projectiles: withFriendlyFire(
    'FF_Projectiles',
    'Arrows hit whoever is in the way. Does lining up the archer become a real skill?',
    { melee: false, projectiles: true, poise: false },
  ),
  FF_All: withFriendlyFire(
    'FF_All',
    'Melee and arrows both. Does the crowd start fighting itself instead of the king?',
    { melee: true, projectiles: true, poise: true },
  ),

  Power_Lightning: withPower(
    'Power_Lightning',
    'Hand lightning. Does a ranged answer extend the exchange or replace it?',
    'lightning',
  ),
  Power_Blink: withPower(
    'Power_Blink',
    'Blink. Is committed repositioning more expressive than the step, or does spacing go free?',
    'blink',
  ),
  Power_Pull: withPower(
    'Power_Pull',
    'Pull. Does choosing which enemy is next turn a queue into a decision? (H11)',
    'pull',
  ),
  Power_Push: withPower(
    'Power_Push',
    'Push. Does forceful space-making author the crowd without becoming free damage?',
    'push',
  ),
  Power_Freeze: withPower(
    'Power_Freeze',
    'Freeze. Does pausing a few clocks create a deliberate target order, or only lower pressure?',
    'freeze',
  ),
  Power_Incinerate: withPower(
    'Power_Incinerate',
    'Incinerate. Does delayed damage make target choice matter beyond the current swing?',
    'incinerate',
  ),
  Power_Turncoat: withPower(
    'Power_Turncoat',
    'Turncoat. Does temporary enemy allegiance create authored crossfire rather than passive damage?',
    'turncoat',
  ),
});

export const COMBAT_PRESETS: Record<string, CombatConfig> =
  /* @__PURE__ */ createCombatPresets();


const SCALES = { worldScale: 0.2, playerScale: 0.5 } as const;

const SLOWMO_NONE: SlowMoConfig = {
  mode: 'none',
  triggers: [],
  intensity: 1,
  worldScale: 1,
  playerScale: 1,
  durationMs: 0,
  blendMs: 0,
  cooldownMs: 0,
  maxPerEncounter: 0,
  endOnDecisiveAction: false,
  streakThreshold: 3,
  chargePerActivation: 3,
};

const SLOWMO_SHIPPED: SlowMoConfig = {
  ...SLOWMO_NONE,
  mode: 'static',
  triggers: ['parry_streak', 'lethal_heavy', 'last_enemy', 'first_contact'],
  ...SCALES,
  streakThreshold: 3,
  durationMs: 900,
  blendMs: 90,
  cooldownMs: 5200,
  maxPerEncounter: 3,
  endOnDecisiveAction: true,
};

export const DEFAULT_SLOWMO: SlowMoConfig = SLOWMO_NONE;

export const SLOWMO_PRESETS: Record<string, SlowMoConfig> = {
  none: SLOWMO_NONE,

  static: {
    ...SLOWMO_NONE,
    mode: 'static',
    triggers: ['perfect_parry', 'lethal_heavy'],
    ...SCALES,
    durationMs: 900,
    blendMs: 90,
    cooldownMs: 2500,
    maxPerEncounter: 6,
    endOnDecisiveAction: true,
  },

  shipped: SLOWMO_SHIPPED,

  assist: {
    ...SLOWMO_NONE,
    mode: 'assist',
    triggers: ['near_miss', 'multi_threat'],
    ...SCALES,
    durationMs: 700,
    blendMs: 110,
    cooldownMs: 4000,
    maxPerEncounter: 4,
    endOnDecisiveAction: true,
  },

  mastery_taper: {
    ...SLOWMO_NONE,
    mode: 'mastery_taper',
    triggers: ['perfect_parry', 'lethal_heavy'],
    ...SCALES,
    durationMs: 900,
    blendMs: 90,
    cooldownMs: 2500,
    maxPerEncounter: 6,
    endOnDecisiveAction: true,
  },

  mastery_reward: {
    ...SLOWMO_NONE,
    mode: 'mastery_taper',
    triggers: ['perfect_parry', 'lethal_heavy'],
    intensity: 0.1,
    ...SCALES,
    durationMs: 900,
    blendMs: 90,
    cooldownMs: 2500,
    maxPerEncounter: 6,
    endOnDecisiveAction: true,
  },

  lab_manual: {
    ...SLOWMO_NONE,
    mode: 'player_focus',
    triggers: ['manual'],
    ...SCALES,
    durationMs: 1000,
    blendMs: 90,
    cooldownMs: 250,
    maxPerEncounter: 999,
    endOnDecisiveAction: false,
    chargePerActivation: 0,
  },

  player_focus: {
    ...SLOWMO_NONE,
    mode: 'player_focus',
    triggers: ['manual'],
    ...SCALES,
    durationMs: 1200,
    blendMs: 80,
    cooldownMs: 1000,
    maxPerEncounter: 5,
    endOnDecisiveAction: true,
    chargePerActivation: 3,
  },
};

export const DEFAULT_SLOWMO_ID = 'none';
