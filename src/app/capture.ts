
import type {
  CombatConfig,
  EncounterDef,
  Intent,
  SlowMoConfig,
  Vec2,
  World,
} from '../sim/types';
import { NEUTRAL_INTENT } from '../sim/types';
import { stepWorld } from '../sim/world';

export type CaptureShotId =
  | 'weapon-contact'
  | 'perfect-parry'
  | 'enemy-weapon-contact'
  | 'first-blade-entrance'
  | 'first-blade-room'
  | 'first-blade-phase-two'
  | 'first-blade-glide'
  | 'captain-direct'
  | 'captain-feint'
  | 'captain-pressure'
  | 'captain-release'
  | 'rain-field'
  | 'rain-overlap'
  | 'chancellor-room'
  | 'chancellor-lightning'
  | 'queen-regalia'
  | 'queen-unsworn'
  | 'queen-last-decree'
  | 'guard-shield'
  | 'guard-shield-back'
  | 'guard-shield-profile'
  | 'guard-shield-profile-rear'
  | 'arena-training'
  | 'mesh-guard'
  | 'mesh-guard-inspect'
  | 'arena-duel'
  | 'arena-crossfire'
  | 'arena-corner'
  | 'arena-stairs'
  | 'arena-rotated-rectangle'
  | 'herald-room'
  | 'route-guard-locked'
  | 'route-guard-open'
  | 'route-antechamber'
  | 'shape-gallery'
  | 'shape-twin-bowls'
  | 'shape-combat-bowl'
  | 'shape-cramped-keep'
  | 'maze-corner'
  | 'maze-portal-down'
  | 'maze-followed'
  | 'generated-chambers'
  | 'background-encounter'
  | 'concept-bell-court-empty'
  | 'concept-bell-court-combat'
  | 'concept-shattered-dais-empty'
  | 'concept-shattered-dais-combat'
  | 'concept-rain-breached-hall-empty'
  | 'concept-rain-breached-hall-combat'
  | 'concept-parallax-gallery-empty'
  | 'concept-parallax-gallery-combat'
  | 'concept-prop-gallery-empty'
  | 'concept-prop-gallery-combat'
  | 'concept-prop-gallery-solids'
  | 'concept-prop-gallery-flush'
  | 'concept-kit-gallery-empty'
  | 'concept-kit-gallery-combat'
  | 'concept-kit-gallery-desaturated'
  | 'concept-kit-gallery-floors'
  | 'concept-kit-gallery-walls'
  | 'concept-kit-gallery-windows'
  | 'concept-kit-gallery-details'
  | 'concept-clutter-gallery-empty'
  | 'concept-clutter-gallery-combat'
  | 'concept-clutter-gallery-desaturated'
  | 'concept-clutter-gallery-loyalty'
  | 'concept-clutter-gallery-absence'
  | 'concept-clutter-gallery-siege'
  | 'concept-clutter-gallery-service'
  | 'concept-lantern-cloister-empty'
  | 'concept-lantern-cloister-combat'
  | 'concept-lantern-cloister-desaturated'
  | 'concept-lantern-cloister-baked'
  | 'concept-lantern-cloister-live'
  | 'concept-lantern-cloister-storm'
  | 'concept-oath-gallery-empty'
  | 'concept-oath-gallery-combat'
  | 'concept-oath-gallery-desaturated'
  | 'concept-bell-court-desaturated'
  | 'concept-guard-procession-empty'
  | 'concept-guard-procession-combat'
  | 'concept-guard-procession-desaturated'
  | 'concept-violet-chancellery-empty'
  | 'concept-violet-chancellery-combat'
  | 'concept-violet-chancellery-desaturated'
  | 'concept-shattered-dais-desaturated'
  | 'concept-rookery-roofs-empty'
  | 'concept-rookery-roofs-combat'
  | 'concept-rookery-roofs-desaturated'
  | 'concept-chainbridge-court-empty'
  | 'concept-chainbridge-court-combat'
  | 'concept-chainbridge-court-desaturated'
  | 'concept-flooded-nave-empty'
  | 'concept-flooded-nave-combat'
  | 'concept-flooded-nave-desaturated'
  | 'concept-bell-foundry-empty'
  | 'concept-bell-foundry-combat'
  | 'concept-bell-foundry-desaturated'
  | 'concept-archive-spiral-empty'
  | 'concept-archive-spiral-combat'
  | 'concept-archive-spiral-desaturated'
  | 'concept-hollow-throne-empty'
  | 'concept-hollow-throne-combat'
  | 'concept-hollow-throne-desaturated';

