
import { ETERNAL_SIEGE_ID, ETERNAL_SIEGE_SPEC } from '../src/lab/eternal-siege';
import { hashEncounterContent, hashEncounterDef, parseEncounterContent } from '../src/lab/content';
import {
  ENCOUNTER_CONTENT_HASH,
  encounterForSeed,
  invalidateEncounterCache,
} from '../src/lab/encounters';
import { ENCOUNTER_DOCUMENT } from '../src/lab/rooms/index';

const siegeAt = (seed: number) => {
  invalidateEncounterCache();
  return encounterForSeed(ETERNAL_SIEGE_ID, seed);
};

describe('the encounter hash names the room a run stood in', () => {
  afterEach(() => {
    ETERNAL_SIEGE_SPEC.msPerThreat = 4000;
    ETERNAL_SIEGE_SPEC.startWave = 1;
    invalidateEncounterCache();
  });

  it('serves a pinned wave the bodies that wave would have had', () => {
    const sig = (w: { id: string; spawns: { archetype: string }[] }) =>
      `${w.id}:${w.spawns.map((s) => s.archetype).join(',')}`;
    const full = siegeAt(1).waves;
    ETERNAL_SIEGE_SPEC.startWave = 50;
    const pinned = siegeAt(1).waves;
    expect(pinned.length).toBe(full.length - 49);
    expect(pinned.map(sig)).toEqual(full.slice(49).map(sig));
    expect(pinned[0].atMs).toBe(0);
    expect((pinned[1].atMs ?? 0) - (pinned[0].atMs ?? 0)).toBe(
      (full[50].atMs ?? 0) - (full[49].atMs ?? 0),
    );
  });

  it('is stable for the same room, and is not the content hash', () => {
    expect(hashEncounterDef(siegeAt(1))).toBe(hashEncounterDef(siegeAt(1)));
    expect(hashEncounterDef(siegeAt(1))).not.toBe(ENCOUNTER_CONTENT_HASH);
  });

  it('separates two seeds that the content hash cannot', () => {
    expect(hashEncounterDef(siegeAt(1))).not.toBe(hashEncounterDef(siegeAt(2)));
  });

  it('separates a generator change at one fixed seed — the case seed and contentHash both miss', () => {
    const before = hashEncounterDef(siegeAt(1));

    ETERNAL_SIEGE_SPEC.msPerThreat = 2600;
    const after = hashEncounterDef(siegeAt(1));

    expect(ENCOUNTER_CONTENT_HASH).toBe(hashEncounterContent(parseEncounterContent(ENCOUNTER_DOCUMENT)));
    expect(after).not.toBe(before);
  });

  it('ignores prose, because a replay is invalidated by a vertex and never by a note', () => {
    const def = siegeAt(1);
    expect(hashEncounterDef({ ...def, description: 'rewritten' })).toBe(hashEncounterDef(def));
  });

  it('moves when a wave moves, which is what makes it worth recording', () => {
    const def = siegeAt(1);
    const shifted = {
      ...def,
      waves: def.waves.map((wave, i) => (i === 3 ? { ...wave, atMs: (wave.atMs ?? 0) + 1 } : wave)),
    };
    expect(hashEncounterDef(shifted)).not.toBe(hashEncounterDef(def));
  });

  it('is written for an authored room too, where it is redundant on purpose', () => {
    expect(Number.isInteger(hashEncounterDef(encounterForSeed('kernel_guard', 1)))).toBe(true);
  });
});
