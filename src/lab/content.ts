
import { arenaGeometryIsValid } from '../sim/arena';
import { generateChambers, type GeneratedRoom } from './generate';
import { dressGeneratedRoom } from './room-dressing';
import { planWaves, type WaveBudgetSpec } from './threat-budget';
import type { Arena, EncounterDef, EnemyArchetype, Vec2, WaveDef } from '../sim/types';

export const ENCOUNTER_CONTENT_VERSION = 2;

export const GENERATED_ID_PREFIX = 'generated_';

export interface ContentOptions {
  generatedSeed?: number;
}

const WAVE_STREAM_MIX = 0x5bf03635;

export interface EncounterContent {
  version: number;
  encounters: Record<string, EncounterDef>;
  defaultEncounterId: string;
  defaultEncounter: EncounterDef;
}

const ARCHETYPES: Record<EnemyArchetype, true> = {
  guard: true,
  duelist: true,
  archer: true,
  first_blade: true,
  captain: true,
  captain_read: true,
  rain_boss: true,
  chancellor: true,
  elite_guard: true,
  pike_novice: true,
  pike_boss: true,
  thorn_marshal: true,
  queen: true,
  glass_regent: true,
  mesh_guard: true,
};

const TUTORIALS = ['fundamentals', 'defense', 'focus', 'power'] as const;

const rotatePoint = (point: { x: number; y: number }, degrees: number) => {
  const angle = (degrees * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: point.x * cos - point.y * sin,
    y: point.x * sin + point.y * cos,
  };
};

const rotatedConvexArena = (vertices: Array<{ x: number; y: number }>, degrees: number): Arena => {
  const rotated = vertices.map((point) => rotatePoint(point, degrees));
  return {
    halfExtents: {
      x: Math.max(...rotated.map((point) => Math.abs(point.x))),
      y: Math.max(...rotated.map((point) => Math.abs(point.y))),
    },
    vertices: rotated,
  };
};

interface SerpentineMazeSpec {
  legs: number;
  spacing: number;
  corridorWidth: number;
  legHalfLength: number;
}