export interface CaptureShot {
  id: CaptureShotId;
  encounterId:
    | 'first_blade'
    | 'captain'
    | 'queen'
    | 'projectile_rain_boss'
    | 'chancellor'
    | 'kernel_guard'
    | 'mesh_guard'
    | 'kernel_duelist'
    | 'court_45s'
    | 'overlap_court'
    | 'siege_10'
    | 'upper_hall'
    | 'wayfarer_court'
    | 'background_encounter'
    | 'rotated_rectangle'
    | 'shape_gallery'
    | 'shape_twin_bowls'
    | 'shape_combat_bowl'
    | 'shape_cramped_keep'
    | 'maze_serpentine'
    | 'concept_bell_court'
    | 'concept_shattered_dais'
    | 'concept_rain_breached_hall'
    | 'concept_parallax_gallery'
    | 'concept_prop_gallery'
    | 'concept_kit_gallery'
    | 'concept_clutter_gallery'
    | 'concept_lantern_cloister'
    | 'concept_lantern_cloister_baked'
    | 'concept_lantern_cloister_live'
    | 'concept_oath_gallery'
    | 'concept_guard_procession'
    | 'concept_violet_chancellery'
    | 'concept_rookery_roofs'
    | 'concept_chainbridge_court'
    | 'concept_flooded_nave'
    | 'concept_bell_foundry'
    | 'concept_archive_spiral'
    | 'concept_hollow_throne'
    | 'generated_chambers';
  combatId: 'Default';
  slowMoId: 'none';
  presentationId: 'Full' | 'Color_Drained';
  materialPack: 'none';
  modelBank: 'silhouette';
  seed: 1;
  route?: {
    nodeId: 'guardroom' | 'antechamber';
    cleared: boolean;
  };
  weather?: 'clear' | 'drizzle' | 'rain' | 'storm';
  inspection?: {
    focus: Vec2;
    zoomScale: number;
  };
}

const firstBladeShot = (id: CaptureShotId): CaptureShot => ({
  id,
  encounterId: 'first_blade',
  combatId: 'Default',
  slowMoId: 'none',
  presentationId: 'Full',
  materialPack: 'none',
  modelBank: 'silhouette',
  seed: 1,
});

const instrumentShot = (
  id: CaptureShotId,
  encounterId: 'captain' | 'projectile_rain_boss' | 'chancellor' | 'queen',
): CaptureShot => ({
  ...firstBladeShot(id),
  encounterId,
});

const arenaShot = (
  id: CaptureShotId,
  encounterId:
    | 'kernel_guard'
    | 'mesh_guard'
    | 'kernel_duelist'
    | 'court_45s'
    | 'overlap_court'
    | 'siege_10'
    | 'upper_hall'
    | 'wayfarer_court'
    | 'background_encounter'
    | 'rotated_rectangle'
    | 'shape_gallery'
    | 'shape_twin_bowls'
    | 'shape_combat_bowl'
    | 'shape_cramped_keep'
    | 'maze_serpentine'
    | 'concept_bell_court'
    | 'concept_shattered_dais'
    | 'concept_rain_breached_hall'
    | 'concept_parallax_gallery'
    | 'concept_prop_gallery'
    | 'concept_kit_gallery'
    | 'concept_clutter_gallery'
    | 'concept_lantern_cloister'
    | 'concept_lantern_cloister_baked'
    | 'concept_lantern_cloister_live'
    | 'concept_oath_gallery'
    | 'concept_guard_procession'
    | 'concept_violet_chancellery'
    | 'concept_rookery_roofs'
    | 'concept_chainbridge_court'
    | 'concept_flooded_nave'
    | 'concept_bell_foundry'
    | 'concept_archive_spiral'
    | 'concept_hollow_throne'
    | 'generated_chambers',
): CaptureShot => ({
  ...firstBladeShot(id),
  encounterId,
});

