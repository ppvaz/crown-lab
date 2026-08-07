
import { parseEncounterContent } from '../lab/content';
import type { EncounterContent } from '../lab/content';

interface RawPoint {
  x: number;
  y: number;
  [key: string]: unknown;
}

interface RawSpawn {
  archetype: string;
  at: RawPoint;
  [key: string]: unknown;
}

interface RawWave {
  id: string;
  atMs: number | null;
  spawns: RawSpawn[];
  [key: string]: unknown;
}

interface RawEncounter {
  id: string;
  arena: string;
  playerStart: RawPoint;
  waves: RawWave[];
  timeLimitMs: number | null;
  [key: string]: unknown;
}

interface RawDocument {
  encounters: RawEncounter[];
  [key: string]: unknown;
}

export interface EditorState {
  doc: RawDocument;
  parsed: EncounterContent | null;
  error: string | null;
  selectedId: string | null;
  dirty: boolean;
}

const validate = (doc: RawDocument): { parsed: EncounterContent | null; error: string | null } => {
  try {
    return { parsed: parseEncounterContent(doc), error: null };
  } catch (failure) {
    return { parsed: null, error: failure instanceof Error ? failure.message : String(failure) };
  }
};

export interface RoomVocabulary {
  version: unknown;
  arenas: unknown;
  defaultEncounterId: unknown;
  defaultEncounter: unknown;
}

export const openRoom = (text: string, vocabulary: RoomVocabulary): EditorState => {
  let room: RawEncounter;
  try {
    room = JSON.parse(text) as RawEncounter;
  } catch {
    return { doc: { encounters: [] }, parsed: null, error: 'not JSON', selectedId: null, dirty: false };
  }
  const doc: RawDocument = {
    ...(vocabulary as unknown as Record<string, unknown>),
    defaultEncounterId: room.id,
    defaultEncounter: room,
    encounters: [room],
  };
  const { parsed, error } = validate(doc);
  return { doc, parsed, error, selectedId: room.id ?? null, dirty: false };
};

export const serializeRoom = (state: EditorState): string => {
  const room = state.doc.encounters[0];
  return `${JSON.stringify(room, null, 2)}\n`;
};

export const openDocument = (text: string): EditorState => {
  let doc: RawDocument;
  try {
    doc = JSON.parse(text) as RawDocument;
  } catch {
    return { doc: { encounters: [] }, parsed: null, error: 'not JSON', selectedId: null, dirty: false };
  }
  const { parsed, error } = validate(doc);
  const first = Array.isArray(doc.encounters) ? doc.encounters[0]?.id ?? null : null;
  return { doc, parsed, error, selectedId: first, dirty: false };
};

export const selectEncounter = (state: EditorState, id: string): EditorState => ({
  ...state,
  selectedId: state.doc.encounters.some((entry) => entry.id === id) ? id : state.selectedId,
});

export const selectedEncounter = (state: EditorState): RawEncounter | null =>
  state.doc.encounters.find((entry) => entry.id === state.selectedId) ?? null;

const snap = (value: number): number => Math.round(value * 100) / 100;

const edited = (state: EditorState, doc: RawDocument): EditorState => {
  const { parsed, error } = validate(doc);
  return { ...state, doc, parsed, error, dirty: true };
};

const cloneDoc = (doc: RawDocument): RawDocument => structuredClone(doc);

export const movePlayerStart = (state: EditorState, at: { x: number; y: number }): EditorState => {
  const doc = cloneDoc(state.doc);
  const entry = doc.encounters.find((candidate) => candidate.id === state.selectedId);
  if (entry === undefined) return state;
  entry.playerStart = { x: snap(at.x), y: snap(at.y) };
  return edited(state, doc);
};

export const moveSpawn = (
  state: EditorState,
  waveIndex: number,
  spawnIndex: number,
  at: { x: number; y: number },
): EditorState => {
  const doc = cloneDoc(state.doc);
  const spawn = doc.encounters.find((candidate) => candidate.id === state.selectedId)?.waves[
    waveIndex
  ]?.spawns[spawnIndex];
  if (spawn === undefined) return state;
  spawn.at = { x: snap(at.x), y: snap(at.y) };
  return edited(state, doc);
};

export const setWaveAtMs = (
  state: EditorState,
  waveIndex: number,
  atMs: number | null,
): EditorState => {
  const doc = cloneDoc(state.doc);
  const wave = doc.encounters.find((candidate) => candidate.id === state.selectedId)?.waves[
    waveIndex
  ];
  if (wave === undefined) return state;
  wave.atMs = atMs;
  return edited(state, doc);
};

export const setSpawnArchetype = (
  state: EditorState,
  waveIndex: number,
  spawnIndex: number,
  archetype: string,
): EditorState => {
  const doc = cloneDoc(state.doc);
  const spawn = doc.encounters.find((candidate) => candidate.id === state.selectedId)?.waves[
    waveIndex
  ]?.spawns[spawnIndex];
  if (spawn === undefined) return state;
  spawn.archetype = archetype;
  return edited(state, doc);
};

export const serialize = (state: EditorState): string => JSON.stringify(state.doc, null, 2) + '\n';