const serpentineMaze = (spec: SerpentineMazeSpec): Arena => {
  const { legs, spacing, corridorWidth: width, legHalfLength: reach } = spec;
  const half = width / 2;
  const centre = (i: number) => (i - (legs - 1) / 2) * spacing;
  const left = (i: number) => centre(i) - half;
  const right = (i: number) => centre(i) + half;
  const rect = (x0: number, y0: number, x1: number, y1: number) => [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];

  const regions = [
    ...Array.from({ length: legs }, (_, i) => rect(left(i), -reach, right(i), reach)),
    ...Array.from({ length: legs - 1 }, (_, i) =>
      i % 2 === 0
        ? rect(left(i), reach - width, right(i + 1), reach)
        : rect(left(i), -reach, right(i + 1), -reach + width),
    ),
  ];

  const outline = [
    { x: left(0), y: -reach },
    { x: right(0), y: -reach },
  ];
  for (let i = 0; i + 1 < legs; i += 2) {
    outline.push(
      { x: right(i), y: reach - width },
      { x: left(i + 1), y: reach - width },
      { x: left(i + 1), y: -reach },
    );
    if (i + 2 < legs) outline.push({ x: right(i + 2), y: -reach });
  }
  outline.push({ x: right(legs - 1), y: reach });
  for (let j = legs - 1; j >= 1; j -= 2) {
    outline.push(
      { x: left(j), y: reach },
      { x: left(j), y: -reach + width },
      { x: right(j - 1), y: -reach + width },
      { x: right(j - 1), y: reach },
    );
  }
  outline.push({ x: left(0), y: reach });

  return { halfExtents: { x: right(legs - 1), y: reach }, outline, regions };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isFinite_ = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const fail = (path: string, wanted: string): never => {
  throw new Error(`encounter content: ${path} ${wanted}`);
};

const xy = (value: unknown, path: string): Vec2 => {
  if (!isRecord(value) || !isFinite_(value.x) || !isFinite_(value.y)) fail(path, 'must be {x, y}');
  const p = value as Record<string, unknown>;
  return { x: p.x as number, y: p.y as number };
};

const position = (value: unknown, path: string): Vec2 => {
  const p = xy(value, path);
  const degrees = (value as Record<string, unknown>).rotateDegrees;
  if (degrees === undefined) return p;
  if (!isFinite_(degrees)) fail(`${path}.rotateDegrees`, 'must be a number');
  return rotatePoint(p, degrees as number);
};

const stringField = (owner: Record<string, unknown>, key: string, path: string): string => {
  const value = owner[key];
  if (typeof value !== 'string' || value === '') fail(`${path}.${key}`, 'must be a non-empty string');
  return value as string;
};

const checkNotes = (owner: Record<string, unknown>, path: string): void => {
  if (owner.notes === undefined) return;
  if (!Array.isArray(owner.notes) || owner.notes.some((note) => typeof note !== 'string')) {
    fail(`${path}.notes`, 'must be an array of strings');
  }
};

const pointList = (value: unknown, path: string, atLeast: number): Vec2[] => {
  if (!Array.isArray(value) || value.length < atLeast) {
    fail(path, `must be an array of at least ${atLeast} points`);
  }
  return (value as unknown[]).map((point, index) => xy(point, `${path}[${index}]`));
};

const parseShapeArena = (entry: Record<string, unknown>, path: string): Arena => {
  const halfExtents = xy(entry.halfExtents, `${path}.halfExtents`);
  const arena: Arena = { halfExtents };
  if (entry.vertices !== undefined) arena.vertices = pointList(entry.vertices, `${path}.vertices`, 3);
  if (entry.outline !== undefined) arena.outline = pointList(entry.outline, `${path}.outline`, 3);
  if (entry.regions !== undefined) {
    if (!Array.isArray(entry.regions)) fail(`${path}.regions`, 'must be an array of convex cells');
    arena.regions = (entry.regions as unknown[]).map((cell, index) =>
      pointList(cell, `${path}.regions[${index}]`, 3),
    );
  }
  if (entry.obstacles !== undefined) {
    if (!Array.isArray(entry.obstacles)) fail(`${path}.obstacles`, 'must be an array');
    arena.obstacles = (entry.obstacles as unknown[]).map((obstacle, index) => {
      const obstaclePath = `${path}.obstacles[${index}]`;
      if (!isRecord(obstacle) || !isFinite_(obstacle.radius) || (obstacle.radius as number) <= 0) {
        fail(obstaclePath, 'must be {at, radius > 0}');
      }
      const o = obstacle as Record<string, unknown>;
      return { at: xy(o.at, `${obstaclePath}.at`), radius: o.radius as number };
    });
  }
  if (entry.gates !== undefined) {
    if (!Array.isArray(entry.gates)) fail(`${path}.gates`, 'must be an array');
    arena.gates = (entry.gates as unknown[]).map((gate, index) => {
      const gatePath = `${path}.gates[${index}]`;
      if (!isRecord(gate)) fail(gatePath, 'must be a gate object');
      const g = gate as Record<string, unknown>;
      return {
        id: stringField(g, 'id', gatePath),
        from: xy(g.from, `${gatePath}.from`),
        to: xy(g.to, `${gatePath}.to`),
        lockUntilWaveCleared: stringField(g, 'lockUntilWaveCleared', gatePath),
      };
    });
  }
  if (entry.elevationRamp !== undefined) {
    const rampPath = `${path}.elevationRamp`;
    const ramp = entry.elevationRamp;
    if (
      !isRecord(ramp) ||
      (ramp.axis !== 'x' && ramp.axis !== 'y') ||
      !isFinite_(ramp.from) ||
      !isFinite_(ramp.to) ||
      !isFinite_(ramp.height) ||
      !isFinite_(ramp.steps)
    ) {
      fail(rampPath, "must be {axis: 'x'|'y', from, to, height, steps}");
    }
    const r = ramp as Record<string, unknown>;
    arena.elevationRamp = {
      axis: r.axis as 'x' | 'y',
      from: r.from as number,
      to: r.to as number,
      height: r.height as number,
      steps: r.steps as number,
    };
  }
  return arena;
};

const parseGeneratedArena = (
  record: Record<string, unknown>,
  path: string,
  options: ContentOptions,
): GeneratedRoom => {
  const algorithm = stringField(record, 'algorithm', path);
  if (algorithm !== 'chambers') fail(`${path}.algorithm`, `unknown algorithm '${algorithm}'`);
  const dial = (key: string): number => {
    if (!isFinite_(record[key])) fail(`${path}.${key}`, 'must be a number');
    return record[key] as number;
  };
  const declared = dial('seed');
  const seed = options.generatedSeed ?? declared;
  try {
    const room = generateChambers({
      seed,
      chambers: dial('chambers'),
      chamberSpanMin: dial('chamberSpanMin'),
      chamberSpanMax: dial('chamberSpanMax'),
      spacing: dial('spacing'),
      corridorWidth: dial('corridorWidth'),
    });
    const obstacles = dressGeneratedRoom(room.arena, seed).obstacles;
    if (obstacles.length > 0) room.arena.obstacles = obstacles;
    return room;
  } catch (error) {
    return fail(path, (error as Error).message);
  }
};

const parseArena = (
  entry: unknown,
  path: string,
  options: ContentOptions,
): { arena: Arena; generated?: GeneratedRoom } => {
  if (!isRecord(entry)) fail(path, 'must be an arena object');
  const record = entry as Record<string, unknown>;
  checkNotes(record, path);
  const kind = record.kind;
  let arena: Arena;
  let generated: GeneratedRoom | undefined;
  if (kind === 'generated') {
    generated = parseGeneratedArena(record, path, options);
    arena = generated.arena;
  } else if (kind === 'shape') {
    arena = parseShapeArena(record, path);
  } else if (kind === 'rotated') {
    if (!isFinite_(record.degrees)) fail(`${path}.degrees`, 'must be a number');
    arena = rotatedConvexArena(
      pointList(record.vertices, `${path}.vertices`, 3),
      record.degrees as number,
    );
  } else if (kind === 'serpentine') {
    for (const key of ['legs', 'spacing', 'corridorWidth', 'legHalfLength']) {
      if (!isFinite_(record[key]) || (record[key] as number) <= 0) {
        fail(`${path}.${key}`, 'must be a positive number');
      }
    }
    if ((record.legs as number) % 2 !== 1) fail(`${path}.legs`, 'must be odd, or the outline cannot close');
    arena = serpentineMaze({
      legs: record.legs as number,
      spacing: record.spacing as number,
      corridorWidth: record.corridorWidth as number,
      legHalfLength: record.legHalfLength as number,
    });
  } else {
    return fail(`${path}.kind`, "must be 'shape', 'rotated', 'serpentine' or 'generated'");
  }
  if (!arenaGeometryIsValid(arena)) fail(path, 'is not valid arena geometry');
  return { arena, generated };
};

const parseWave = (value: unknown, path: string): WaveDef => {
  if (!isRecord(value)) fail(path, 'must be a wave object');
  const record = value as Record<string, unknown>;
  if (record.atMs !== null && !isFinite_(record.atMs)) {
    fail(`${path}.atMs`, 'must be a number or null');
  }
  if (!Array.isArray(record.spawns)) fail(`${path}.spawns`, 'must be an array');
  const spawns = (record.spawns as unknown[]).map((spawn, index) => {
    const spawnPath = `${path}.spawns[${index}]`;
    if (!isRecord(spawn)) fail(spawnPath, 'must be a spawn object');
    const s = spawn as Record<string, unknown>;
    const archetype = stringField(s, 'archetype', spawnPath);
    if (!(archetype in ARCHETYPES)) fail(`${spawnPath}.archetype`, `unknown archetype '${archetype}'`);
    const parsed: WaveDef['spawns'][number] = {
      archetype: archetype as EnemyArchetype,
      at: position(s.at, `${spawnPath}.at`),
    };
    if (s.facing !== undefined) {
      if (!isFinite_(s.facing)) fail(`${spawnPath}.facing`, 'must be a number');
      parsed.facing = s.facing as number;
    }
    return parsed;
  });
  return { id: stringField(record, 'id', path), atMs: record.atMs as number | null, spawns };
};

const parseWaveBudget = (
  value: Record<string, unknown>,
  path: string,
  generated: GeneratedRoom | undefined,
  options: ContentOptions,
): WaveDef[] => {
  if (generated === undefined) {
    return fail(path, 'is a budget, which only a generated arena has the chambers to spend');
  }
  const number = (key: string): number => {
    if (!isFinite_(value[key])) fail(`${path}.${key}`, 'must be a number');
    return value[key] as number;
  };
  if (!Array.isArray(value.archetypes)) fail(`${path}.archetypes`, 'must be an array of archetypes');
  const archetypes = (value.archetypes as unknown[]).map((archetype, index) => {
    if (typeof archetype !== 'string' || !(archetype in ARCHETYPES)) {
      fail(`${path}.archetypes[${index}]`, `unknown archetype '${String(archetype)}'`);
    }
    return archetype as EnemyArchetype;
  });

  let costs: Partial<Record<EnemyArchetype, number>> | undefined;
  if (value.costs !== undefined) {
    if (!isRecord(value.costs)) fail(`${path}.costs`, 'must be an object of archetype costs');
    costs = {};
    for (const [archetype, cost] of Object.entries(value.costs as Record<string, unknown>)) {
      if (!(archetype in ARCHETYPES)) fail(`${path}.costs`, `unknown archetype '${archetype}'`);
      if (!isFinite_(cost)) fail(`${path}.costs.${archetype}`, 'must be a number');
      costs[archetype as EnemyArchetype] = cost as number;
    }
  }

  const declared = number('seed');
  const spec: WaveBudgetSpec = {
    seed: options.generatedSeed === undefined ? declared : (options.generatedSeed ^ WAVE_STREAM_MIX) >>> 0,
    budget: number('budget'),
    waveCount: number('waveCount'),
    spawnMargin: number('spawnMargin'),
    archetypes,
    costs,
  };
  try {
    return planWaves(spec, generated.chambers, generated.arena.obstacles ?? []);
  } catch (error) {
    return fail(path, (error as Error).message);
  }
};

const parseHazard = (value: unknown, path: string): NonNullable<EncounterDef['hazard']> => {
  if (!isRecord(value)) fail(path, 'must be a hazard object');
  const record = value as Record<string, unknown>;
  const kind = stringField(record, 'kind', path);
  if (kind !== 'books') fail(`${path}.kind`, `unknown hazard kind '${kind}'`);
  const positive = (field: string): number => {
    if (!isFinite_(record[field])) fail(`${path}.${field}`, 'must be a number');
    const n = record[field] as number;
    if (n < 0) fail(`${path}.${field}`, 'must not be negative');
    return n;
  };
  const hazard: NonNullable<EncounterDef['hazard']> = {
    kind: 'books',
    count: positive('count'),
    speed: positive('speed'),
    damage: positive('damage'),
  };
  if (record.phaseTwoCount !== undefined) hazard.phaseTwoCount = positive('phaseTwoCount');
  if (hazard.speed <= 0) fail(`${path}.speed`, 'must be greater than zero');
  return hazard;
};

const parseEncounter = (
  value: unknown,
  path: string,
  arenas: Record<string, { arena: Arena; generated?: GeneratedRoom }>,
  options: ContentOptions,
): EncounterDef => {
  if (!isRecord(value)) fail(path, 'must be an encounter object');
  const record = value as Record<string, unknown>;
  checkNotes(record, path);
  const id = stringField(record, 'id', path);
  const arenaRef = stringField(record, 'arena', path);
  const entry = arenas[arenaRef];
  if (entry === undefined) fail(`${path}.arena`, `references unknown arena '${arenaRef}'`);
  const { arena, generated } = entry;
  if (generated !== undefined && !id.startsWith(GENERATED_ID_PREFIX)) {
    fail(`${path}.id`, `stands on a generated arena, so it must begin with '${GENERATED_ID_PREFIX}'`);
  }
  if (generated === undefined && id.startsWith(GENERATED_ID_PREFIX)) {
    fail(`${path}.id`, `is authored, so it may not take the '${GENERATED_ID_PREFIX}' id space`);
  }
  if (!Array.isArray(record.waves) && !isRecord(record.waves)) {
    fail(`${path}.waves`, 'must be an array of waves, or a budget to compose them from');
  }
  const waves = Array.isArray(record.waves)
    ? (record.waves as unknown[]).map((wave, index) => parseWave(wave, `${path}.waves[${index}]`))
    : parseWaveBudget(record.waves as Record<string, unknown>, `${path}.waves`, generated, options);
  if (record.timeLimitMs !== null && !isFinite_(record.timeLimitMs)) {
    fail(`${path}.timeLimitMs`, 'must be a number or null');
  }
  const waveIds = new Set(waves.map((wave) => wave.id));
  for (const gate of arena.gates ?? []) {
    if (!waveIds.has(gate.lockUntilWaveCleared)) {
      fail(`${path}.arena`, `gate '${gate.id}' waits for unknown wave '${gate.lockUntilWaveCleared}'`);
    }
  }
  if (generated !== undefined && record.playerStart !== undefined) {
    fail(`${path}.playerStart`, 'is the generator\'s to place, and a room that moves with its seed cannot carry an authored one');
  }
  const encounter: EncounterDef = {
    id,
    description: stringField(record, 'description', path),
    arena,
    playerStart: generated?.playerStart ?? position(record.playerStart, `${path}.playerStart`),
    waves,
    timeLimitMs: record.timeLimitMs as number | null,
  };
  if (record.tutorial !== undefined) {
    if (!TUTORIALS.includes(record.tutorial as (typeof TUTORIALS)[number])) {
      fail(`${path}.tutorial`, `must be one of ${TUTORIALS.join(', ')}`);
    }
    encounter.tutorial = record.tutorial as EncounterDef['tutorial'];
  }
  if (record.exploration !== undefined) {
    if (record.exploration !== true) fail(`${path}.exploration`, 'is either true or absent');
    encounter.exploration = true;
  }
  if (record.hazard !== undefined) {
    encounter.hazard = parseHazard(record.hazard, `${path}.hazard`);
  }
  return encounter;
};

export const hashEncounterContent = (content: EncounterContent): number => {
  const { version: _version, ...behavioral } = content;
  const canonical = JSON.stringify(behavioral, (key, value) =>
    value !== null && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(
          Object.keys(value as Record<string, unknown>)
            .sort()
            .map((k) => [k, (value as Record<string, unknown>)[k]]),
        )
      : value,
  );
  let hash = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i++) {
    hash ^= canonical.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
};

const migrateV1ToV2 = (document: Record<string, unknown>): Record<string, unknown> =>
  document.version === 1 ? { ...document, version: 2 } : document;

export const parseEncounterContent = (
  data: unknown,
  options: ContentOptions = {},
): EncounterContent => {
  if (!isRecord(data)) fail('document', 'must be an object');
  const record = migrateV1ToV2(data as Record<string, unknown>);
  if (record.version !== ENCOUNTER_CONTENT_VERSION) {
    fail('document.version', `must be ${ENCOUNTER_CONTENT_VERSION}, or 1 to be migrated`);
  }
  checkNotes(record, 'document');

  if (!isRecord(record.arenas)) fail('document.arenas', 'must be an object of named arenas');
  const arenas: Record<string, { arena: Arena; generated?: GeneratedRoom }> = {};
  for (const [name, entry] of Object.entries(record.arenas as Record<string, unknown>)) {
    arenas[name] = parseArena(entry, `arenas.${name}`, options);
  }

  if (!Array.isArray(record.encounters)) fail('document.encounters', 'must be an array');
  const encounters: Record<string, EncounterDef> = {};
  (record.encounters as unknown[]).forEach((entry, index) => {
    const encounter = parseEncounter(entry, `encounters[${index}]`, arenas, options);
    if (encounters[encounter.id] !== undefined) {
      fail(`encounters[${index}]`, `duplicates id '${encounter.id}'`);
    }
    encounters[encounter.id] = encounter;
  });

  const defaultEncounterId = stringField(record, 'defaultEncounterId', 'document');
  if (encounters[defaultEncounterId] === undefined) {
    fail('document.defaultEncounterId', `references unknown encounter '${defaultEncounterId}'`);
  }
  const defaultEncounter = parseEncounter(record.defaultEncounter, 'document.defaultEncounter', arenas, options);
  if (defaultEncounter.id !== defaultEncounterId) {
    fail('document.defaultEncounter', `must carry the default id '${defaultEncounterId}'`);
  }

  return { version: ENCOUNTER_CONTENT_VERSION, encounters, defaultEncounterId, defaultEncounter };
};
