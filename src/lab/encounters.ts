
import type { CombatConfig, EncounterDef } from '../sim/types';
import {
  GENERATED_ID_PREFIX,
  hashEncounterContent,
  hashEncounterDef,
  parseEncounterContent,
} from './content';
import { ETERNAL_SIEGE_ID, eternalSiegeFrom } from './eternal-siege';
import { ENCOUNTER_DOCUMENT } from './rooms/index';

const content = parseEncounterContent(ENCOUNTER_DOCUMENT);

export const ENCOUNTER_CONTENT_HASH = hashEncounterContent(content);

const contentEncounter = (id: string): EncounterDef => {
  const encounter = content.encounters[id];
  if (encounter === undefined) throw new Error(`encounter content is missing '${id}'`);
  return encounter;
};

export const ETERNAL_SIEGE: EncounterDef = eternalSiegeFrom(
  content.encounters.concept_lantern_cloister,
);

export const ENCOUNTERS: Record<string, EncounterDef> = {
  ...content.encounters,
  [ETERNAL_SIEGE_ID]: ETERNAL_SIEGE,
};

export const LAB_DEFAULT_ENCOUNTER_ID = ETERNAL_SIEGE_ID;

export const DEFAULT_ENCOUNTER: EncounterDef = content.defaultEncounter;

export const DEFAULT_ENCOUNTER_ID = content.defaultEncounterId;

export const GENERATED_ENCOUNTER_IDS: readonly string[] = Object.keys(content.encounters).filter(
  (id) => id.startsWith(GENERATED_ID_PREFIX),
);

export const isGeneratedEncounter = (id: string): boolean => id.startsWith(GENERATED_ID_PREFIX);

let rerolled: { seed: number; encounters: Record<string, EncounterDef> } | null = null;

export const invalidateEncounterCache = (): void => {
  rerolled = null;
};

export const encountersForSeed = (seed: number): Record<string, EncounterDef> => {
  if (rerolled !== null && rerolled.seed === seed) return rerolled.encounters;
  const encounters = { ...ENCOUNTERS };

  encounters[ETERNAL_SIEGE_ID] = eternalSiegeFrom(content.encounters.concept_lantern_cloister, seed);
  if (GENERATED_ENCOUNTER_IDS.length > 0) {
    const fresh = parseEncounterContent(ENCOUNTER_DOCUMENT, { generatedSeed: seed });
    for (const id of GENERATED_ENCOUNTER_IDS) encounters[id] = fresh.encounters[id];
  }
  rerolled = { seed, encounters };
  return encounters;
};

export const encounterForSeed = (id: string, seed: number): EncounterDef =>
  encountersForSeed(seed)[id];

export const replayRefusal = (
  meta: { encounterId: string; seed: number; contentHash?: number; encounterHash?: number },
  contentHash: number = ENCOUNTER_CONTENT_HASH,
): string | null => {
  if (meta.contentHash !== undefined && meta.contentHash !== contentHash) {
    return 'recording was played on different content';
  }
  if (meta.encounterHash !== undefined) {
    const room = encounterForSeed(meta.encounterId, meta.seed);
    if (room !== undefined && hashEncounterDef(room) !== meta.encounterHash) {
      return 'recording was played on a differently generated room';
    }
  }
  return null;
};

export const SIEGE_10: EncounterDef = contentEncounter('siege_10');
export const SIEGE_10_PACED: EncounterDef = contentEncounter('siege_10_paced');

const waveHasBoss = (wave: EncounterDef['waves'][number], combat: CombatConfig): boolean =>
  wave.spawns.some((spawn) => combat.enemies[spawn.archetype].boss !== undefined);

export const encounterHasBoss = (encounter: EncounterDef, combat: CombatConfig): boolean =>
  encounter.waves.some((wave) => waveHasBoss(wave, combat));

export const encounterOpensWithBoss = (encounter: EncounterDef, combat: CombatConfig): boolean =>
  encounter.waves.length > 0 && waveHasBoss(encounter.waves[0], combat);
