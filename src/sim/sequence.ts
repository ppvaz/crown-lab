
import type { CombatConfig, Enemy, EnemyConfig, SequenceMovement, Vec2, World } from './types';
import { angleOf, sub } from './vec';
import { emit } from './events';

export const resetEnemySequence = (enemy: Enemy): void => {
  enemy.sequenceStep = -1;
  enemy.sequenceParries = 0;
  enemy.edgeStep = 0;
  enemy.glideTarget = undefined;
};

const alternates = (
  enemy: Enemy,
  primary: readonly number[],
  alt: readonly number[] | undefined,
): readonly number[] =>
  alt !== undefined && alt.length > 0 && (enemy.sequencePhrases ?? 1) % 2 === 0 ? alt : primary;

const movementFor = (enemy: Enemy, ecfg: EnemyConfig): SequenceMovement | undefined => {
  const movements = ecfg.sequence?.movements;
  if (movements === undefined || movements.length === 0) return undefined;
  const phase = enemy.phase ?? 1;
  if (phase < 2) return undefined;
  return movements[Math.min(phase - 2, movements.length - 1)];
};

const attacksFor = (enemy: Enemy, ecfg: EnemyConfig): readonly number[] => {
  const sequence = ecfg.sequence;
  if (sequence === undefined) return [];
  if (enemy.phase === 2 && sequence.phaseTwo !== undefined) {
    return sequence.phaseTwo.attackIndices;
  }
  const movement = movementFor(enemy, ecfg);
  if (movement !== undefined) {
    return alternates(enemy, movement.attackIndices, movement.altAttackIndices);
  }
  return alternates(enemy, sequence.attackIndices, sequence.altAttackIndices);
};

export const sequenceReposition = (enemy: Enemy, ecfg: EnemyConfig) => {
  const sequence = ecfg.sequence;
  if (sequence === undefined) return null;
  if (enemy.phase === 2 && sequence.phaseTwo !== undefined) {
    return {
      repositionMs: sequence.phaseTwo.repositionMs,
      orbitRadius: sequence.phaseTwo.orbitRadius,
      angleStepRad: sequence.phaseTwo.angleStepRad,
      moveSpeedScale: sequence.phaseTwo.moveSpeedScale,
    };
  }
  const movement = movementFor(enemy, ecfg);
  if (movement !== undefined) {
    return {
      repositionMs: movement.repositionMs,
      orbitRadius: movement.orbitRadius,
      angleStepRad: movement.angleStepRad,
      moveSpeedScale: movement.moveSpeedScale,
    };
  }
  return {
    repositionMs: sequence.repositionMs,
    orbitRadius: sequence.orbitRadius,
    angleStepRad: sequence.angleStepRad,
    moveSpeedScale: 1,
  };
};

export const startEnemySequence = (
  targetPos: Vec2,
  enemy: Enemy,
  ecfg: EnemyConfig,
): number | null => {
  const sequence = ecfg.sequence;
  if (sequence === undefined || sequence.attackIndices.length === 0) return null;
  enemy.sequencePhrases = (enemy.sequencePhrases ?? 0) + 1;
  const attacks = attacksFor(enemy, ecfg);
  if (attacks.length === 0) return null;
  enemy.sequenceStep = 0;
  enemy.sequenceParries = 0;
  enemy.sequenceAngle = angleOf(sub(enemy.pos, targetPos));
  enemy.edgeStep = 0;
  return attacks[0] ?? null;
};

export const continueEnemySequence = (
  world: World,
  enemy: Enemy,
  cfg: CombatConfig,
  reason: 'parry' | 'attack_completed',
): boolean => {
  const sequence = cfg.enemies[enemy.archetype].sequence;
  if (sequence === undefined || (enemy.sequenceStep ?? -1) < 0) return false;
  const ecfg = cfg.enemies[enemy.archetype];
  const attacks = attacksFor(enemy, ecfg);
  const reposition = sequenceReposition(enemy, ecfg);
  if (reposition === null) return false;

  const nextStep = (enemy.sequenceStep ?? -1) + 1;
  const nextAttack = attacks[nextStep];
  if (nextAttack === undefined) {
    resetEnemySequence(enemy);
    return false;
  }

  enemy.sequenceStep = nextStep;
  enemy.sequenceAngle = (enemy.sequenceAngle ?? 0) + reposition.angleStepRad;
  enemy.state = {
    kind: 'sequence_reposition',
    enteredTick: world.tick,
    elapsedMs: 0,
    attackIndex: nextAttack,
    telegraphJitterMs: 0,
    struck: [],
  };
  emit(world, 'enemy_sequence_step', {
    actor: enemy.id,
    data: {
      step: nextStep + 1,
      total: attacks.length,
      attackId: cfg.enemies[enemy.archetype].attacks[nextAttack]?.id ?? 'unknown',
      angle: enemy.sequenceAngle,
      reason,
    },
  });
  return true;
};
