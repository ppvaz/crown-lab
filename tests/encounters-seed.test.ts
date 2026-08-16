
import { arenaContains } from '../src/sim/arena';
import { GATE_LEAD_MS, waveGatePads } from '../src/render/wave-gates-lab';
import { LAB_FULL_PALETTE } from '../src/render/palette-lab';
import { makeCamera } from '../src/render/iso';
import { createWorld } from '../src/sim/encounter';
import { DEFAULT_COMBAT } from '../src/lab/config';
import { BOSS_EVERY, ETERNAL_SIEGE_ID, SIEGE_BOSSES, SIEGE_GATES } from '../src/lab/eternal-siege';
import { parseEncounterContent } from '../src/lab/content';
import {
  ENCOUNTERS,
  GENERATED_ENCOUNTER_IDS,
  encounterForSeed,
  encountersForSeed,
  isGeneratedEncounter,
} from '../src/lab/encounters';
import { ENCOUNTER_DOCUMENT } from '../src/lab/rooms/index';

describe('the seed dial rerolls a generated room', () => {
  it('has a generated room to reroll, and it is the only kind that answers', () => {
    expect(GENERATED_ENCOUNTER_IDS).toContain('generated_chambers');
    for (const id of GENERATED_ENCOUNTER_IDS) expect(isGeneratedEncounter(id)).toBe(true);
    expect(isGeneratedEncounter('kernel_guard')).toBe(false);
  });

  it('leaves every authored room the same object it always was', () => {
    for (const seed of [1, 2, 7, 4242]) {
      const rooms = encountersForSeed(seed);
      expect(Object.keys(rooms)).toEqual(Object.keys(ENCOUNTERS));
      for (const [id, def] of Object.entries(ENCOUNTERS)) {
        if (isGeneratedEncounter(id)) continue;
        if (id === ETERNAL_SIEGE_ID) {
          expect(rooms[id].arena, `${id} arena at seed ${seed}`).toBe(def.arena);
          continue;
        }
        expect(rooms[id], `${id} at seed ${seed}`).toBe(def);
      }
    }
  });

  it('gives a different floor per seed, and the same floor for the same seed', () => {
    const first = encounterForSeed('generated_chambers', 3);
    expect(encounterForSeed('generated_chambers', 3)).toBe(first);
    const other = encounterForSeed('generated_chambers', 4);
    expect(other.arena).not.toEqual(first.arena);
    expect(encounterForSeed('generated_chambers', 3).arena).toEqual(first.arena);
  });

  it('keeps the king and every body on the floor at every seed', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const def = encounterForSeed('generated_chambers', seed);
      expect(arenaContains(def.arena, def.playerStart, 0.45), `seed ${seed}`).toBe(true);
      for (const spawn of def.waves.flatMap((wave) => wave.spawns)) {
        expect(arenaContains(def.arena, spawn.at, 0.45), `seed ${seed}`).toBe(true);
      }
    }
  });

  it('overrides the room and the roster from one dial, on two streams', () => {
    const declared = parseEncounterContent(ENCOUNTER_DOCUMENT).encounters.generated_chambers;
    const same = parseEncounterContent(ENCOUNTER_DOCUMENT, { generatedSeed: 1 })
      .encounters.generated_chambers;
    expect(same.arena).toEqual(declared.arena);
    expect(same.waves).not.toEqual(declared.waves);
  });

  it('leaves the document hash to the document, whatever the dial is set to', () => {
    const base = parseEncounterContent(ENCOUNTER_DOCUMENT);
    const rerolled = parseEncounterContent(ENCOUNTER_DOCUMENT, { generatedSeed: 99 });
    expect(rerolled.version).toBe(base.version);
    expect(rerolled.encounters.kernel_guard).toEqual(base.encounters.kernel_guard);
    expect(rerolled.encounters.generated_chambers.arena).not.toEqual(
      base.encounters.generated_chambers.arena,
    );
  });
});

