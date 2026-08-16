
import type {
  CombatConfig,
  EncounterDef,
  SlowMoConfig,
} from '../sim/types';
import type { ResolvedPresentation } from '../lab/presentation';

export const PUBLIC_ROUTE_ROOMS: ReadonlySet<string> = new Set([

  'tutorial_fundamentals',
  'tutorial_defense',
  'tutorial_focus',
  'tutorial_power',
  'wayfarer_court',
  'kernel_guard',
  'kernel_duelist',
  'spacing_archer',
  'overlap_court',
  'siege_10',
  'upper_hall',
  'first_blade',

  'captain',
  'chancellor',

  'glass_regent',
  'queen',
  'thorn_marshal',
]);

export const isPublicRoom = (encounterId: string): boolean =>
  PUBLIC_ROUTE_ROOMS.has(encounterId);

export const PUBLIC_COMBAT = {
  id: 'game',
  description: '',
  drops: {
    chance: 0.25,
    weights: {
      health: 3,
      stamina: 4,
      power: 2,
    },
    healthAmount: 18,
    staminaAmount: 30,
    powerAmount: 0.5,
    lifeMs: 9000,
    pickupRadius: 0.55,
    bossesDrop: false,
  },
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
        turnRateDuringWindup: 3,
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
        knockback: 9,
      },
    },
    parry: {
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
    },
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
    guard: {
      archetype: 'guard',
      maxHp: 90,
      maxPoise: 100,
      poiseRegenPerSec: 14,
      moveSpeed: 2.6,
      acceleration: 14,
      turnRate: 3.2,
      radius: 0.5,
      preferredRange: 1.6,
      attackRange: 2,
      attacks: [
        {
          id: 'guard_chop',
          telegraphMs: 620,
          telegraphJitterMs: 0,
          activeMs: 90,
          recoveryMs: 520,
          range: 2.1,
          arcDeg: 90,
          damage: 16,
          lungeDistance: 0.5,
          turnRateDuringWindup: 1.4,
          parryable: true,
          kind: 'melee',
        },
      ],
      attackCooldownMs: 1100,
      attackCooldownJitterMs: 250,
      staggerMs: 1400,
    },
    duelist: {
      archetype: 'duelist',
      maxHp: 70,
      maxPoise: 70,
      poiseRegenPerSec: 18,
      moveSpeed: 3.6,
      acceleration: 20,
      turnRate: 5,
      radius: 0.42,
      preferredRange: 2.6,
      attackRange: 2.6,
      attacks: [
        {
          id: 'duelist_thrust',
          telegraphMs: 420,
          telegraphJitterMs: 220,
          activeMs: 80,
          recoveryMs: 420,
          range: 2.9,
          arcDeg: 45,
          damage: 14,
          lungeDistance: 1.8,
          turnRateDuringWindup: 1,
          parryable: true,
          kind: 'melee',
        },
        {
          id: 'duelist_sweep',
          telegraphMs: 560,
          telegraphJitterMs: 260,
          activeMs: 110,
          recoveryMs: 560,
          range: 2.2,
          arcDeg: 140,
          damage: 18,
          lungeDistance: 0.4,
          parryable: false,
          kind: 'melee',
        },
      ],
      attackCooldownMs: 900,
      attackCooldownJitterMs: 350,
      staggerMs: 1100,
    },
    archer: {
      archetype: 'archer',
      maxHp: 50,
      maxPoise: 45,
      poiseRegenPerSec: 10,
      moveSpeed: 3,
      acceleration: 16,
      turnRate: 4,
      radius: 0.4,
      preferredRange: 7.5,
      attackRange: 11,
      attacks: [
        {
          id: 'archer_shot',
          telegraphMs: 800,
          telegraphJitterMs: 200,
          activeMs: 40,
          recoveryMs: 500,
          range: 12,
          arcDeg: 12,
          damage: 12,
          lungeDistance: 0,
          parryable: true,
          kind: 'projectile',
          projectileSpeed: 11,
        },
      ],
      attackCooldownMs: 1800,
      attackCooldownJitterMs: 500,
      staggerMs: 1200,
    },
    first_blade: {
      archetype: 'first_blade',
      boss: {
        name: 'THE FIRST BLADE',
        entranceFallMs: 720,
        introRoarMs: 980,
        phaseTwoHpFraction: 0.5,
        phaseRoarMs: 920,
      },
      maxHp: 780,
      maxPoise: 420,
      poiseRegenPerSec: 16,
      moveSpeed: 7.2,
      acceleration: 45,
      turnRate: 8,
      radius: 0.58,
      preferredRange: 2.8,
      attackRange: 3.2,
      attacks: [
        {
          id: 'first_blade_sequence_open',
          telegraphMs: 520,
          telegraphJitterMs: 0,
          activeMs: 85,
          recoveryMs: 260,
          range: 3.1,
          arcDeg: 62,
          damage: 20,
          lungeDistance: 1.4,
          parryable: true,
          kind: 'melee',
        },
        {
          id: 'first_blade_sequence_turn',
          telegraphMs: 430,
          telegraphJitterMs: 0,
          activeMs: 80,
          recoveryMs: 240,
          range: 3,
          arcDeg: 58,
          damage: 22,
          lungeDistance: 1.2,
          parryable: true,
          kind: 'melee',
        },
        {
          id: 'first_blade_sequence_close',
          telegraphMs: 360,
          telegraphJitterMs: 0,
          activeMs: 95,
          recoveryMs: 820,
          range: 3.2,
          arcDeg: 68,
          damage: 26,
          lungeDistance: 1.6,
          parryable: true,
          kind: 'melee',
        },
        {
          id: 'first_blade_glide_open',
          telegraphMs: 300,
          telegraphJitterMs: 0,
          activeMs: 1300,
          recoveryMs: 150,
          range: 1.15,
          arcDeg: 180,
          damage: 16,
          lungeDistance: 0,
          parryable: true,
          kind: 'melee',
          traversesArena: true,
        },
        {
          id: 'first_blade_glide_chain',
          telegraphMs: 220,
          telegraphJitterMs: 0,
          activeMs: 1300,
          recoveryMs: 130,
          range: 1.15,
          arcDeg: 180,
          damage: 17,
          lungeDistance: 0,
          parryable: true,
          kind: 'melee',
          traversesArena: true,
        },
        {
          id: 'first_blade_glide_close',
          telegraphMs: 260,
          telegraphJitterMs: 0,
          activeMs: 1300,
          recoveryMs: 980,
          range: 1.25,
          arcDeg: 180,
          damage: 24,
          lungeDistance: 0,
          parryable: true,
          kind: 'melee',
          traversesArena: true,
        },
        {
          id: 'first_blade_sequence_low',
          telegraphMs: 600,
          telegraphJitterMs: 0,
          activeMs: 90,
          recoveryMs: 300,
          range: 2.6,
          arcDeg: 150,
          damage: 20,
          lungeDistance: 0.9,
          parryable: true,
          kind: 'melee',
        },
      ],
      attackCooldownMs: 1250,
      attackCooldownJitterMs: 0,
      staggerMs: 1350,
      sequence: {
        attackIndices: [0, 1, 2],
        altAttackIndices: [6, 1, 2],
        repositionMs: 650,
        orbitRadius: 2.7,
        angleStepRad: (Math.PI * 2) / 3,
        idleOrbitScale: 0.72,
        phaseTwo: {
          attackIndices: [3, 4, 4, 4, 5],
          repositionMs: 95,
          orbitRadius: 3.1,
          angleStepRad: (Math.PI * 2) / 5,
          edgeVisits: 2,
          edgeInset: 0.7,
          edgeMoveTimeoutMs: 1300,
          moveSpeedScale: 1.45,
          glideSpeed: 24,
        },
      },
    },


    captain: {
      archetype: 'captain',
      boss: {
        name: 'THE CAPTAIN OF THE GUARD',
        entranceFallMs: 720,
        introRoarMs: 980,
        phaseTwoHpFraction: 0.5,
        phaseRoarMs: 920,
      },
      maxHp: 840,
      maxPoise: 240,
      poiseRegenPerSec: 18,
      moveSpeed: 3.2,
      acceleration: 20,
      turnRate: 5.5,
      radius: 0.62,
      knockbackScale: 0.25,
      preferredRange: 2.15,
      attackRange: 2.75,
      defence: {
        arcDeg: 240,
        chipFraction: 0.12,
        provokedCooldownMs: 340,
        unearned: {
          parryEveryNth: 3,
          parryStaminaCost: 25,
          counterCooldownMs: 0,
          parryHitstopMs: 160,
        },
      },
      attacks: [
        {
          id: 'captain_direct',
          tell: 'chop',
          telegraphMs: 620,
          telegraphJitterMs: 0,
          activeMs: 90,
          recoveryMs: 420,
          range: 2.35,
          arcDeg: 92,
          damage: 18,
          lungeDistance: 0.5,
          parryable: true,
          kind: 'melee',
        },
        {
          id: 'captain_feint',
          tell: 'chop',
          telegraphMs: 1180,
          telegraphJitterMs: 0,
          feint: {
            atMs: 360,
            resetMs: 180,
          },
          activeMs: 95,
          recoveryMs: 360,
          range: 2.35,
          arcDeg: 92,
          damage: 20,
          lungeDistance: 0.5,
          parryable: true,
          kind: 'melee',
        },
        {
          id: 'captain_pressure',
          tell: 'jab',
          telegraphMs: 420,
          telegraphJitterMs: 0,
          activeMs: 80,
          recoveryMs: 220,
          range: 1.95,
          arcDeg: 54,
          damage: 12,
          lungeDistance: 0.35,
          parryable: true,
          kind: 'melee',
        },
        {
          id: 'captain_release',
          tell: 'sweep',
          telegraphMs: 760,
          telegraphJitterMs: 0,
          activeMs: 110,
          recoveryMs: 760,
          range: 3.05,
          arcDeg: 144,
          damage: 24,
          lungeDistance: 0.7,
          parryable: true,
          kind: 'melee',
        },
      ],
      attackPattern: [
        0,
        2,
        3,
        0,
        2,
      ],
      attackPatternPhaseTwo: [
        0,
        1,
        2,
        2,
        2,
        3,
      ],
      summon: {
        archetype: 'guard',
        fromPhase: 2,
        everyPhrases: 1,
        maxAlive: 2,
        offsets: [
          {
            x: -2.4,
            y: 1.6,
          },
          {
            x: -2.4,
            y: -1.6,
          },
        ],
      },
      attackCooldownMs: 340,
      attackCooldownJitterMs: 0,
      staggerMs: 1350,
    },
    chancellor: {
      archetype: 'chancellor',
      hazard: { kind: 'books', count: 5, phaseTwoCount: 7, speed: 3.6, damage: 8 },
      boss: {
        name: 'THE CHANCELLOR',
        entranceFallMs: 720,
        introRoarMs: 980,
        phaseTwoHpFraction: 0.5,
        phaseRoarMs: 920,
      },
      maxHp: 640,
      maxPoise: 240,
      poiseRegenPerSec: 18,
      moveSpeed: 2.6,
      acceleration: 18,
      turnRate: 5,
      radius: 0.62,
      preferredRange: 4,
      attackRange: 6,
      attacks: [
        {
          id: 'rain_cross',
          telegraphMs: 420,
          telegraphJitterMs: 0,
          activeMs: 80,
          recoveryMs: 80,
          range: 0,
          arcDeg: 360,
          damage: 18,
          lungeDistance: 0,
          parryable: false,
          kind: 'rain',
          rain: {
            impactDelayMs: 1250,
            impactRadius: 0.78,
            offsets: [
              {
                x: 0,
                y: 0,
              },
              {
                x: -2.4,
                y: 0,
              },
              {
                x: 2.4,
                y: 0,
              },
              {
                x: 0,
                y: -2.4,
              },
              {
                x: 0,
                y: 2.4,
              },
            ],
          },
        },
        {
          id: 'rain_focus',
          telegraphMs: 520,
          telegraphJitterMs: 0,
          activeMs: 90,
          recoveryMs: 260,
          range: 4.8,
          arcDeg: 52,
          damage: 20,
          lungeDistance: 0.2,
          parryable: true,
          kind: 'melee',
        },
        {
          id: 'rain_diagonal',
          telegraphMs: 420,
          telegraphJitterMs: 0,
          activeMs: 80,
          recoveryMs: 80,
          range: 0,
          arcDeg: 360,
          damage: 18,
          lungeDistance: 0,
          parryable: false,
          kind: 'rain',
          rain: {
            impactDelayMs: 1250,
            impactRadius: 0.78,
            offsets: [
              {
                x: 0,
                y: 0,
              },
              {
                x: -1.75,
                y: -1.75,
              },
              {
                x: 1.75,
                y: -1.75,
              },
              {
                x: -1.75,
                y: 1.75,
              },
              {
                x: 1.75,
                y: 1.75,
              },
            ],
          },
        },
        {
          id: 'rain_ring',
          telegraphMs: 420,
          telegraphJitterMs: 0,
          activeMs: 80,
          recoveryMs: 80,
          range: 0,
          arcDeg: 360,
          damage: 18,
          lungeDistance: 0,
          parryable: false,
          kind: 'rain',
          rain: {
            impactDelayMs: 1250,
            impactRadius: 0.78,
            offsets: [
              {
                x: 0,
                y: 2.15,
              },
              {
                x: 2.04,
                y: 0.66,
              },
              {
                x: 1.26,
                y: -1.74,
              },
              {
                x: -1.26,
                y: -1.74,
              },
              {
                x: -2.04,
                y: 0.66,
              },
            ],
          },
        },
        {
          id: 'rain_cross_tight',
          telegraphMs: 420,
          telegraphJitterMs: 0,
          activeMs: 80,
          recoveryMs: 80,
          range: 0,
          arcDeg: 360,
          damage: 18,
          lungeDistance: 0,
          parryable: false,
          kind: 'rain',
          rain: {
            impactDelayMs: 950,
            impactRadius: 0.78,
            offsets: [
              {
                x: 0,
                y: 0,
              },
              {
                x: -2.4,
                y: 0,
              },
              {
                x: 2.4,
                y: 0,
              },
              {
                x: 0,
                y: -2.4,
              },
              {
                x: 0,
                y: 2.4,
              },
            ],
          },
        },
        {
          id: 'rain_diagonal_tight',
          telegraphMs: 420,
          telegraphJitterMs: 0,
          activeMs: 80,
          recoveryMs: 80,
          range: 0,
          arcDeg: 360,
          damage: 18,
          lungeDistance: 0,
          parryable: false,
          kind: 'rain',
          rain: {
            impactDelayMs: 950,
            impactRadius: 0.78,
            offsets: [
              {
                x: 0,
                y: 0,
              },
              {
                x: -1.75,
                y: -1.75,
              },
              {
                x: 1.75,
                y: -1.75,
              },
              {
                x: -1.75,
                y: 1.75,
              },
              {
                x: 1.75,
                y: 1.75,
              },
            ],
          },
        },
        {
          id: 'rain_ring_tight',
          telegraphMs: 420,
          telegraphJitterMs: 0,
          activeMs: 80,
          recoveryMs: 80,
          range: 0,
          arcDeg: 360,
          damage: 18,
          lungeDistance: 0,
          parryable: false,
          kind: 'rain',
          rain: {
            impactDelayMs: 950,
            impactRadius: 0.78,
            offsets: [
              {
                x: 0,
                y: 2.15,
              },
              {
                x: 2.04,
                y: 0.66,
              },
              {
                x: 1.26,
                y: -1.74,
              },
              {
                x: -1.26,
                y: -1.74,
              },
              {
                x: -2.04,
                y: 0.66,
              },
            ],
          },
        },
      ],
      attackPattern: [
        0,
        1,
        2,
        1,
        3,
        1,
      ],
      attackPatternPhaseTwo: [
        4,
        1,
        5,
        1,
        6,
        1,
      ],
      attackCooldownMs: 140,
      attackCooldownJitterMs: 0,
      staggerMs: 1350,
    },


    glass_regent: {
      archetype: 'glass_regent',
      boss: {
        name: 'THE GLASS REGENT',
        entranceFallMs: 720,
        introRoarMs: 980,
        phaseTwoHpFraction: 0.5,
        phaseRoarMs: 920,
      },
      maxHp: 620,
      maxPoise: 420,
      poiseRegenPerSec: 14,
      moveSpeed: 3,
      acceleration: 26,
      turnRate: 6,
      radius: 0.58,
      knockbackScale: 0,
      preferredRange: 2.6,
      attackRange: 3.4,
      volley: {
        integrity: 6,
        maxLive: [
          1,
          1,
        ],
        speedScalePerReturn: 1.07,
        shatterDamage: 34,
        shatterStaggerMs: 7000,
        shardLifeMs: 6000,
        shockwave: {
          cornerRadius: 5.4,
          damage: 18,
          openingShoveMs: 620,
        },
        wardRadius: 2,
        wardPushDistance: 2.2,
        wardPushMs: 280,
        reserveCooldownMs: 260,
        homingRateRad: 1.8,
        wardPushCooldownMs: 700,
        rebukeMs: 300,
      },
      attacks: [
        {
          id: 'glass_regent_slam',
          telegraphMs: 1900,
          telegraphJitterMs: 0,
          activeMs: 120,
          recoveryMs: 380,
          range: 0,
          arcDeg: 360,
          damage: 26,
          lungeDistance: 0,
          parryable: false,
          kind: 'shockwave',
          tell: 'chop',
        },
        {
          id: 'glass_regent_serve',
          telegraphMs: 760,
          telegraphJitterMs: 0,
          activeMs: 90,
          recoveryMs: 420,
          range: 0,
          arcDeg: 0,
          damage: 16,
          lungeDistance: 0,
          parryable: true,
          kind: 'volley',
          projectileSpeed: 11,
          tell: 'thrust',
        },
        {
          id: 'glass_regent_quick_serve',
          telegraphMs: 420,
          telegraphJitterMs: 0,
          activeMs: 80,
          recoveryMs: 240,
          range: 0,
          arcDeg: 0,
          damage: 16,
          lungeDistance: 0,
          parryable: true,
          kind: 'volley',
          projectileSpeed: 13,
          tell: 'jab',
        },
        {
          id: 'glass_regent_cleave',
          telegraphMs: 640,
          telegraphJitterMs: 0,
          activeMs: 120,
          recoveryMs: 760,
          range: 2.8,
          arcDeg: 200,
          damage: 30,
          lungeDistance: 0.9,
          parryable: false,
          kind: 'melee',
          tell: 'chop',
        },
      ],
      attackPattern: [
        1,
        1,
        1,
      ],
      attackPatternPhaseTwo: [
        2,
        2,
        2,
      ],
      attackCooldownMs: 800,
      attackCooldownJitterMs: 0,
      staggerMs: 1400,
    },
    queen: {
      archetype: 'queen',
      boss: {
        name: 'THE QUEEN',
        entranceFallMs: 720,
        introRoarMs: 980,
        phaseTwoHpFraction: 0.5,
        phaseRoarMs: 920,
        phaseThreeHpFraction: 0.25,
      },
      maxHp: 880,
      maxPoise: 460,
      poiseRegenPerSec: 18,
      moveSpeed: 4.6,
      acceleration: 40,
      turnRate: 8.5,
      radius: 0.56,
      knockbackScale: 1.15,
      preferredRange: 3,
      attackRange: 3.5,
      attacks: [
        {
          id: 'queen_decree_thrust',
          telegraphMs: 460,
          telegraphJitterMs: 0,
          activeMs: 90,
          recoveryMs: 300,
          range: 3.3,
          arcDeg: 46,
          damage: 18,
          lungeDistance: 1.5,
          parryable: true,
          kind: 'melee',
          tell: 'thrust',
        },
        {
          id: 'queen_decree_chop',
          telegraphMs: 400,
          telegraphJitterMs: 0,
          activeMs: 90,
          recoveryMs: 280,
          range: 3,
          arcDeg: 64,
          damage: 22,
          lungeDistance: 1.1,
          parryable: true,
          kind: 'melee',
          tell: 'chop',
        },
        {
          id: 'queen_decree_close',
          telegraphMs: 520,
          telegraphJitterMs: 0,
          activeMs: 100,
          recoveryMs: 780,
          range: 2.9,
          arcDeg: 120,
          damage: 26,
          lungeDistance: 1.3,
          parryable: true,
          kind: 'melee',
          tell: 'sweep',
        },
        {
          id: 'queen_decree_feint',
          telegraphMs: 620,
          telegraphJitterMs: 0,
          feint: {
            atMs: 300,
            resetMs: 200,
          },
          activeMs: 90,
          recoveryMs: 300,
          range: 3.3,
          arcDeg: 46,
          damage: 18,
          lungeDistance: 1.5,
          parryable: true,
          kind: 'melee',
          tell: 'thrust',
        },
        {
          id: 'queen_twin_open',
          telegraphMs: 320,
          telegraphJitterMs: 0,
          activeMs: 80,
          recoveryMs: 240,
          range: 3,
          arcDeg: 70,
          damage: 18,
          lungeDistance: 1,
          parryable: true,
          kind: 'melee',
          tell: 'chop',
        },
        {
          id: 'queen_twin_cross',
          telegraphMs: 280,
          telegraphJitterMs: 0,
          activeMs: 80,
          recoveryMs: 220,
          range: 3.4,
          arcDeg: 52,
          damage: 20,
          lungeDistance: 2.2,
          parryable: true,
          kind: 'melee',
          tell: 'thrust',
        },
        {
          id: 'queen_crescent_low',
          telegraphMs: 560,
          telegraphJitterMs: 0,
          activeMs: 110,
          recoveryMs: 420,
          range: 2.7,
          arcDeg: 200,
          damage: 30,
          lungeDistance: 0.8,
          parryable: false,
          kind: 'melee',
          tell: 'sweep',
        },
        {
          id: 'queen_twin_close',
          telegraphMs: 300,
          telegraphJitterMs: 0,
          activeMs: 90,
          recoveryMs: 700,
          range: 3.1,
          arcDeg: 74,
          damage: 22,
          lungeDistance: 1.2,
          parryable: true,
          kind: 'melee',
          tell: 'chop',
        },
        {
          id: 'queen_last_decree_rain',
          telegraphMs: 700,
          telegraphJitterMs: 0,
          activeMs: 90,
          recoveryMs: 200,
          range: 0,
          arcDeg: 360,
          damage: 20,
          lungeDistance: 0,
          parryable: false,
          kind: 'rain',
          rain: {
            impactDelayMs: 1100,
            impactRadius: 0.8,
            offsets: [
              {
                x: 0,
                y: 2.3,
              },
              {
                x: 1.99,
                y: 1.15,
              },
              {
                x: 1.99,
                y: -1.15,
              },
              {
                x: 0,
                y: -2.3,
              },
              {
                x: -1.99,
                y: -1.15,
              },
              {
                x: -1.99,
                y: 1.15,
              },
            ],
          },
        },
        {
          id: 'queen_glaive_sweep',
          telegraphMs: 520,
          telegraphJitterMs: 0,
          activeMs: 120,
          recoveryMs: 380,
          range: 3,
          arcDeg: 230,
          damage: 32,
          lungeDistance: 1.6,
          parryable: false,
          kind: 'melee',
          tell: 'sweep',
        },
        {
          id: 'queen_glaive_riposte',
          telegraphMs: 260,
          telegraphJitterMs: 0,
          activeMs: 80,
          recoveryMs: 900,
          range: 3.5,
          arcDeg: 48,
          damage: 24,
          lungeDistance: 2.4,
          parryable: true,
          kind: 'melee',
          tell: 'thrust',
        },
        {
          id: 'queen_last_decree_rain_tight',
          telegraphMs: 640,
          telegraphJitterMs: 0,
          activeMs: 90,
          recoveryMs: 200,
          range: 0,
          arcDeg: 360,
          damage: 20,
          lungeDistance: 0,
          parryable: false,
          kind: 'rain',
          rain: {
            impactDelayMs: 850,
            impactRadius: 0.8,
            offsets: [
              {
                x: 0,
                y: 1.7,
              },
              {
                x: 1.47,
                y: 0.85,
              },
              {
                x: 1.47,
                y: -0.85,
              },
              {
                x: 0,
                y: -1.7,
              },
              {
                x: -1.47,
                y: -0.85,
              },
              {
                x: -1.47,
                y: 0.85,
              },
            ],
          },
        },
      ],
      attackCooldownMs: 900,
      attackCooldownJitterMs: 0,
      staggerMs: 1250,
      sequence: {
        attackIndices: [
          0,
          1,
          2,
        ],
        altAttackIndices: [
          3,
          1,
          2,
        ],
        repositionMs: 560,
        orbitRadius: 3,
        angleStepRad: 2.0943951023931953,
        idleOrbitScale: 0.85,
        movements: [
          {
            attackIndices: [
              4,
              5,
              6,
              7,
            ],
            altAttackIndices: [
              4,
              6,
              5,
              7,
            ],
            repositionMs: 380,
            orbitRadius: 2.6,
            angleStepRad: 1.2566370614359172,
            moveSpeedScale: 1.25,
          },
          {
            attackIndices: [
              8,
              9,
              10,
            ],
            altAttackIndices: [
              11,
              9,
              10,
            ],
            repositionMs: 300,
            orbitRadius: 3.2,
            angleStepRad: 2.6179938779914944,
            moveSpeedScale: 1.45,
          },
        ],
      },
    },


    thorn_marshal: {
      archetype: 'thorn_marshal',
      boss: {
        name: 'THORN MARSHAL',
        entranceFallMs: 720,
        introRoarMs: 980,
        phaseTwoHpFraction: 0.5,
        phaseRoarMs: 920,
      },
      maxHp: 700,
      maxPoise: 420,
      poiseRegenPerSec: 16,
      moveSpeed: 2.9,
      acceleration: 16,
      turnRate: 2.4,
      radius: 0.58,
      preferredRange: 3.6,
      attackRange: 4.0,
      attacks: [
        {
          id: 'pike_boss_thrust',
          telegraphMs: 640,
          telegraphJitterMs: 0,
          activeMs: 90,
          recoveryMs: 660,
          range: 3.9,
          arcDeg: 32,
          damage: 20,
          lungeDistance: 1.6,
          parryable: true,
          kind: 'melee',
          tell: 'thrust',
        },
        {
          id: 'pike_boss_sweep',
          telegraphMs: 780,
          telegraphJitterMs: 0,
          activeMs: 120,
          recoveryMs: 620,
          range: 3.2,
          arcDeg: 150,
          damage: 24,
          lungeDistance: 0.5,
          parryable: false,
          kind: 'melee',
          tell: 'sweep',
        },
        {
          id: 'pike_boss_drive',
          telegraphMs: 820,
          telegraphJitterMs: 0,
          activeMs: 110,
          recoveryMs: 780,
          range: 3.4,
          arcDeg: 44,
          damage: 26,
          lungeDistance: 3.4,
          parryable: true,
          kind: 'melee',
          tell: 'chop',
        },
      ],
      attackPattern: [
        0,
        0,
        1,
      ],
      attackPatternPhaseTwo: [
        2,
        0,
        1,
        0,
      ],
      attackCooldownMs: 1100,
      attackCooldownJitterMs: 0,
      staggerMs: 1350,
    },
  },
  maxSimultaneousAttackers: 2,
  projectileRadius: 0.18,
  projectileLifeMs: 3000,
  friendlyFire: { melee: false, projectiles: false, poise: false },
  power: 'lightning',
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
      range: 5,
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
      distance: 5,
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
      range: 7,
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
} as unknown as CombatConfig;