const drainedArenaShot = (
  id: CaptureShotId,
  encounterId: Parameters<typeof arenaShot>[1],
): CaptureShot => ({
  ...arenaShot(id, encounterId),
  presentationId: 'Color_Drained',
});

export const CAPTURE_SHOTS: Record<CaptureShotId, CaptureShot> = {
  'weapon-contact': arenaShot('weapon-contact', 'kernel_guard'),
  'perfect-parry': arenaShot('perfect-parry', 'kernel_guard'),
  'enemy-weapon-contact': arenaShot('enemy-weapon-contact', 'kernel_guard'),
  'first-blade-entrance': firstBladeShot('first-blade-entrance'),
  'first-blade-room': firstBladeShot('first-blade-room'),
  'first-blade-phase-two': firstBladeShot('first-blade-phase-two'),
  'first-blade-glide': firstBladeShot('first-blade-glide'),
  'captain-direct': instrumentShot('captain-direct', 'captain'),
  'captain-feint': instrumentShot('captain-feint', 'captain'),
  'captain-pressure': instrumentShot('captain-pressure', 'captain'),
  'captain-release': instrumentShot('captain-release', 'captain'),
  'rain-field': instrumentShot('rain-field', 'projectile_rain_boss'),
  'rain-overlap': instrumentShot('rain-overlap', 'projectile_rain_boss'),
  'chancellor-room': instrumentShot('chancellor-room', 'chancellor'),
  'chancellor-lightning': instrumentShot('chancellor-lightning', 'chancellor'),
  'queen-regalia': instrumentShot('queen-regalia', 'queen'),
  'queen-unsworn': instrumentShot('queen-unsworn', 'queen'),
  'queen-last-decree': instrumentShot('queen-last-decree', 'queen'),
  'guard-shield': arenaShot('guard-shield', 'kernel_guard'),
  'guard-shield-back': arenaShot('guard-shield-back', 'kernel_guard'),
  'guard-shield-profile': arenaShot('guard-shield-profile', 'kernel_guard'),
  'guard-shield-profile-rear': arenaShot('guard-shield-profile-rear', 'kernel_guard'),
  'arena-training': arenaShot('arena-training', 'kernel_guard'),
  'mesh-guard': arenaShot('mesh-guard', 'mesh_guard'),
  'mesh-guard-inspect': {
    ...arenaShot('mesh-guard-inspect', 'mesh_guard'),
    inspection: { focus: { x: 3, y: 0 }, zoomScale: 5 },
  },
  'arena-duel': arenaShot('arena-duel', 'kernel_duelist'),
  'arena-crossfire': arenaShot('arena-crossfire', 'court_45s'),
  'arena-corner': arenaShot('arena-corner', 'overlap_court'),
  'arena-stairs': arenaShot('arena-stairs', 'siege_10'),
  'arena-rotated-rectangle': arenaShot('arena-rotated-rectangle', 'rotated_rectangle'),
  'herald-room': arenaShot('herald-room', 'wayfarer_court'),
  'route-guard-locked': {
    ...arenaShot('route-guard-locked', 'kernel_guard'),
    route: { nodeId: 'guardroom', cleared: false },
  },
  'route-guard-open': {
    ...arenaShot('route-guard-open', 'kernel_guard'),
    route: { nodeId: 'guardroom', cleared: true },
  },
  'route-antechamber': {
    ...arenaShot('route-antechamber', 'upper_hall'),
    route: { nodeId: 'antechamber', cleared: false },
  },
  'shape-gallery': arenaShot('shape-gallery', 'shape_gallery'),
  'shape-twin-bowls': arenaShot('shape-twin-bowls', 'shape_twin_bowls'),
  'shape-combat-bowl': arenaShot('shape-combat-bowl', 'shape_combat_bowl'),
  'shape-cramped-keep': arenaShot('shape-cramped-keep', 'shape_cramped_keep'),
  'maze-corner': arenaShot('maze-corner', 'maze_serpentine'),
  'maze-portal-down': arenaShot('maze-portal-down', 'maze_serpentine'),
  'maze-followed': arenaShot('maze-followed', 'maze_serpentine'),
  'generated-chambers': arenaShot('generated-chambers', 'generated_chambers'),
  'background-encounter': arenaShot('background-encounter', 'background_encounter'),
  'concept-bell-court-empty': arenaShot('concept-bell-court-empty', 'concept_bell_court'),
  'concept-bell-court-combat': arenaShot('concept-bell-court-combat', 'concept_bell_court'),
  'concept-shattered-dais-empty': arenaShot(
    'concept-shattered-dais-empty',
    'concept_shattered_dais',
  ),
  'concept-shattered-dais-combat': arenaShot(
    'concept-shattered-dais-combat',
    'concept_shattered_dais',
  ),
  'concept-rain-breached-hall-empty': arenaShot(
    'concept-rain-breached-hall-empty',
    'concept_rain_breached_hall',
  ),
  'concept-rain-breached-hall-combat': arenaShot(
    'concept-rain-breached-hall-combat',
    'concept_rain_breached_hall',
  ),
  'concept-parallax-gallery-empty': arenaShot(
    'concept-parallax-gallery-empty',
    'concept_parallax_gallery',
  ),
  'concept-parallax-gallery-combat': arenaShot(
    'concept-parallax-gallery-combat',
    'concept_parallax_gallery',
  ),
  'concept-prop-gallery-empty': arenaShot(
    'concept-prop-gallery-empty',
    'concept_prop_gallery',
  ),
  'concept-prop-gallery-combat': arenaShot(
    'concept-prop-gallery-combat',
    'concept_prop_gallery',
  ),
  'concept-prop-gallery-solids': {
    ...arenaShot('concept-prop-gallery-solids', 'concept_prop_gallery'),
    inspection: { focus: { x: 0, y: 4.7 }, zoomScale: 1.65 },
  },
  'concept-prop-gallery-flush': {
    ...arenaShot('concept-prop-gallery-flush', 'concept_prop_gallery'),
    inspection: { focus: { x: 0, y: -1.8 }, zoomScale: 1.55 },
  },
  'concept-kit-gallery-empty': arenaShot(
    'concept-kit-gallery-empty',
    'concept_kit_gallery',
  ),
  'concept-kit-gallery-combat': arenaShot(
    'concept-kit-gallery-combat',
    'concept_kit_gallery',
  ),
  'concept-kit-gallery-desaturated': drainedArenaShot(
    'concept-kit-gallery-desaturated',
    'concept_kit_gallery',
  ),
  'concept-kit-gallery-floors': {
    ...arenaShot('concept-kit-gallery-floors', 'concept_kit_gallery'),
    inspection: { focus: { x: 0, y: -3.15 }, zoomScale: 1.25 },
  },
  'concept-kit-gallery-walls': {
    ...arenaShot('concept-kit-gallery-walls', 'concept_kit_gallery'),
    inspection: { focus: { x: 0, y: 0.45 }, zoomScale: 1.55 },
  },
  'concept-kit-gallery-windows': {
    ...arenaShot('concept-kit-gallery-windows', 'concept_kit_gallery'),
    inspection: { focus: { x: 0, y: 3 }, zoomScale: 1.55 },
  },
  'concept-kit-gallery-details': {
    ...arenaShot('concept-kit-gallery-details', 'concept_kit_gallery'),
    inspection: { focus: { x: 0, y: 5.35 }, zoomScale: 1.48 },
  },
  'concept-clutter-gallery-empty': arenaShot(
    'concept-clutter-gallery-empty',
    'concept_clutter_gallery',
  ),
  'concept-clutter-gallery-combat': arenaShot(
    'concept-clutter-gallery-combat',
    'concept_clutter_gallery',
  ),
  'concept-clutter-gallery-desaturated': drainedArenaShot(
    'concept-clutter-gallery-desaturated',
    'concept_clutter_gallery',
  ),
  'concept-clutter-gallery-loyalty': {
    ...arenaShot('concept-clutter-gallery-loyalty', 'concept_clutter_gallery'),
    inspection: { focus: { x: -5, y: -2.7 }, zoomScale: 2.5 },
  },
  'concept-clutter-gallery-absence': {
    ...arenaShot('concept-clutter-gallery-absence', 'concept_clutter_gallery'),
    inspection: { focus: { x: 5, y: -2.7 }, zoomScale: 2.5 },
  },
  'concept-clutter-gallery-siege': {
    ...arenaShot('concept-clutter-gallery-siege', 'concept_clutter_gallery'),
    inspection: { focus: { x: -5, y: 2.7 }, zoomScale: 2.5 },
  },
  'concept-clutter-gallery-service': {
    ...arenaShot('concept-clutter-gallery-service', 'concept_clutter_gallery'),
    inspection: { focus: { x: 5, y: 2.7 }, zoomScale: 2.5 },
  },
  'concept-lantern-cloister-empty': arenaShot(
    'concept-lantern-cloister-empty',
    'concept_lantern_cloister',
  ),
  'concept-lantern-cloister-combat': arenaShot(
    'concept-lantern-cloister-combat',
    'concept_lantern_cloister',
  ),
  'concept-lantern-cloister-desaturated': drainedArenaShot(
    'concept-lantern-cloister-desaturated',
    'concept_lantern_cloister',
  ),
  'concept-lantern-cloister-baked': arenaShot(
    'concept-lantern-cloister-baked',
    'concept_lantern_cloister_baked',
  ),
  'concept-lantern-cloister-live': arenaShot(
    'concept-lantern-cloister-live',
    'concept_lantern_cloister_live',
  ),
  'concept-lantern-cloister-storm': {
    ...arenaShot('concept-lantern-cloister-storm', 'concept_lantern_cloister_live'),
    weather: 'storm',
  },
  'concept-oath-gallery-empty': arenaShot(
    'concept-oath-gallery-empty',
    'concept_oath_gallery',
  ),
  'concept-oath-gallery-combat': arenaShot(
    'concept-oath-gallery-combat',
    'concept_oath_gallery',
  ),
  'concept-oath-gallery-desaturated': drainedArenaShot(
    'concept-oath-gallery-desaturated',
    'concept_oath_gallery',
  ),
  'concept-bell-court-desaturated': drainedArenaShot(
    'concept-bell-court-desaturated',
    'concept_bell_court',
  ),
  'concept-guard-procession-empty': arenaShot(
    'concept-guard-procession-empty',
    'concept_guard_procession',
  ),
  'concept-guard-procession-combat': arenaShot(
    'concept-guard-procession-combat',
    'concept_guard_procession',
  ),
  'concept-guard-procession-desaturated': drainedArenaShot(
    'concept-guard-procession-desaturated',
    'concept_guard_procession',
  ),
  'concept-violet-chancellery-empty': arenaShot(
    'concept-violet-chancellery-empty',
    'concept_violet_chancellery',
  ),
  'concept-violet-chancellery-combat': arenaShot(
    'concept-violet-chancellery-combat',
    'concept_violet_chancellery',
  ),
  'concept-violet-chancellery-desaturated': drainedArenaShot(
    'concept-violet-chancellery-desaturated',
    'concept_violet_chancellery',
  ),
  'concept-shattered-dais-desaturated': drainedArenaShot(
    'concept-shattered-dais-desaturated',
    'concept_shattered_dais',
  ),
  'concept-rookery-roofs-empty': arenaShot(
    'concept-rookery-roofs-empty',
    'concept_rookery_roofs',
  ),
  'concept-rookery-roofs-combat': arenaShot(
    'concept-rookery-roofs-combat',
    'concept_rookery_roofs',
  ),
  'concept-rookery-roofs-desaturated': drainedArenaShot(
    'concept-rookery-roofs-desaturated',
    'concept_rookery_roofs',
  ),
  'concept-chainbridge-court-empty': arenaShot(
    'concept-chainbridge-court-empty',
    'concept_chainbridge_court',
  ),
  'concept-chainbridge-court-combat': arenaShot(
    'concept-chainbridge-court-combat',
    'concept_chainbridge_court',
  ),
  'concept-chainbridge-court-desaturated': drainedArenaShot(
    'concept-chainbridge-court-desaturated',
    'concept_chainbridge_court',
  ),
  'concept-flooded-nave-empty': arenaShot(
    'concept-flooded-nave-empty',
    'concept_flooded_nave',
  ),
  'concept-flooded-nave-combat': arenaShot(
    'concept-flooded-nave-combat',
    'concept_flooded_nave',
  ),
  'concept-flooded-nave-desaturated': drainedArenaShot(
    'concept-flooded-nave-desaturated',
    'concept_flooded_nave',
  ),
  'concept-bell-foundry-empty': arenaShot(
    'concept-bell-foundry-empty',
    'concept_bell_foundry',
  ),
  'concept-bell-foundry-combat': arenaShot(
    'concept-bell-foundry-combat',
    'concept_bell_foundry',
  ),
  'concept-bell-foundry-desaturated': drainedArenaShot(
    'concept-bell-foundry-desaturated',
    'concept_bell_foundry',
  ),
  'concept-archive-spiral-empty': arenaShot(
    'concept-archive-spiral-empty',
    'concept_archive_spiral',
  ),
  'concept-archive-spiral-combat': arenaShot(
    'concept-archive-spiral-combat',
    'concept_archive_spiral',
  ),
  'concept-archive-spiral-desaturated': drainedArenaShot(
    'concept-archive-spiral-desaturated',
    'concept_archive_spiral',
  ),
  'concept-hollow-throne-empty': arenaShot(
    'concept-hollow-throne-empty',
    'concept_hollow_throne',
  ),
  'concept-hollow-throne-combat': arenaShot(
    'concept-hollow-throne-combat',
    'concept_hollow_throne',
  ),
  'concept-hollow-throne-desaturated': drainedArenaShot(
    'concept-hollow-throne-desaturated',
    'concept_hollow_throne',
  ),
};