describe('the eternal siege reads as a figure', () => {
  const waves = () => encounterForSeed(ETERNAL_SIEGE_ID, 7).waves;

  it('never spawns an empty wave', () => {
    for (const wave of waves()) expect(wave.spawns.length, wave.id).toBeGreaterThan(0);
  });

  it('puts a boss on every fifth wave and nowhere else', () => {
    waves().forEach((wave, index) => {
      const hasBoss = wave.spawns.some((spawn) => SIEGE_BOSSES.includes(spawn.archetype));
      expect(hasBoss, wave.id).toBe((index + 1) % BOSS_EVERY === 0);
    });
  });

  it('deals every boss once before dealing any of them twice', () => {
    const order = waves()
      .flatMap((wave) => wave.spawns)
      .filter((spawn) => SIEGE_BOSSES.includes(spawn.archetype))
      .map((spawn) => spawn.archetype);
    const firstRound = order.slice(0, SIEGE_BOSSES.length);
    expect(new Set(firstRound).size).toBe(SIEGE_BOSSES.length);
  });

  it('opens on the most answerable boss rather than a drawn one', () => {
    expect(waves()[BOSS_EVERY - 1].spawns[0].archetype).toBe('first_blade');
  });

  it('keeps archers away from the Glass Regent', () => {
    for (const wave of waves()) {
      const regent = wave.spawns.some((spawn) => spawn.archetype === 'glass_regent');
      if (!regent) continue;
      expect(wave.spawns.some((spawn) => spawn.archetype === 'archer'), wave.id).toBe(false);
    }
  });

  it('brings bodies through a small set of gates, not the open floor', () => {
    const points = new Set(
      waves().flatMap((wave) => wave.spawns.map((spawn) => `${spawn.at.x},${spawn.at.y}`)),
    );
    expect(points.size).toBeLessThanOrEqual(SIEGE_GATES);
    expect(points.size).toBeGreaterThan(2);
  });

  it('opens no gate within reach of where the king starts', () => {
    const room = encounterForSeed(ETERNAL_SIEGE_ID, 7);
    for (const wave of room.waves) {
      for (const spawn of wave.spawns) {
        const d = Math.hypot(spawn.at.x - room.playerStart.x, spawn.at.y - room.playerStart.y);
        expect(d, wave.id).toBeGreaterThanOrEqual(4);
      }
    }
  });

  it('lights its gates before the wave lands, and not before that', () => {
    const room = encounterForSeed(ETERNAL_SIEGE_ID, 7);
    const world = createWorld(room, DEFAULT_COMBAT, 1);
    const ctx = { globalAlpha: 1 } as unknown as CanvasRenderingContext2D;
    const cam = makeCamera(800, 600);
    const second = room.waves[1];
    const at = second.atMs as number;

    world.encounter.nextWave = 1;
    world.encounter.elapsedMs = at - GATE_LEAD_MS - 1000;
    expect(waveGatePads(ctx, world, cam, LAB_FULL_PALETTE, room)).toHaveLength(0);

    world.encounter.elapsedMs = at - 200;
    const pads = waveGatePads(ctx, world, cam, LAB_FULL_PALETTE, room);
    expect(pads.length).toBeGreaterThan(0);
    expect(pads.length).toBeLessThanOrEqual(second.spawns.length);
    expect(new Set(pads.map((p) => `${p.at.x},${p.at.y}`)).size).toBe(pads.length);
  });

  it('says nothing for a room that waits for a clear floor', () => {
    const room = ENCOUNTERS.siege_10;
    const world = createWorld(room, DEFAULT_COMBAT, 1);
    world.encounter.nextWave = 1;
    world.encounter.elapsedMs = 5_000;
    const ctx = { globalAlpha: 1 } as unknown as CanvasRenderingContext2D;
    expect(waveGatePads(ctx, world, makeCamera(800, 600), LAB_FULL_PALETTE, room)).toHaveLength(0);
  });

  it('arrives on a clock, in order', () => {
    const times = waves().map((wave) => wave.atMs);
    expect(times[0]).toBe(0);
    for (let i = 1; i < times.length; i++) {
      expect(times[i], `w${i + 1}`).toBeGreaterThan(times[i - 1] as number);
    }
  });
});