export const PUBLIC_SLOWMO: SlowMoConfig = {
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

const siegeWave = (
  id: string,
  spawns: Array<{
    archetype: 'guard' | 'duelist' | 'archer';
    at: { x: number; y: number };
  }>,
) => ({ id, atMs: null, spawns });

const NORTH = { x: 0, y: -6 };
const NE = { x: 6, y: -5 };
const NW = { x: -6, y: -5 };
const EAST = { x: 8, y: 0 };
const WEST = { x: -8, y: 0 };

export const PUBLIC_ENCOUNTERS: Readonly<Record<string, EncounterDef>> = {


  tutorial_fundamentals: {
    "id": "tutorial_fundamentals",
    "description": "Tutorial experiment: movement, aim, light and heavy attacks.",
    "arena": {
      "halfExtents": {
        "x": 10,
        "y": 7
      },
      "vertices": [
        {
          "x": -6.5,
          "y": -7
        },
        {
          "x": 6.5,
          "y": -7
        },
        {
          "x": 10,
          "y": -3.5
        },
        {
          "x": 10,
          "y": 3.5
        },
        {
          "x": 6.5,
          "y": 7
        },
        {
          "x": -6.5,
          "y": 7
        },
        {
          "x": -10,
          "y": 3.5
        },
        {
          "x": -10,
          "y": -3.5
        }
      ]
    },
    "playerStart": {
      "x": 0,
      "y": 0
    },
    "waves": [
      {
        "id": "practice",
        "atMs": 0,
        "spawns": [
          {
            "archetype": "guard",
            "at": {
              "x": 4,
              "y": 0
            }
          }
        ]
      }
    ],
    "timeLimitMs": null,
    "tutorial": "fundamentals"
  },
  tutorial_defense: {
    "id": "tutorial_defense",
    "description": "Tutorial experiment: guard, perfect parry and step.",
    "arena": {
      "halfExtents": {
        "x": 10,
        "y": 7
      },
      "vertices": [
        {
          "x": -6.5,
          "y": -7
        },
        {
          "x": 6.5,
          "y": -7
        },
        {
          "x": 10,
          "y": -3.5
        },
        {
          "x": 10,
          "y": 3.5
        },
        {
          "x": 6.5,
          "y": 7
        },
        {
          "x": -6.5,
          "y": 7
        },
        {
          "x": -10,
          "y": 3.5
        },
        {
          "x": -10,
          "y": -3.5
        }
      ]
    },
    "playerStart": {
      "x": -2,
      "y": 0
    },
    "waves": [
      {
        "id": "teacher",
        "atMs": 0,
        "spawns": [
          {
            "archetype": "guard",
            "at": {
              "x": 2,
              "y": 0
            }
          }
        ]
      }
    ],
    "timeLimitMs": null,
    "tutorial": "defense"
  },
  tutorial_focus: {
    "id": "tutorial_focus",
    "description": "Tutorial experiment: earn and spend player-controlled Instante Real.",
    "arena": {
      "halfExtents": {
        "x": 10,
        "y": 7
      },
      "vertices": [
        {
          "x": -6.5,
          "y": -7
        },
        {
          "x": 6.5,
          "y": -7
        },
        {
          "x": 10,
          "y": -3.5
        },
        {
          "x": 10,
          "y": 3.5
        },
        {
          "x": 6.5,
          "y": 7
        },
        {
          "x": -6.5,
          "y": 7
        },
        {
          "x": -10,
          "y": 3.5
        },
        {
          "x": -10,
          "y": -3.5
        }
      ]
    },
    "playerStart": {
      "x": -2,
      "y": 0
    },
    "waves": [
      {
        "id": "teacher",
        "atMs": 0,
        "spawns": [
          {
            "archetype": "guard",
            "at": {
              "x": 2,
              "y": 0
            }
          }
        ]
      }
    ],
    "timeLimitMs": null,
    "tutorial": "focus"
  },
  tutorial_power: {
    "id": "tutorial_power",
    "description": "Tutorial experiment: use the currently equipped experimental power.",
    "arena": {
      "halfExtents": {
        "x": 10,
        "y": 7
      },
      "vertices": [
        {
          "x": -6.5,
          "y": -7
        },
        {
          "x": 6.5,
          "y": -7
        },
        {
          "x": 10,
          "y": -3.5
        },
        {
          "x": 10,
          "y": 3.5
        },
        {
          "x": 6.5,
          "y": 7
        },
        {
          "x": -6.5,
          "y": 7
        },
        {
          "x": -10,
          "y": 3.5
        },
        {
          "x": -10,
          "y": -3.5
        }
      ]
    },
    "playerStart": {
      "x": -2,
      "y": 0
    },
    "waves": [
      {
        "id": "targets",
        "atMs": 0,
        "spawns": [
          {
            "archetype": "guard",
            "at": {
              "x": 2,
              "y": 0
            }
          },
          {
            "archetype": "guard",
            "at": {
              "x": 3,
              "y": -1.5
            }
          },
          {
            "archetype": "guard",
            "at": {
              "x": 3,
              "y": 1.5
            }
          }
        ]
      }
    ],
    "timeLimitMs": null,
    "tutorial": "power"
  },
  wayfarer_court: {
    id: 'wayfarer_court',
    description: 'Exploration hub: dialogue, quest acceptance and return.',
    exploration: true,
    arena: {
      halfExtents: {
        x: 10,
        y: 7,
      },
      vertices: [
        {
          x: -6.5,
          y: -7,
        },
        {
          x: 6.5,
          y: -7,
        },
        {
          x: 10,
          y: -3.5,
        },
        {
          x: 10,
          y: 3.5,
        },
        {
          x: 6.5,
          y: 7,
        },
        {
          x: -6.5,
          y: 7,
        },
        {
          x: -10,
          y: 3.5,
        },
        {
          x: -10,
          y: -3.5,
        },
      ],
    },
    playerStart: {
      x: -2,
      y: 0,
    },
    waves: [],
    timeLimitMs: null,
  },
  kernel_guard: {
    id: 'kernel_guard',
    description: 'One guard, untimed. The single-enemy combat kernel (Phase 1).',
    arena: {
      halfExtents: {
        x: 10,
        y: 7,
      },
      vertices: [
        {
          x: -6.5,
          y: -7,
        },
        {
          x: 6.5,
          y: -7,
        },
        {
          x: 10,
          y: -3.5,
        },
        {
          x: 10,
          y: 3.5,
        },
        {
          x: 6.5,
          y: 7,
        },
        {
          x: -6.5,
          y: 7,
        },
        {
          x: -10,
          y: 3.5,
        },
        {
          x: -10,
          y: -3.5,
        },
      ],
    },
    playerStart: {
      x: -3,
      y: 0,
    },
    waves: [
      {
        id: 'w1',
        atMs: 0,
        spawns: [
          {
            archetype: 'guard',
            at: {
              x: 3,
              y: 0,
            },
          },
        ],
      },
    ],
    timeLimitMs: null,
  },
  kernel_duelist: {
    id: 'kernel_duelist',
    description: 'One duelist, untimed. Rhythm will not save you; reading will.',
    arena: {
      halfExtents: {
        x: 8.221909118783408,
        y: 6.394818203498206,
      },
      vertices: [
        {
          x: 2.847156501530601,
          y: -6.394818203498206,
        },
        {
          x: 8.221909118783408,
          y: 3.6606297876822014,
        },
        {
          x: -2.847156501530601,
          y: 6.394818203498206,
        },
        {
          x: -8.221909118783408,
          y: -3.6606297876822014,
        },
      ],
    },
    playerStart: {
      x: -3,
      y: 0,
    },
    waves: [
      {
        id: 'w1',
        atMs: 0,
        spawns: [
          {
            archetype: 'duelist',
            at: {
              x: 3,
              y: 0,
            },
          },
        ],
      },
    ],
    timeLimitMs: null,
  },
  spacing_archer: {
    id: 'spacing_archer',
    description: 'One guard and one archer. Melee pressure with a stand-off threat.',
    arena: {
      halfExtents: {
        x: 10.336618828644992,
        y: 8.3743168713208,
      },
      vertices: [
        {
          x: -9.56966182624128,
          y: -2.901994578110101,
        },
        {
          x: 5.465420106333255,
          y: -8.3743168713208,
        },
        {
          x: 10.336618828644992,
          y: -3.762221576582356,
        },
        {
          x: 9.56966182624128,
          y: 2.901994578110101,
        },
        {
          x: -5.465420106333255,
          y: 8.3743168713208,
        },
        {
          x: -10.336618828644992,
          y: 3.762221576582356,
        },
      ],
    },
    playerStart: {
      x: 1.3680805733026749,
      y: 3.7587704831436337,
    },
    waves: [
      {
        id: 'w1',
        atMs: 0,
        spawns: [
          {
            archetype: 'guard',
            at: {
              x: -1.0260604299770062,
              y: -2.8190778623577253,
            },
          },
          {
            archetype: 'archer',
            at: {
              x: -8.287949062129702,
              y: -2.3043221006498618,
            },
          },
        ],
      },
    ],
    timeLimitMs: null,
  },
  overlap_court: {
    id: 'overlap_court',
    description: 'Guards, then a duelist mid-fight, then an archer. Density escalation.',
    arena: {
      halfExtents: {
        x: 10,
        y: 8,
      },
      outline: [
        {
          x: -10,
          y: -8,
        },
        {
          x: -1,
          y: -8,
        },
        {
          x: -1,
          y: -3,
        },
        {
          x: 3,
          y: -3,
        },
        {
          x: 3,
          y: 1.5,
        },
        {
          x: 10,
          y: 1.5,
        },
        {
          x: 10,
          y: 8,
        },
        {
          x: 0,
          y: 8,
        },
        {
          x: 0,
          y: 0,
        },
        {
          x: -10,
          y: 0,
        },
      ],
      regions: [
        [
          {
            x: -10,
            y: -8,
          },
          {
            x: -1,
            y: -8,
          },
          {
            x: -1,
            y: 0,
          },
          {
            x: -10,
            y: 0,
          },
        ],
        [
          {
            x: -2,
            y: -3,
          },
          {
            x: 3,
            y: -3,
          },
          {
            x: 3,
            y: 0,
          },
          {
            x: -2,
            y: 0,
          },
        ],
        [
          {
            x: 0,
            y: -3,
          },
          {
            x: 3,
            y: -3,
          },
          {
            x: 3,
            y: 3.5,
          },
          {
            x: 0,
            y: 3.5,
          },
        ],
        [
          {
            x: 0,
            y: 1.5,
          },
          {
            x: 10,
            y: 1.5,
          },
          {
            x: 10,
            y: 8,
          },
          {
            x: 0,
            y: 8,
          },
        ],
      ],
      gates: [
        {
          id: 'lower_room',
          from: {
            x: -1.5,
            y: -3,
          },
          to: {
            x: -1.5,
            y: 0,
          },
          lockUntilWaveCleared: 'w1',
        },
        {
          id: 'upper_room',
          from: {
            x: 0,
            y: 2.5,
          },
          to: {
            x: 3,
            y: 2.5,
          },
          lockUntilWaveCleared: 'w2',
        },
      ],
    },
    playerStart: {
      x: -6,
      y: -4,
    },
    waves: [
      {
        id: 'w1',
        atMs: 0,
        spawns: [
          {
            archetype: 'guard',
            at: {
              x: -4,
              y: -5,
            },
          },
          {
            archetype: 'guard',
            at: {
              x: -7,
              y: -3,
            },
          },
        ],
      },
      {
        id: 'w2',
        atMs: null,
        spawns: [
          {
            archetype: 'duelist',
            at: {
              x: 1.5,
              y: 0.8,
            },
          },
        ],
      },
      {
        id: 'w3',
        atMs: null,
        spawns: [
          {
            archetype: 'archer',
            at: {
              x: 7,
              y: 5,
            },
          },
          {
            archetype: 'guard',
            at: {
              x: 4,
              y: 4,
            },
          },
        ],
      },
      {
        id: 'w4',
        atMs: null,
        spawns: [
          {
            archetype: 'duelist',
            at: {
              x: 7,
              y: 4,
            },
          },
        ],
      },
    ],
    timeLimitMs: 120000,
  },
  upper_hall: {
    id: 'upper_hall',
    description: 'Exploration destination beyond the protected passage.',
    exploration: true,
    arena: {
      halfExtents: {
        x: 10,
        y: 7,
      },
      vertices: [
        {
          x: -7,
          y: -7,
        },
        {
          x: 7,
          y: -7,
        },
        {
          x: 10,
          y: -4,
        },
        {
          x: 10,
          y: 4,
        },
        {
          x: 7,
          y: 7,
        },
        {
          x: -7,
          y: 7,
        },
        {
          x: -10,
          y: 4,
        },
        {
          x: -10,
          y: -4,
        },
      ],
      elevationRamp: {
        axis: 'y',
        from: 1.4,
        to: -1.4,
        height: 0.9,
        steps: 7,
      },
    },
    playerStart: {
      x: 0,
      y: 4.8,
    },
    waves: [],
    timeLimitMs: null,
  },

  siege_10: {
    id: 'siege_10',
    description: 'Ten waves, each after the last is cleared. Does mastery survive duration?',
    arena: {
      halfExtents: { x: 10, y: 7 },
      vertices: [
        { x: -7, y: -7 },
        { x: 7, y: -7 },
        { x: 10, y: -4 },
        { x: 10, y: 4 },
        { x: 7, y: 7 },
        { x: -7, y: 7 },
        { x: -10, y: 4 },
        { x: -10, y: -4 },
      ],
      elevationRamp: {
        axis: 'y',
        from: 1.4,
        to: -1.4,
        height: 0.9,
        steps: 7,
      },
    },
    playerStart: { x: 0, y: 5 },
    waves: [
      siegeWave('w01', [{ archetype: 'guard', at: NORTH }]),
      siegeWave('w02', [
        { archetype: 'guard', at: NW },
        { archetype: 'guard', at: NE },
      ]),
      siegeWave('w03', [
        { archetype: 'guard', at: NORTH },
        { archetype: 'guard', at: WEST },
        { archetype: 'guard', at: EAST },
      ]),
      siegeWave('w04', [{ archetype: 'duelist', at: NORTH }]),
      siegeWave('w05', [
        { archetype: 'duelist', at: NW },
        { archetype: 'guard', at: NE },
      ]),
      siegeWave('w06', [
        { archetype: 'duelist', at: WEST },
        { archetype: 'duelist', at: EAST },
      ]),
      siegeWave('w07', [
        { archetype: 'archer', at: NORTH },
        { archetype: 'guard', at: NE },
      ]),
      siegeWave('w08', [
        { archetype: 'archer', at: NW },
        { archetype: 'archer', at: NE },
        { archetype: 'guard', at: NORTH },
      ]),
      siegeWave('w09', [
        { archetype: 'archer', at: EAST },
        { archetype: 'duelist', at: WEST },
        { archetype: 'guard', at: NORTH },
      ]),
      siegeWave('w10', [
        { archetype: 'guard', at: NW },
        { archetype: 'guard', at: NE },
        { archetype: 'duelist', at: NORTH },
        { archetype: 'archer', at: WEST },
        { archetype: 'archer', at: EAST },
      ]),
    ],
    timeLimitMs: null,
  },
  first_blade: {
    id: 'first_blade',
    description: 'The First Blade: directional phrase, then five wall-to-wall fly-bys.',
    arena: { halfExtents: { x: 10, y: 7 } },
    playerStart: { x: 0, y: 0 },
    waves: [
      {
        id: 'first_blade',
        atMs: 0,
        spawns: [{ archetype: 'first_blade', at: { x: 0, y: -5 } }],
      },
    ],
    timeLimitMs: 120_000,
  },



  captain: {
    id: 'captain',
    description: 'Boss instrument: three honest reads, then a readable feint.',
    arena: {
      halfExtents: {
        x: 10,
        y: 7,
      },
    },
    playerStart: {
      x: 0,
      y: 0,
    },
    waves: [
      {
        id: 'response',
        atMs: 0,
        spawns: [
          {
            archetype: 'captain',
            at: {
              x: 0,
              y: -3.2,
            },
          },
        ],
      },
    ],
    timeLimitMs: 120000,
  },
  chancellor: {
    id: 'chancellor',
    description: 'Characterized arm of the rain instrument: the Chancellor.',
    arena: {
      halfExtents: {
        x: 10,
        y: 7,
      },
    },
    playerStart: {
      x: 0,
      y: 0,
    },
    waves: [
      {
        id: 'rain',
        atMs: 0,
        spawns: [
          {
            archetype: 'chancellor',
            at: {
              x: 0,
              y: -4,
            },
          },
        ],
      },
    ],
    timeLimitMs: 120000,
  },


  glass_regent: {
    id: 'glass_regent',
    description: 'The Glass Regent: a volley, and a ward that ends when the shard does.',
    arena: {
      halfExtents: {
        x: 10,
        y: 7,
      },
    },
    playerStart: {
      x: 0,
      y: 0,
    },
    waves: [
      {
        id: 'glass_regent',
        atMs: 0,
        spawns: [
          {
            archetype: 'glass_regent',
            at: {
              x: 0,
              y: -5,
            },
          },
        ],
      },
    ],
    timeLimitMs: 180000,
  },
  queen: {
    id: 'queen',
    description: 'The Queen: three acts — one blade, two blades, and the halo coming apart.',
    arena: {
      halfExtents: {
        x: 10,
        y: 7,
      },
    },
    playerStart: {
      x: 0,
      y: 0,
    },
    waves: [
      {
        id: 'queen',
        atMs: 0,
        spawns: [
          {
            archetype: 'queen',
            at: {
              x: 0,
              y: -5,
            },
          },
        ],
      },
    ],
    timeLimitMs: 180000,
  },

  thorn_marshal: {
    id: 'thorn_marshal',
    description: 'Characterized arm of the reach instrument: the Thorn Marshal.',
    arena: {
      halfExtents: {
        x: 10,
        y: 7,
      },
    },
    playerStart: {
      x: 0,
      y: 0,
    },
    waves: [
      {
        id: 'reach',
        atMs: 0,
        spawns: [
          {
            archetype: 'thorn_marshal',
            at: {
              x: 0,
              y: -4,
            },
          },
        ],
      },
    ],
    timeLimitMs: 120000,
  },
};

export type PublicEncounterId = string;

export const PUBLIC_SLOWMO_STATIC: SlowMoConfig = {
  ...PUBLIC_SLOWMO,
  mode: 'static',
  triggers: ['parry_streak', 'lethal_heavy', 'last_enemy', 'first_contact'],
  worldScale: 0.2,
  playerScale: 0.5,
  streakThreshold: 3,
  durationMs: 900,
  blendMs: 90,
  cooldownMs: 5200,
  maxPerEncounter: 3,
  endOnDecisiveAction: true,
};
export const PUBLIC_ENCOUNTER_IDS: readonly PublicEncounterId[] = [
  'siege_10',
  'first_blade',
];
export const PUBLIC_ENCOUNTER = PUBLIC_ENCOUNTERS.siege_10;

export const PUBLIC_PRESENTATION: ResolvedPresentation = {
  id: '',
  hud: {
    level: 'full',
    health: true,
    stamina: true,
    comboCounter: true,
    enemyHealth: true,
    damageNumbers: true,
    prompts: true,
    peripheral: true,
  },
  visual: {
    saturation: 1,
    contrast: 1,
    particleDensity: 1,
    screenEffects: 1,
    cameraEffects: 1,
    floorGrid: true,
    telegraphs: true,
    facingMarks: true,
  },
  audio: {
    density: 1,
    essentialCues: true,
    material: true,
    transient: true,
    tonal: true,
    pitchVariation: true,
    stereo: true,
    music: true,
    stems: { strings: true, choir: true, organ: true, percussion: true },
  },
  vignette: {
    amount: 0,
    shape: 'circular',
    maxCoverage: 0.45,
    feather: 0.55,
    closeMs: 2600,
    openMs: 700,
    breath: 0.5,
    pulseWithTiming: true,
    rhythmRelief: 0.6,
    threatWindows: false,
  },
  preserveThreatColors: true,
  audioEquivalents: true,
};
