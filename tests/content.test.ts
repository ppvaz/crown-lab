
import { describe, expect, it } from 'vitest';

import { ENCOUNTER_CONTENT_VERSION, hashEncounterContent, parseEncounterContent } from '../src/lab/content';
import { arenaContains, arenaGeometryIsValid } from '../src/sim/arena';
import { createWorld } from '../src/sim/encounter';
import { fingerprintWorld } from '../src/sim/fingerprint';
import { stepWorld } from '../src/sim/world';
import { DEFAULT_COMBAT, SLOWMO_PRESETS } from '../src/lab/config';
import { NEUTRAL_INTENT, type EncounterDef } from '../src/sim/types';

const octagon = () => ({
  kind: 'shape',
  halfExtents: { x: 10, y: 7 },
  vertices: [
    { x: -6.5, y: -7 },
    { x: 6.5, y: -7 },
    { x: 10, y: -3.5 },
    { x: 10, y: 3.5 },
    { x: 6.5, y: 7 },
    { x: -6.5, y: 7 },
    { x: -10, y: 3.5 },
    { x: -10, y: -3.5 },
  ],
});

const kernel = () => ({
  id: 'kernel_guard',
  description: 'One guard, untimed.',
  arena: 'octagon',
  playerStart: { x: -3, y: 0 },
  waves: [{ id: 'w1', atMs: 0, spawns: [{ archetype: 'guard', at: { x: 3, y: 0 } }] }],
  timeLimitMs: null,
});

const document = () => ({
  version: ENCOUNTER_CONTENT_VERSION,
  arenas: { octagon: octagon() },
  defaultEncounterId: 'kernel_guard',
  defaultEncounter: kernel(),
  encounters: [kernel()],
});

