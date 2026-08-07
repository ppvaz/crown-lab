
import type {
  CombatConfig,
  Intent,
  Ms,
  Pickup,
  PickupKind,
  Player,
  PowerKind,
  SimEvent,
  Vec2,
  World,
} from './types';
import { nextFloat } from './rng';
import { clampToArena } from './arena';
import { dist } from './vec';
import { emit } from './events';

const rollable = (world: World, cfg: CombatConfig, archetype: unknown): boolean => {
  if (typeof archetype !== 'string') return false;
  const enemy = (cfg.enemies as Record<string, { boss?: unknown } | undefined>)[archetype];
  if (enemy === undefined) return false;
  return cfg.drops.bossesDrop || enemy.boss === undefined;
};

const kindByWeight = (weights: Record<PickupKind, number>, roll: number): PickupKind | null => {
  const kinds: PickupKind[] = ['health', 'stamina', 'power'];
  const total = kinds.reduce((sum, kind) => sum + Math.max(0, weights[kind]), 0);
  if (total <= 0) return null;
  let cursor = roll * total;
  for (const kind of kinds) {
    cursor -= Math.max(0, weights[kind]);
    if (cursor < 0) return kind;
  }
  return kinds[kinds.length - 1];
};

const SWAPPABLE: readonly Exclude<PowerKind, 'none'>[] = [
  'lightning',
  'blink',
  'pull',
  'push',
  'freeze',
  'incinerate',
  'turncoat',
];

const rollDrop = (
  world: World,
  cfg: CombatConfig,
  at: Vec2,
): Pickup | null => {
  const happens = nextFloat(world.dropRng);
  const which = nextFloat(world.dropRng);
  const power = nextFloat(world.dropRng);
  if (happens >= cfg.drops.chance) return null;

  const kind = kindByWeight(cfg.drops.weights, which);
  if (kind === null) return null;
  const pos = clampToArena(world.arena, { ...at }, 0.4);
  return {
    id: world.nextId++,
    kind,
    pos,
    amount:
      kind === 'health'
        ? cfg.drops.healthAmount
        : kind === 'stamina'
          ? cfg.drops.staminaAmount
          : cfg.drops.powerAmount,
    offers: kind === 'power' ? offeredPower(cfg.power, power) : undefined,
    lifeMs: cfg.drops.lifeMs,
    totalLifeMs: cfg.drops.lifeMs,
  };
};

const offeredPower = (
  held: PowerKind,
  roll: number,
): Exclude<PowerKind, 'none'> => {
  const options = SWAPPABLE.filter((kind) => kind !== held);
  return options[Math.min(options.length - 1, Math.floor(roll * options.length))];
};

const deathPosition = (world: World, event: SimEvent): Vec2 | null => {
  const enemy = world.enemies.find((candidate) => candidate.id === event.actor);
  return enemy === undefined ? null : { ...enemy.pos };
};

export const powerPickupInReach = (
  world: World,
  cfg: CombatConfig,
  king: Player = world.players[0],
): Pickup | null => {
  if (king.id !== world.players[0].id || king.state.kind === 'dead') return null;
  const reach = cfg.player.radius + cfg.drops.pickupRadius;
  let best: Pickup | null = null;
  let bestDistance = reach;
  for (const pickup of world.pickups) {
    if (pickup.kind !== 'power') continue;
    const d = dist(king.pos, pickup.pos);
    if (d <= bestDistance) {
      best = pickup;
      bestDistance = d;
    }
  }
  return best;
};

export const stepPickups = (
  world: World,
  cfg: CombatConfig,
  intents: readonly Intent[],
  dtMs: Ms,
): void => {
  const deaths = world.events.filter((event) => event.type === 'enemy_died');
  for (const death of deaths) {
    if (!rollable(world, cfg, death.data?.archetype)) continue;
    const at = deathPosition(world, death);
    if (at === null) continue;
    const pickup = rollDrop(world, cfg, at);
    if (pickup === null) continue;
    world.pickups.push(pickup);
    emit(world, 'pickup_dropped', {
      actor: pickup.id,
      data: { kind: pickup.kind, x: pickup.pos.x, y: pickup.pos.y },
    });
  }

  if (world.pickups.length === 0) return;

  const player = world.players[0];
  const reach = cfg.player.radius + cfg.drops.pickupRadius;
  const confirmed =
    intents[0]?.interactPressed === true ? powerPickupInReach(world, cfg, player) : null;
  const survivors: Pickup[] = [];
  for (const pickup of world.pickups) {
    pickup.lifeMs -= dtMs;
    if (pickup.lifeMs <= 0) {
      emit(world, 'pickup_expired', { actor: pickup.id, data: { kind: pickup.kind } });
      continue;
    }
    const taken =
      pickup.kind === 'power'
        ? pickup === confirmed
        : player.state.kind !== 'dead' && dist(player.pos, pickup.pos) <= reach;
    if (taken) {
      applyPickup(world, player, cfg, pickup);
      continue;
    }
    survivors.push(pickup);
  }
  world.pickups = survivors;
};

const applyPickup = (
  world: World,
  player: Player,
  cfg: CombatConfig,
  pickup: Pickup,
): void => {
  let granted = pickup.amount;
  if (pickup.kind === 'health') {
    const before = player.hp;
    player.hp = Math.min(cfg.player.maxHp, before + pickup.amount);
    granted = player.hp - before;
  } else if (pickup.kind === 'stamina') {
    const before = player.stamina;
    player.stamina = Math.min(cfg.player.maxStamina, before + pickup.amount);
    granted = player.stamina - before;
  } else if (pickup.offers !== undefined) {





    const previous = cfg.power;
    cfg.power = pickup.offers;
    player.powerCooldownMs = 0;
    player.powerChannelMs = 0;
    granted = 0;
    emit(world, 'pickup_taken', {
      actor: pickup.id,
      target: player.id,
      data: {
        kind: pickup.kind,
        power: pickup.offers,
        replaced: previous,
        x: pickup.pos.x,
        y: pickup.pos.y,
      },
    });
    return;
  } else {
    granted = 0;
  }
  emit(world, 'pickup_taken', {
    actor: pickup.id,
    target: player.id,
    data: { kind: pickup.kind, amount: granted, x: pickup.pos.x, y: pickup.pos.y },
  });
};
