
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  moveSpawn,
  movePlayerStart,
  openDocument,
  selectEncounter,
  selectedEncounter,
  openRoom,
  serialize,
  serializeRoom,
  setSpawnArchetype,
  setWaveAtMs,
} from '../src/app/editor-state';

const ROOMS = join(process.cwd(), 'src/lab/rooms');
const roomFile = (id: string): string => join(ROOMS, `${id.replace(/_/g, '-')}.json`);
const vocabulary = JSON.parse(readFileSync(join(ROOMS, 'vocabulary.json'), 'utf8')) as Record<
  string,
  unknown
>;
const roomIds = readFileSync(join(ROOMS, 'index.ts'), 'utf8')
  .split('const ORDER = [')[1]
  .split('];')[0]
  .split(',')
  .map((entry) => entry.trim())
  .filter((entry) => entry !== '')
  .map((entry) => entry.toLowerCase());
const contentText = `${JSON.stringify(
  {
    ...vocabulary,
    encounters: roomIds.map(
      (id) => JSON.parse(readFileSync(roomFile(id), 'utf8')) as Record<string, unknown>,
    ),
  },
  null,
  2,
)}\n`;

describe('openDocument', () => {
  it('opens the real content document valid, first encounter selected', () => {
    const state = openDocument(contentText);
    expect(state.error).toBeNull();
    expect(state.parsed).not.toBeNull();
    expect(state.selectedId).toBe(state.doc.encounters[0].id);
    expect(state.dirty).toBe(false);
  });

  it('reports non-JSON and an invalid document with the loader’s own message', () => {
    expect(openDocument('nope').error).toBe('not JSON');
    const state = openDocument('{"version": 99, "arenas": {}, "encounters": []}');
    expect(state.error).toMatch(/document\.version/);
    expect(state.parsed).toBeNull();
  });
});

describe('edits', () => {
  it('moves a spawn on the raw document, snapped, and stays valid', () => {
    let state = openDocument(contentText);
    state = selectEncounter(state, 'kernel_guard');
    state = moveSpawn(state, 0, 0, { x: 4.11111, y: -0.5 });
    expect(state.error).toBeNull();
    expect(selectedEncounter(state)?.waves[0].spawns[0].at).toEqual({ x: 4.11, y: -0.5 });
    expect(state.dirty).toBe(true);
    expect(state.parsed?.encounters.kernel_guard.waves[0].spawns[0].at).toEqual({ x: 4.11, y: -0.5 });
  });

  it('replaces an authored rotateDegrees point when moved — a drag is a new authored position', () => {
    let state = openDocument(contentText);
    state = selectEncounter(state, 'spacing_archer');
    expect(selectedEncounter(state)?.playerStart.rotateDegrees).toBe(-20);
    state = movePlayerStart(state, { x: 1, y: 2 });
    expect(selectedEncounter(state)?.playerStart).toEqual({ x: 1, y: 2 });
  });

  it('surfaces the loader’s refusal when an edit breaks the format, and keeps the raw edit', () => {
    let state = openDocument(contentText);
    state = selectEncounter(state, 'kernel_guard');
    state = setSpawnArchetype(state, 0, 0, 'necromancer');
    expect(state.error).toMatch(/unknown archetype 'necromancer'/);
    expect(state.parsed).toBeNull();
    expect(selectedEncounter(state)?.waves[0].spawns[0].archetype).toBe('necromancer');

    state = setSpawnArchetype(state, 0, 0, 'guard');
    expect(state.error).toBeNull();
    expect(state.parsed).not.toBeNull();
  });

  it('edits wave timing including the null that means wait-for-clear', () => {
    let state = openDocument(contentText);
    state = selectEncounter(state, 'court_45s');
    state = setWaveAtMs(state, 1, null);
    expect(state.error).toBeNull();
    expect(selectedEncounter(state)?.waves[1].atMs).toBeNull();
  });

  it('never mutates the previous state — undo is a reference away', () => {
    const before = openDocument(contentText);
    const after = moveSpawn(selectEncounter(before, 'kernel_guard'), 0, 0, { x: 9, y: 0 });
    expect(before.doc.encounters.find((e) => e.id === 'kernel_guard')?.waves[0].spawns[0].at)
      .not.toEqual(after.doc.encounters.find((e) => e.id === 'kernel_guard')?.waves[0].spawns[0].at);
  });
});

describe('serialize', () => {
  it('round-trips the untouched document byte for byte', () => {
    expect(serialize(openDocument(contentText))).toBe(contentText);
  });

  it('emits a document the loader accepts after edits', () => {
    let state = openDocument(contentText);
    state = selectEncounter(state, 'kernel_guard');
    state = moveSpawn(state, 0, 0, { x: 2.5, y: 1 });
    const reopened = openDocument(serialize(state));
    expect(reopened.error).toBeNull();
  });
});

describe('one room at a time', () => {
  const document_ = JSON.parse(contentText) as {
    version: unknown;
    arenas: unknown;
    defaultEncounterId: unknown;
    defaultEncounter: unknown;
    encounters: Array<{ id: string }>;
  };
  const vocabulary = {
    version: document_.version,
    arenas: document_.arenas,
    defaultEncounterId: document_.defaultEncounterId,
    defaultEncounter: document_.defaultEncounter,
  };
  const roomText = (id: string): string =>
    `${JSON.stringify(document_.encounters.find((entry) => entry.id === id), null, 2)}\n`;

  it('validates a room through the same loader the game uses', () => {
    const state = openRoom(roomText('kernel_guard'), vocabulary);
    expect(state.error).toBeNull();
    expect(state.parsed).not.toBeNull();
    expect(state.selectedId).toBe('kernel_guard');
  });

  it('round-trips an untouched room byte for byte', () => {
    const text = roomText('siege_10');
    expect(serializeRoom(openRoom(text, vocabulary))).toBe(text);
  });

  it('serializes the room alone, not the document assembled around it', () => {
    const emitted = JSON.parse(serializeRoom(openRoom(roomText('first_blade'), vocabulary))) as Record<string, unknown>;
    expect(emitted.id).toBe('first_blade');
    expect(emitted.arenas).toBeUndefined();
    expect(emitted.encounters).toBeUndefined();
    expect(emitted.version).toBeUndefined();
  });

  it('reports the loader\'s own message when a room is invalid', () => {
    const broken = JSON.stringify({ ...JSON.parse(roomText('kernel_guard')), timeLimitMs: 'soon' });
    const state = openRoom(broken, vocabulary);
    expect(state.parsed).toBeNull();
    expect(state.error).toMatch(/timeLimitMs/);
  });
});