describe('parseEncounterContent', () => {
  it('turns a valid document into EncounterDefs with exactly the contract fields', () => {
    const content = parseEncounterContent(document());
    const encounter = content.encounters.kernel_guard;
    expect(Object.keys(encounter).sort()).toEqual(
      ['arena', 'description', 'id', 'playerStart', 'timeLimitMs', 'waves'].sort(),
    );
    expect(encounter.waves).toEqual([
      { id: 'w1', atMs: 0, spawns: [{ archetype: 'guard', at: { x: 3, y: 0 } }] },
    ]);
    expect(content.defaultEncounter.id).toBe('kernel_guard');
  });

  it('shares one arena object between every encounter that references it', () => {
    const doc = document();
    doc.encounters = [kernel(), { ...kernel(), id: 'kernel_guard_b' }];
    const content = parseEncounterContent(doc);
    expect(content.encounters.kernel_guard.arena).toBe(content.encounters.kernel_guard_b.arena);
  });

  it('preserves document order in the encounters record', () => {
    const doc = document();
    doc.encounters = [
      { ...kernel(), id: 'zeta' },
      { ...kernel(), id: 'alpha' },
      kernel(),
    ];
    expect(Object.keys(parseEncounterContent(doc).encounters)).toEqual([
      'zeta',
      'alpha',
      'kernel_guard',
    ]);
  });

  it('refuses every version but the current one and the one it migrates', () => {
    expect(() => parseEncounterContent({ ...document(), version: 3 })).toThrow(/document\.version/);
    expect(() => parseEncounterContent({ ...document(), version: 0 })).toThrow(/document\.version/);
    expect(() => parseEncounterContent({ ...document(), version: '2' })).toThrow(/document\.version/);
  });

  it('migrates a version-1 document, and the migration moves no run', () => {
    const v1 = { ...document(), version: 1 };
    const migrated = parseEncounterContent(v1);
    expect(migrated.version).toBe(ENCOUNTER_CONTENT_VERSION);
    expect(migrated.encounters).toEqual(parseEncounterContent(document()).encounters);
    expect(hashEncounterContent(migrated)).toBe(hashEncounterContent(parseEncounterContent(document())));
  });

  it('refuses an unknown arena reference by name', () => {
    const doc = document();
    doc.encounters[0].arena = 'missing_hall';
    expect(() => parseEncounterContent(doc)).toThrow(/unknown arena 'missing_hall'/);
  });

  it('refuses an archetype the sim does not have', () => {
    const doc = document();
    doc.encounters[0].waves[0].spawns[0].archetype = 'necromancer';
    expect(() => parseEncounterContent(doc)).toThrow(/unknown archetype 'necromancer'/);
  });

  it('refuses geometry the sim would refuse', () => {
    const doc = document();
    doc.arenas.octagon.vertices.reverse();
    expect(() => parseEncounterContent(doc)).toThrow(/not valid arena geometry/);
  });

  it('refuses a duplicated encounter id', () => {
    const doc = document();
    doc.encounters = [kernel(), kernel()];
    expect(() => parseEncounterContent(doc)).toThrow(/duplicates id 'kernel_guard'/);
  });

  it('refuses a gate that waits for a wave the encounter never spawns', () => {
    const doc = document();
    (doc.arenas.octagon as Record<string, unknown>).gates = [
      { id: 'g1', from: { x: 0, y: -2 }, to: { x: 0, y: 2 }, lockUntilWaveCleared: 'w9' },
    ];
    expect(() => parseEncounterContent(doc)).toThrow(/unknown wave 'w9'/);
  });

  it('applies rotateDegrees through the same arithmetic the literals used', () => {
    const doc = document();
    doc.encounters[0].playerStart = { x: 0, y: 4, rotateDegrees: -20 } as never;
    const start = parseEncounterContent(doc).encounters.kernel_guard.playerStart;
    const angle = (-20 * Math.PI) / 180;
    expect(start.x).toBe(0 * Math.cos(angle) - 4 * Math.sin(angle));
    expect(start.y).toBe(0 * Math.sin(angle) + 4 * Math.cos(angle));
  });

  it('builds a rotated arena from its authored vertices and angle', () => {
    const doc = document();
    (doc.arenas as Record<string, unknown>).diamond = {
      kind: 'rotated',
      degrees: 24,
      vertices: [
        { x: 0, y: -7 },
        { x: 9, y: 0 },
        { x: 0, y: 7 },
        { x: -9, y: 0 },
      ],
    };
    doc.encounters[0].arena = 'diamond';
    doc.defaultEncounter.arena = 'diamond';
    const arena = parseEncounterContent(doc).encounters.kernel_guard.arena;
    const angle = (24 * Math.PI) / 180;
    expect(arena.vertices?.[1].x).toBe(9 * Math.cos(angle));
    expect(arena.vertices?.[1].y).toBe(9 * Math.sin(angle));
    expect(arena.halfExtents.x).toBe(
      Math.max(...arena.vertices!.map((point) => Math.abs(point.x))),
    );
  });

  it('builds a serpentine arena from its four dials and refuses an even leg count', () => {
    const doc = document();
    const maze = {
      kind: 'serpentine',
      legs: 3,
      spacing: 7,
      corridorWidth: 3,
      legHalfLength: 12,
    };
    (doc.arenas as Record<string, unknown>).maze = maze;
    doc.encounters[0].arena = 'maze';
    doc.defaultEncounter.arena = 'maze';
    const arena = parseEncounterContent(doc).encounters.kernel_guard.arena;
    expect(arena.regions).toHaveLength(3 + 2);
    expect(arena.halfExtents).toEqual({ x: 8.5, y: 12 });

    maze.legs = 4;
    expect(() => parseEncounterContent(doc)).toThrow(/legs/);
  });

  it('validates notes and keeps them out of the loaded defs', () => {
    const doc = document();
    (doc.encounters[0] as Record<string, unknown>).notes = ['Milestone 1, Corpo.'];
    const encounter = parseEncounterContent(doc).encounters.kernel_guard;
    expect('notes' in encounter).toBe(false);

    (doc.encounters[0] as Record<string, unknown>).notes = [42];
    expect(() => parseEncounterContent(doc)).toThrow(/notes/);
  });

  it('hashes the behavioral surface: vertices move it, notes do not', () => {
    const base = parseEncounterContent(document());
    const again = parseEncounterContent(document());
    expect(hashEncounterContent(base)).toBe(hashEncounterContent(again));

    const noted = document();
    (noted.encounters[0] as Record<string, unknown>).notes = ['prose only'];
    expect(hashEncounterContent(parseEncounterContent(noted))).toBe(hashEncounterContent(base));

    const moved = document();
    moved.encounters[0].playerStart = { x: -2.9, y: 0 };
    moved.defaultEncounter.playerStart = { x: -2.9, y: 0 };
    expect(hashEncounterContent(parseEncounterContent(moved))).not.toBe(hashEncounterContent(base));
  });

  it('requires the default encounter to carry the default id', () => {
    const doc = document();
    doc.defaultEncounterId = 'kernel_guard';
    doc.defaultEncounter = { ...kernel(), id: 'other' };
    expect(() => parseEncounterContent(doc)).toThrow(/default id/);
  });
});

