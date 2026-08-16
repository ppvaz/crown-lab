
import type { CombatConfig, Enemy, Ms, OverlapDef, World } from './types';
import { emit } from './events';

const leadFor = (
  world: World,
  cfg: CombatConfig,
  self: Enemy,
): { def: OverlapDef; lead: Enemy | null } | null => {
  const overlaps = cfg.overlaps;
  if (overlaps === undefined || overlaps.length === 0) return null;
  let fallback: OverlapDef | null = null;
  for (const def of overlaps) {
    if (def.follow !== self.archetype) continue;
    if (fallback === null) fallback = def;
    let best: Enemy | null = null;
    for (const other of world.enemies) {
      if (other.id === self.id) continue;
      if (other.archetype !== def.lead) continue;
      if (other.hp <= 0) continue;
      if (other.state.kind !== 'telegraph') continue;
      if (best === null || other.id < best.id) best = other;
    }
    if (best !== null) return { def, lead: best };
  }
  return fallback === null ? null : { def: fallback, lead: null };
};

const telegraphProgress = (lead: Enemy, cfg: CombatConfig): number => {
  const ecfg = cfg.enemies[lead.archetype];
  const def = ecfg?.attacks[lead.state.attackIndex];
  if (def === undefined) return 1;
  const total = def.telegraphMs + lead.state.telegraphJitterMs;
  if (total <= 0) return 1;
  return lead.state.elapsedMs / total;
};

export const overlapWithheld = (
  world: World,
  cfg: CombatConfig,
  self: Enemy,
  dtMs: Ms,
): boolean => {
  const found = leadFor(world, cfg, self);
  if (found === null) {
    self.overlapHeldMs = 0;
    return false;
  }
  const held = (self.overlapHeldMs ?? 0) + dtMs;
  self.overlapHeldMs = held;

  const onBeat =
    found.lead !== null && telegraphProgress(found.lead, cfg) >= found.def.atLeadTelegraph;
  const timedOut = held >= found.def.maxHoldMs;
  if (!onBeat && !timedOut) return true;

  self.overlapHeldMs = 0;
  emit(world, 'overlap_released', {
    actor: self.id,
    data: {
      overlapId: found.def.id,
      lead: onBeat && found.lead !== null ? found.lead.id : -1,
      leadArchetype: found.def.lead,
      followArchetype: found.def.follow,
      heldMs: Math.round(held),
      atLeadTelegraph: found.def.atLeadTelegraph,
      timedOut,
    },
  });
  return false;
};
