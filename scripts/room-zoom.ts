
import type { CombatConfig, EnemyArchetype } from '../src/sim/types';
import { TICK_MS } from '../src/sim/types';
import { createWorld } from '../src/sim/encounter';
import { stepWorld } from '../src/sim/world';
import { COMBAT_PRESETS, DEFAULT_SLOWMO_ID, SLOWMO_PRESETS } from '../src/lab/config';
import { ENCOUNTERS } from '../src/lab/encounters';
import { DEFAULT_PILOT_SKILL_ID, PILOT_SKILLS, Pilot } from '../src/lab/pilot';
import {
  ELEVATION_Y,
  ISO_X,
  ISO_Y,
  READABLE_ZOOM,
  arenaExceedsScreen,
  fitZoom,
  gameplayViewMargin,
  makeCamera,
  rosterLook,
} from '../src/render/iso';
import { actionShot, threatReach } from '../src/render/action-camera';
import { arenaViewMargin } from '../src/render/arena-decor';
import { LAB_ROOMS } from '../src/render/rooms/index-lab';
import { resolveLayout } from '../src/render/layout';

export interface ViewportCase {
  id: string;
  w: number;
  h: number;
  device: 'touch' | 'pointer';
  dsf: number;
}

export const VIEWPORTS: readonly ViewportCase[] = [
  { id: 'desktop 1440x900', w: 1440, h: 900, device: 'pointer', dsf: 1 },
  { id: 'laptop 1280x720', w: 1280, h: 720, device: 'pointer', dsf: 1 },
  { id: 'mobile-landscape 984x443', w: 984, h: 443, device: 'touch', dsf: 2.4375 },
];

export const ROOM_BOX_UNITS = { wallUnits: 5.4 };

const contentBox = (vp: ViewportCase, profile: 'game' | 'lab'): { w: number; h: number } => {
  const frame = resolveLayout({
    viewport: { w: vp.w, h: vp.h },
    safe: { top: 0, right: 0, bottom: 0, left: 0 },
    device: vp.device,
    profile,
  });
  return { w: frame.content.w, h: frame.content.h };
};

export interface RoomCeiling {
  arenaSpan: number;
  reaches: { archetype: EnemyArchetype; reach: number }[];
  shortest: { archetype: EnemyArchetype; reach: number };
  tightestSpan: number;
  ratio: number;
}

export const ceilingFor = (encounterId: string): RoomCeiling => {
  const encounter = ENCOUNTERS[encounterId];
  if (encounter === undefined) throw new Error(`unknown encounter: ${encounterId}`);
  const combat: CombatConfig = structuredClone(COMBAT_PRESETS.Default);
  const world = createWorld(encounter, combat, 1);
  const arenaSpan = world.arena.halfExtents.x + world.arena.halfExtents.y;

  const archetypes = [
    ...new Set(encounter.waves.flatMap((wave) => wave.spawns.map((spawn) => spawn.archetype))),
  ];
  if (archetypes.length === 0) throw new Error(`${encounterId} spawns nothing to frame`);
  const reaches = archetypes.map((archetype) => ({
    archetype,
    reach: threatReach(combat, archetype),
  }));
  const shortest = reaches.reduce((lo, r) => (r.reach < lo.reach ? r : lo), reaches[0]);
  const tightestSpan = Math.max(2, 2 * shortest.reach);

  return { arenaSpan, reaches, shortest, tightestSpan, ratio: arenaSpan / tightestSpan };
};

export interface ProbeRow {
  viewport: string;
  contentBox: { w: number; h: number };
  dsf: number;
  resting: number;
  peak: number;
  ratio: number;
  ticks: number;
  outcome: string;
}

export const probeRoom = (
  encounterId: string,
  profile: 'game' | 'lab' = 'lab',
  seed = 1,
): ProbeRow[] => {
  const encounter = ENCOUNTERS[encounterId];
  if (encounter === undefined) throw new Error(`unknown encounter: ${encounterId}`);
  const rows: ProbeRow[] = [];

  for (const vp of VIEWPORTS) {
    const combat: CombatConfig = structuredClone(COMBAT_PRESETS.Default);
    const slowMo = SLOWMO_PRESETS[DEFAULT_SLOWMO_ID];
    const world = createWorld(encounter, combat, seed);
    const pilot = new Pilot(PILOT_SKILLS[DEFAULT_PILOT_SKILL_ID], seed);

    const box = contentBox(vp, profile);
    const cam = makeCamera(vp.w, vp.h);
    const margin = gameplayViewMargin(arenaViewMargin(LAB_ROOMS, encounterId), vp.device === 'touch');

    const roomFit = fitZoom(cam, world.arena, margin, box);
    const resting = arenaExceedsScreen(world.arena) ? READABLE_ZOOM : roomFit;

    let peak = resting;
    let ticks = 0;
    const maxTicks = Math.ceil(180_000 / TICK_MS);
    while (ticks < maxTicks && world.outcome === 'running') {
      stepWorld(world, [pilot.intent(world, combat)], combat, slowMo, encounter);
      ticks += 1;
      const kings = world.players.map((player) => player.pos);
      const look = rosterLook(kings);
      const shot = actionShot(
        cam,
        world,
        combat,
        kings,
        { zoom: resting, focus: { x: look.x * 0.3, y: look.y * 0.3 } },
        margin,
        box,
      );
      if (shot.zoom > peak) peak = shot.zoom;
    }

    rows.push({
      viewport: vp.id,
      contentBox: box,
      dsf: vp.dsf,
      resting,
      peak,
      ratio: peak / resting,
      ticks,
      outcome: world.outcome,
    });
  }
  return rows;
};