export const debugFlagsFromSearch = (search: string): { showHitboxes: boolean } => {
  const raw = new URLSearchParams(search).get('hitboxes')?.trim().toLowerCase();
  const on = raw !== undefined && raw !== '0' && raw !== 'false' && raw !== 'off';
  return { showHitboxes: on };
};

export const captureShotFromSearch = (search: string): CaptureShot | null => {
  const requested = new URLSearchParams(search).get('capture');
  return requested !== null && requested in CAPTURE_SHOTS
    ? CAPTURE_SHOTS[requested as CaptureShotId]
    : null;
};

const firstBlade = (world: World) => world.enemies.find((enemy) => enemy.archetype === 'first_blade');
const captain = (world: World) =>
  world.enemies.find((enemy) => enemy.archetype === 'captain');
const CAPTAIN_READS = {
  'captain-direct': { attackIndex: 0, elapsedMs: 400 },
  'captain-feint': { attackIndex: 1, elapsedMs: 680 },
  'captain-pressure': { attackIndex: 2, elapsedMs: 280 },
  'captain-release': { attackIndex: 3, elapsedMs: 520 },
} as const;
type CaptainShotId = keyof typeof CAPTAIN_READS;
const isCaptainShot = (shot: CaptureShotId): shot is CaptainShotId =>
  shot in CAPTAIN_READS;