describe('generated arenas', () => {
  const chambers = () => ({
    kind: 'generated',
    algorithm: 'chambers',
    seed: 7,
    chambers: 3,
    chamberSpanMin: 4,
    chamberSpanMax: 5.5,
    spacing: 14,
    corridorWidth: 3,
  });

  const generatedDocument = () => {
    const doc = document() as Record<string, unknown> & {
      arenas: Record<string, unknown>;
      encounters: Array<Record<string, unknown>>;
    };
    doc.arenas.chambers = chambers();
    doc.encounters = [
      kernel(),
      {
        id: 'generated_chambers',
        description: 'Generated.',
        arena: 'chambers',
        exploration: true,
        waves: [],
        timeLimitMs: null,
      },
    ];
    return doc;
  };

  it('arrives as an ordinary EncounterDef, with the generator standing the king up', () => {
    const encounter = parseEncounterContent(generatedDocument()).encounters.generated_chambers;
    expect(Object.keys(encounter).sort()).toEqual(
      ['arena', 'description', 'exploration', 'id', 'playerStart', 'timeLimitMs', 'waves'].sort(),
    );
    expect(encounter.arena.regions).toHaveLength(3 * 2 - 1);
    expect(arenaGeometryIsValid(encounter.arena)).toBe(true);
    expect(arenaContains(encounter.arena, encounter.playerStart, 0.45)).toBe(true);
  });

  it('refuses an authored start, because the room moves with its seed', () => {
    const doc = generatedDocument();
    doc.encounters[1].playerStart = { x: 0, y: 0 };
    expect(() => parseEncounterContent(doc)).toThrow(/playerStart/);
  });

  it('keeps the generated and authored id spaces disjoint, both ways round', () => {
    const missingPrefix = generatedDocument();
    missingPrefix.encounters[1].id = 'chambers_room';
    expect(() => parseEncounterContent(missingPrefix)).toThrow(/must begin with 'generated_'/);

    const stolenPrefix = generatedDocument();
    stolenPrefix.encounters[0].id = 'generated_kernel_guard';
    stolenPrefix.defaultEncounterId = 'generated_kernel_guard';
    stolenPrefix.defaultEncounter = { ...kernel(), id: 'generated_kernel_guard' };
    expect(() => parseEncounterContent(stolenPrefix)).toThrow(/may not take the 'generated_' id space/);
  });

  it('names the defect when the dials cannot make a room', () => {
    const unknown = generatedDocument();
    (unknown.arenas.chambers as Record<string, unknown>).algorithm = 'caves';
    expect(() => parseEncounterContent(unknown)).toThrow(/unknown algorithm 'caves'/);

    const missing = generatedDocument();
    delete (missing.arenas.chambers as Record<string, unknown>).spacing;
    expect(() => parseEncounterContent(missing)).toThrow(/arenas\.chambers\.spacing/);

    const merged = generatedDocument();
    (merged.arenas.chambers as Record<string, unknown>).spacing = 9;
    expect(() => parseEncounterContent(merged)).toThrow(/arenas\.chambers .*chambers merge/);
  });

  it('is the room its seed says, and the same room on the next parse', () => {
    const once = parseEncounterContent(generatedDocument()).encounters.generated_chambers;
    const again = parseEncounterContent(generatedDocument()).encounters.generated_chambers;
    expect(again.arena).toEqual(once.arena);

    const other = generatedDocument();
    (other.arenas.chambers as Record<string, unknown>).seed = 8;
    const rerolled = parseEncounterContent(other).encounters.generated_chambers;
    expect(rerolled.arena).not.toEqual(once.arena);
    expect(hashEncounterContent(parseEncounterContent(other))).not.toBe(
      hashEncounterContent(parseEncounterContent(generatedDocument())),
    );
  });

  it('composes waves from a budget, and only where there are chambers to spend it in', () => {
    const doc = generatedDocument();
    doc.encounters[1].waves = {
      kind: 'budget',
      seed: 2,
      budget: 6,
      waveCount: 2,
      spawnMargin: 1.2,
      archetypes: ['guard', 'duelist'],
    };
    delete doc.encounters[1].exploration;
    const encounter = parseEncounterContent(doc).encounters.generated_chambers;
    expect(encounter.waves).toHaveLength(2);
    expect(encounter.waves.flatMap((wave) => wave.spawns).length).toBeGreaterThan(0);
    for (const spawn of encounter.waves.flatMap((wave) => wave.spawns)) {
      expect(arenaContains(encounter.arena, spawn.at, 0.45)).toBe(true);
    }

    const authored = generatedDocument();
    authored.encounters[0].waves = { ...(doc.encounters[1].waves as object) };
    expect(() => parseEncounterContent(authored)).toThrow(/only a generated arena/);

    const broke = generatedDocument();
    broke.encounters[1].waves = { ...(doc.encounters[1].waves as object), budget: 1, archetypes: ['duelist'] };
    expect(() => parseEncounterContent(broke)).toThrow(/cannot afford/);
  });

  it('draws nothing from the world it is handed to', () => {
    const generated = parseEncounterContent(generatedDocument()).encounters.generated_chambers;
    const twin: EncounterDef = {
      id: 'twin',
      description: generated.description,
      arena: JSON.parse(JSON.stringify(generated.arena)) as EncounterDef['arena'],
      playerStart: { ...generated.playerStart },
      exploration: true,
      waves: [],
      timeLimitMs: null,
    };
    const step = (def: EncounterDef): number => {
      const world = createWorld(def, DEFAULT_COMBAT, 11);
      for (let tick = 0; tick < 600; tick++) {
        stepWorld(world, [NEUTRAL_INTENT], DEFAULT_COMBAT, SLOWMO_PRESETS.none, def);
      }
      return fingerprintWorld(world);
    };
    expect(step(twin)).toBe(step({ ...generated, id: 'twin' }));
  });
});