export interface CameraContract {
  room: string;
  projection: {
    kind: 'orthographic';
    isoX: number;
    isoY: number;
    elevationY: number;
    wallUnits: number;
  };
  arena: {
    halfExtents: { x: number; y: number };
    span: number;
    vertices: { x: number; y: number }[] | null;
  };
  camera: {
    pushInCeiling: number;
    shortestReachArchetype: string;
    viewports: { id: string; contentBox: { w: number; h: number }; dsf: number; resting: number }[];
  };
  raster: {
    widthPx: number;
    heightPx: number;
    effectiveScale: number;
    drivenBy: string;
    decodedMbPerLayer: number;
    origin: { x: number; y: number; elevation: number };
  };
  budget: {
    maxDrawsPerFrame: number;
    decodedMbCeiling: number;
    decodePeakMbCeiling: number;
  };
}

export const cameraContract = (encounterId: string, maxDrawsPerFrame = 4): CameraContract => {
  const encounter = ENCOUNTERS[encounterId];
  if (encounter === undefined) throw new Error(`unknown encounter: ${encounterId}`);
  const ceiling = ceilingFor(encounterId);
  const combat: CombatConfig = structuredClone(COMBAT_PRESETS.Default);
  const world = createWorld(encounter, combat, 1);

  const viewports = VIEWPORTS.map((vp) => {
    const box = contentBox(vp, 'lab');
    const cam = makeCamera(vp.w, vp.h);
    const margin = gameplayViewMargin(
      arenaViewMargin(LAB_ROOMS, encounterId),
      vp.device === 'touch',
    );
    const roomFit = fitZoom(cam, world.arena, margin, box);
    return {
      id: vp.id,
      contentBox: { w: Math.round(box.w), h: Math.round(box.h) },
      dsf: vp.dsf,
      resting: arenaExceedsScreen(world.arena) ? READABLE_ZOOM : roomFit,
    };
  });

  const demands = viewports.map((vp) => ({
    id: vp.id,
    scale: vp.resting * ceiling.ratio * vp.dsf,
  }));
  const worst = demands.reduce((hi, d) => (d.scale > hi.scale ? d : hi), demands[0]);
  const cost = rasterCost(ceiling.arenaSpan, worst.scale, worst.id, 1);

  return {
    room: encounterId,
    projection: {
      kind: 'orthographic',
      isoX: ISO_X,
      isoY: ISO_Y,
      elevationY: ELEVATION_Y,
      wallUnits: ROOM_BOX_UNITS.wallUnits,
    },
    arena: {
      halfExtents: world.arena.halfExtents,
      span: ceiling.arenaSpan,
      vertices: (world.arena as { vertices?: { x: number; y: number }[] }).vertices ?? null,
    },
    camera: {
      pushInCeiling: ceiling.ratio,
      shortestReachArchetype: ceiling.shortest.archetype,
      viewports,
    },
    raster: {
      widthPx: cost.w,
      heightPx: cost.h,
      effectiveScale: worst.scale,
      drivenBy: worst.id,
      decodedMbPerLayer: cost.mbPerLayer,
      origin: { x: 0, y: 0, elevation: ROOM_BOX_UNITS.wallUnits / 2 },
    },
    budget: {
      maxDrawsPerFrame,
      decodedMbCeiling: cost.mbPerLayer * maxDrawsPerFrame,
      decodePeakMbCeiling: cost.mbPerLayer * 8,
    },
  };
};

export interface RasterCost {
  label: string;
  scale: number;
  w: number;
  h: number;
  mbPerLayer: number;
  mbTotal: number;
}

export const rasterCost = (
  arenaSpan: number,
  scale: number,
  label: string,
  layers = 8,
): RasterCost => {
  const w = Math.ceil(2 * arenaSpan * ISO_X * scale);
  const h = Math.ceil((2 * arenaSpan * ISO_Y + ROOM_BOX_UNITS.wallUnits * ELEVATION_Y) * scale);
  const mbPerLayer = (w * h * 4) / 1_048_576;
  return { label, scale, w, h, mbPerLayer, mbTotal: mbPerLayer * layers };
};
