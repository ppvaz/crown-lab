
import type { CombatConfig, EncounterDef } from '../sim/types';
import { GENERATED_ID_PREFIX, hashEncounterContent, parseEncounterContent } from './content';
import { ENCOUNTER_DOCUMENT } from './rooms/index';

const content = parseEncounterContent(ENCOUNTER_DOCUMENT);

export const ENCOUNTER_CONTENT_HASH = hashEncounterContent(content);

const contentEncounter = (id: string): EncounterDef => {
  const encounter = content.encounters[id];
  if (encounter === undefined) throw new Error(`encounter content is missing '${id}'`);
  return encounter;
};

export const ENCOUNTERS: Record<string, EncounterDef> = content.encounters;

export const DEFAULT_ENCOUNTER: EncounterDef = content.defaultEncounter;

export const DEFAULT_ENCOUNTER_ID = content.defaultEncounterId;

export const GENERATED_ENCOUNTER_IDS: readonly string[] = Object.keys(content.encounters).filter(
  (id) => id.startsWith(GENERATED_ID_PREFIX),
);

export const isGeneratedEncounter = (id: string): boolean => id.startsWith(GENERATED_ID_PREFIX);

let rerolled: { seed: number; encounters: Record<string, EncounterDef> } | null = null;

export const encountersForSeed = (seed: number): Record<string, EncounterDef> => {
  if (GENERATED_ENCOUNTER_IDS.length === 0) return ENCOUNTERS;
  if (rerolled !== null && rerolled.seed === seed) return rerolled.encounters;
  const fresh = parseEncounterContent(ENCOUNTER_DOCUMENT, { generatedSeed: seed });
  const encounters = { ...ENCOUNTERS };
  for (const id of GENERATED_ENCOUNTER_IDS) encounters[id] = fresh.encounters[id];
  rerolled = { seed, encounters };
  return encounters;
};

export const encounterForSeed = (id: string, seed: number): EncounterDef =>
  encountersForSeed(seed)[id];

export const SIEGE_10: EncounterDef = contentEncounter('siege_10');
export const SIEGE_10_PACED: EncounterDef = contentEncounter('siege_10_paced');

export const encounterHasBoss = (encounter: EncounterDef, combat: CombatConfig): boolean =>
  encounter.waves.some((wave) =>
    wave.spawns.some((spawn) => combat.enemies[spawn.archetype].boss !== undefined),
  );
