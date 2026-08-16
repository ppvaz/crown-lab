
import { arenaContains } from '../src/sim/arena';
import { ETERNAL_SIEGE_ID } from '../src/lab/eternal-siege';
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