const rainBoss = (world: World) =>
  world.enemies.find((enemy) => enemy.archetype === 'rain_boss');
const chancellor = (world: World) =>
  world.enemies.find((enemy) => enemy.archetype === 'chancellor');
const queen = (world: World) => world.enemies.find((enemy) => enemy.archetype === 'queen');

const advanceUntil = (
  world: World,
  combat: CombatConfig,
  slowMo: SlowMoConfig,
  encounter: EncounterDef,
  done: () => boolean,
  maxTicks: number,
): void => {
  for (let i = 0; i < maxTicks && !done(); i++) {
    stepWorld(world, [NEUTRAL_INTENT], combat, slowMo, encounter);
  }
  if (!done()) throw new Error(`capture state did not settle within ${maxTicks} ticks`);
};

const GUARD_SHIELD_FACINGS: Partial<Record<CaptureShotId, number>> = {
  'guard-shield': 0,
  'guard-shield-back': Math.PI,
  'guard-shield-profile': (5 * Math.PI) / 8,
  'guard-shield-profile-rear': (7 * Math.PI) / 8,
};

export const prepareCaptureWorld = (
  world: World,
  combat: CombatConfig,
  slowMo: SlowMoConfig,
  encounter: EncounterDef,
  shot: CaptureShotId,
): void => {
  stepWorld(world, [NEUTRAL_INTENT], combat, slowMo, encounter);
  if (shot === 'weapon-contact') {
    const player = world.players[0];
    const target = world.enemies.find((enemy) => enemy.archetype === 'guard');
    if (target === undefined) throw new Error('weapon-contact fixture did not spawn its guard');

    for (let i = 0; i < 240; i++) {
      const dx = target.pos.x - player.pos.x;
      const dy = target.pos.y - player.pos.y;
      if (
        Math.hypot(dx, dy) <=
        combat.player.attacks.heavy.range + combat.enemies[target.archetype].radius
      ) {
        break;
      }
      const length = Math.max(0.001, Math.hypot(dx, dy));
      stepWorld(
        world,
        [
          {
            ...NEUTRAL_INTENT,
            move: { x: dx / length, y: dy / length },
            facing: Math.atan2(dy, dx),
          },
        ],
        combat,
        slowMo,
        encounter,
      );
    }
    const facing = Math.atan2(target.pos.y - player.pos.y, target.pos.x - player.pos.x);
    stepWorld(
      world,
      [{ ...NEUTRAL_INTENT, facing, heavyPressed: true }],
      combat,
      slowMo,
      encounter,
    );
    advanceUntil(
      world,
      combat,
      slowMo,
      encounter,
      () =>
        world.events.some(
          (event) => event.type === 'hit_landed' && event.actor === player.id,
        ),
      180,
    );
    return;
  }
  if (shot === 'perfect-parry') {
    const player = world.players[0];
    const target = world.enemies.find((enemy) => enemy.archetype === 'guard');
    if (target === undefined) throw new Error('perfect-parry fixture did not spawn its guard');

    let pressed = false;
    for (let tick = 0; tick < 1200; tick += 1) {
      const facing = Math.atan2(target.pos.y - player.pos.y, target.pos.x - player.pos.x);
      let intent: Intent = { ...NEUTRAL_INTENT, facing };
      if (target.state.kind === 'telegraph') {
        const attack = combat.enemies[target.archetype].attacks[target.state.attackIndex];
        const actualTelegraphMs = attack.telegraphMs + target.state.telegraphJitterMs;
        const remainingMs = actualTelegraphMs - target.state.elapsedMs;
        const perfectContactMs =
          combat.player.parry.onsetMs + combat.player.parry.perfectMs * 0.5;
        if (!pressed && remainingMs <= perfectContactMs) {
          pressed = true;
          intent = {
            ...NEUTRAL_INTENT,
            facing,
            guardPressed: true,
            guardHeld: true,
          };
        } else if (pressed) {
          intent = { ...NEUTRAL_INTENT, facing, guardHeld: true };
        }
      } else if (pressed) {
        intent = { ...NEUTRAL_INTENT, facing, guardHeld: true };
      }
      stepWorld(world, [intent], combat, slowMo, encounter);
      if (world.events.some((event) => event.type === 'parry_success')) return;
    }
    throw new Error('perfect-parry fixture did not reach a real parry');
  }
  if (shot === 'enemy-weapon-contact') {
    const target = world.players[0];
    advanceUntil(
      world,
      combat,
      slowMo,
      encounter,
      () =>
        world.events.some(
          (event) => event.type === 'hit_received' && event.target === target.id,
        ),
      1200,
    );
    return;
  }
  const shieldFacing = GUARD_SHIELD_FACINGS[shot];
  if (shieldFacing !== undefined) {
    if (shieldFacing !== 0) {
      for (let i = 0; i < 44; i++) {
        stepWorld(world, [{ ...NEUTRAL_INTENT, facing: shieldFacing }], combat, slowMo, encounter);
      }
    }
    stepWorld(
      world,
      [{ ...NEUTRAL_INTENT, facing: shieldFacing, guardHeld: true, guardPressed: true }],
      combat,
      slowMo,
      encounter,
    );
    return;
  }
  if (shot.startsWith('arena-')) return;
  if (shot.startsWith('mesh-')) return;
  if (shot === 'herald-room') return;
  if (shot.startsWith('route-')) return;
  if (shot.startsWith('shape-')) return;
  if (shot.startsWith('concept-')) {
    if (!shot.endsWith('-combat')) world.enemies.length = 0;
    return;
  }


  if (shot === 'maze-followed') {
    const walk: Intent = { ...NEUTRAL_INTENT, move: { x: 0, y: 1 } };
    for (let i = 0; i < 200; i++) stepWorld(world, [walk], combat, slowMo, encounter);
    const turn: Intent = { ...NEUTRAL_INTENT, move: { x: 1, y: 0 } };
    for (let i = 0; i < 90; i++) stepWorld(world, [turn], combat, slowMo, encounter);
    return;
  }
  if (shot.startsWith('maze-')) return;
  if (shot === 'generated-chambers') return;
  if (shot.startsWith('background-')) return;
  if (isCaptainShot(shot)) {
    const read = CAPTAIN_READS[shot];
    if (shot === 'captain-feint') {
      const target = captain(world);
      const lifecycle = combat.enemies.captain.boss;
      if (target !== undefined && lifecycle !== undefined) {
        target.hp = target.maxHp * lifecycle.phaseTwoHpFraction;
      }
    }
    advanceUntil(
      world,
      combat,
      slowMo,
      encounter,
      () => {
        const target = captain(world);
        return (
          target?.state.kind === 'telegraph' &&
          target.state.attackIndex === read.attackIndex &&
          target.state.elapsedMs >= read.elapsedMs
        );
      },
      1200,
    );
    return;
  }

  if (shot.startsWith('chancellor-')) {
    if (shot === 'chancellor-room') return;
    advanceUntil(
      world,
      combat,
      slowMo,
      encounter,
      () => {
        const target = chancellor(world);
        return (
          target?.state.kind === 'telegraph' &&
          target.state.attackIndex === 1 &&
          target.state.elapsedMs >= 430
        );
      },
      900,
    );
    return;
  }

  if (shot.startsWith('queen-')) {
    const lifecycle = combat.enemies.queen.boss;
    const target = queen(world);
    if (shot !== 'queen-regalia' && target !== undefined && lifecycle !== undefined) {
      target.hp =
        target.maxHp *
        (shot === 'queen-unsworn'
          ? lifecycle.phaseTwoHpFraction
          : (lifecycle.phaseThreeHpFraction ?? lifecycle.phaseTwoHpFraction));
    }
    const wanted = shot === 'queen-regalia' ? 1 : shot === 'queen-unsworn' ? 2 : 3;
    advanceUntil(
      world,
      combat,
      slowMo,
      encounter,
      () => {
        const her = queen(world);
        return (her?.phase ?? 1) >= wanted && her?.state.kind === 'telegraph';
      },
      1800,
    );
    return;
  }

  if (shot.startsWith('rain-')) {
    advanceUntil(
      world,
      combat,
      slowMo,
      encounter,
      () => world.projectiles.filter((projectile) => projectile.kind === 'falling').length === 5,
      400,
    );
    if (shot === 'rain-field') return;
    advanceUntil(
      world,
      combat,
      slowMo,
      encounter,
      () => {
        const target = rainBoss(world);
        return (
          target?.state.kind === 'telegraph' &&
          target.state.attackIndex === 1 &&
          target.state.elapsedMs >= 260
        );
      },
      300,
    );
    return;
  }

  if (shot === 'first-blade-entrance') return;

  advanceUntil(
    world,
    combat,
    slowMo,
    encounter,
    () => world.events.some((event) => event.type === 'boss_fight_started'),
    400,
  );
  if (shot === 'first-blade-room') return;

  const target = firstBlade(world);
  if (target === undefined) throw new Error('First Blade capture fixture did not spawn its subject');
  target.hp =
    target.maxHp * (combat.enemies.first_blade.boss?.phaseTwoHpFraction ?? 0.5);
  advanceUntil(
    world,
    combat,
    slowMo,
    encounter,
    () =>
      world.events.some(
        (event) => event.type === 'enemy_phase_changed' && event.data?.phase === 2,
      ),
    300,
  );
  if (shot === 'first-blade-glide') {
    advanceUntil(
      world,
      combat,
      slowMo,
      encounter,
      () => {
        const subject = firstBlade(world);
        return (
          subject?.state.kind === 'attack' &&
          subject.glideTarget !== undefined &&
          subject.state.elapsedMs >= 180
        );
      },
      700,
    );
  }
};
