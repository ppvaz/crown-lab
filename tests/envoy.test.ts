
import { describe, expect, it } from 'vitest';

import { HERALD } from '../src/game/herald';
import { MARA } from '../src/game/escort';
import { COURT_PILLARS } from '../src/game/court';
import { POWER_STANDS } from '../src/game/armoury';
import { FIRST_CROWN } from '../src/game/route';
import {
  ENVOY,
  createEnvoyState,
  ENVOY_KEYS,
  ENVOY_KEY_COLUMNS,
  ENVOY_KEY_BACK,
  ENVOY_KEY_DELETE,
  ENVOY_KEY_SEND,
  answerEnvoy,
  envoyChoices,
  envoyCodeReady,
  envoyKeyAt,
  moveEnvoyCursor,
  typeEnvoy,
  envoyPrompt,
  envoyStage,
  envoyStanding,
  nearEnvoy,
  openEnvoy,
  pressEnvoy,
} from '../src/game/envoy';
import { ROOM_ALPHABET } from '../src/game/room-code';
import { TICK_MS } from '../src/sim/types';

const distance = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
  Math.hypot(a.x - b.x, a.y - b.y);

const court = FIRST_CROWN.nodes[0];

describe('where the envoy stands', () => {
  it('is out of reach of every other thing a press could mean', () => {
    expect(distance(ENVOY.at, HERALD.at)).toBeGreaterThan(ENVOY.reach + 1.8);
    expect(distance(ENVOY.at, MARA.at)).toBeGreaterThan(ENVOY.reach + 1.8);
    for (const stand of POWER_STANDS) {
      expect(distance(ENVOY.at, stand.at)).toBeGreaterThan(ENVOY.reach + 1.35);
    }
    expect(distance(ENVOY.at, court.spawnAt)).toBeGreaterThan(ENVOY.reach + 1.35);
    expect(distance(ENVOY.at, court.exitAt!)).toBeGreaterThan(ENVOY.reach + 1.35);
  });

  it('is not standing inside a pillar', () => {
    for (const pillar of COURT_PILLARS) {
      expect(distance(ENVOY.at, pillar.at)).toBeGreaterThan(ENVOY.radius + pillar.radius);
    }
  });

  it('is inside the court, with room to walk round him', () => {
    expect(ENVOY.at.y).toBeGreaterThan(-7 + ENVOY.reach);
    expect(Math.abs(ENVOY.at.x)).toBeLessThan(6.5 - ENVOY.reach);
  });
});

describe('what he is doing', () => {
  const idle = { state: '', available: true };

  it('has nothing to offer a build that cannot reach a handshake', () => {
    expect(envoyStage({ state: '', available: false })).toBe('unavailable');
    expect(envoyChoices('unavailable')).toEqual(['leave']);
    expect(envoyStanding('unavailable', '')).toMatch(/shut/i);
    expect(envoyStanding('unavailable', '')).not.toMatch(/signal|url|server|handshake/i);
  });

  it('offers both halves before there is a session', () => {
    expect(envoyStage(idle)).toBe('idle');
    expect(envoyChoices('idle')).toEqual(['call', 'answer', 'leave']);
  });

  it('says the room code, because that is what has to leave the conversation', () => {
    expect(envoyStanding('calling', 'ABC234')).toContain('ABC234');
    expect(envoyStanding('calling', '')).not.toMatch(/word is/i);
  });
});

describe('what a press does', () => {
  const idle = { state: '', available: true };

  it('opens the conversation before it does anything else', () => {
    const state = createEnvoyState();
    expect(pressEnvoy(state, 'idle', ENVOY.at)).toBe('open');
  });

  it('calls a king from the first line, and answers from the second', () => {
    const state = createEnvoyState();
    openEnvoy(state, 0);
    expect(pressEnvoy(state, 'idle', ENVOY.at)).toBe('call');
    state.selected = 1;
    expect(pressEnvoy(state, 'idle', ENVOY.at)).toBe('answer');
    state.selected = 2;
    expect(pressEnvoy(state, 'idle', ENVOY.at)).toBe('leave');
  });

  it('refuses to enter a room until six characters have been typed', () => {
    const state = createEnvoyState();
    openEnvoy(state, 0);
    answerEnvoy(state, 0, 0);
    state.keyRow = ENVOY_KEYS.length - 1;
    state.keyCol = ENVOY_KEYS[ENVOY_KEYS.length - 1].indexOf(ENVOY_KEY_SEND);
    expect(pressEnvoy(state, 'idle', ENVOY.at)).toBe('none');
    state.entry = 'ABC234';
    expect(pressEnvoy(state, 'idle', ENVOY.at)).toBe('join');
  });

  it('lets the word be heard again, and answered instead', () => {
    const state = createEnvoyState();
    expect(pressEnvoy(state, 'calling', ENVOY.at)).toBe('open');
    expect(envoyChoices('calling')).toEqual(['copy', 'answer', 'leave']);

    openEnvoy(state, 0);
    expect(pressEnvoy(state, 'calling', ENVOY.at)).toBe('copy');
    state.selected = 1;
    expect(pressEnvoy(state, 'calling', ENVOY.at)).toBe('answer');
  });

  it('says the word while standing there, so it survives the panel closing', () => {
    expect(envoyStanding('calling', 'ABC234')).toContain('ABC234');
    expect(envoyStanding('calling', '')).not.toMatch(/word is/i);
  });

  it('does nothing at all from across the room', () => {
    const away = { x: ENVOY.at.x + ENVOY.reach + 0.01, y: ENVOY.at.y };
    expect(nearEnvoy(away)).toBe(false);
    expect(pressEnvoy(createEnvoyState(), 'idle', away)).toBe('none');
    expect(envoyPrompt(createEnvoyState(), 'idle', away, 'E')).toBeNull();
  });

  it('speaks the language of the world rather than of the interface', () => {
    expect(ENVOY.name).toBe('THE ENVOY');
    for (const stage of ['idle', 'calling', 'joined', 'unavailable'] as const) {
      expect(envoyStanding(stage, 'ABC234')).not.toMatch(/[áâãàéêíóôõúç]/i);
    }
  });

  it('names the control this device actually has', () => {
    expect(envoyPrompt(createEnvoyState(), envoyStage(idle), ENVOY.at, 'ACT')).toContain('ACT');
    expect(envoyPrompt(createEnvoyState(), envoyStage(idle), ENVOY.at, 'E')).toContain('E ');
  });
});

describe('what he says about the session that just ended', () => {
  it('offers the road again rather than claiming it is shut', () => {
    expect(envoyStanding('idle', '', 'left')).not.toMatch(/shut|not today/i);
    expect(envoyStanding('idle', '', 'refused')).not.toMatch(/shut|not today/i);
    expect(envoyChoices('idle')).toEqual(['call', 'answer', 'leave']);
  });

  it('tells a partner who vanished apart from a word that reached nobody', () => {
    expect(envoyStanding('idle', '', 'left')).not.toBe(envoyStanding('idle', '', 'refused'));

  });

  it('is the ordinary invitation again once nothing is owed', () => {
    expect(envoyStanding('idle', '', 'none')).toBe(envoyStanding('idle', ''));

  });

  it('never lets a parting overwrite what a live session is doing', () => {
    for (const parting of ['left', 'refused'] as const) {
      expect(envoyStanding('calling', 'ABC234', parting)).toContain('ABC234');
      expect(envoyStanding('unavailable', '', parting)).toMatch(/shut/i);
    }
  });

  it('speaks the language of the world here too', () => {
    for (const parting of ['left', 'refused'] as const) {
      expect(envoyStanding('idle', '', parting)).not.toMatch(/[áâãàéêíóôõúç]/i);
    }
  });
});

describe('typing a room code on the grid', () => {
  const answering = () => {
    const state = createEnvoyState();
    openEnvoy(state, 0);
    answerEnvoy(state, 0, 0);
    return state;
  };
  const at = (state: ReturnType<typeof answering>, key: string) => {
    for (let row = 0; row < ENVOY_KEYS.length; row += 1) {
      const col = ENVOY_KEYS[row].indexOf(key);
      if (col !== -1) {
        state.keyRow = row;
        state.keyCol = col;
        return;
      }
    }
    throw new Error(`no such key: ${key}`);
  };

  it('offers every character a room code can contain, and nothing else', () => {
    const letters = ENVOY_KEYS.flat().filter(
      (key) => key !== ENVOY_KEY_DELETE && key !== ENVOY_KEY_SEND && key !== ENVOY_KEY_BACK,
    );
    expect(letters.join('')).toBe(ROOM_ALPHABET);
    for (const ambiguous of ['I', 'O', '0', '1']) expect(letters).not.toContain(ambiguous);
  });

  it('lays its rows out from the alphabet rather than beside it', () => {
    expect(ENVOY_KEYS.flat().length).toBe(ROOM_ALPHABET.length + 3);
    for (const row of ENVOY_KEYS) expect(row.length).toBeLessThanOrEqual(ENVOY_KEY_COLUMNS + 3);
  });

  it('fits the narrowest region the audit measures', () => {
    for (const row of ENVOY_KEYS) {
      const width = row.reduce((n, cell) => n + cell.length, 0) + (row.length - 1) + 1;
      expect(width).toBeLessThanOrEqual(32);
    }
  });

  it('types the cell under the cursor', () => {
    const state = answering();
    at(state, 'A');
    typeEnvoy(state);
    at(state, '7');
    typeEnvoy(state);
    expect(state.entry).toBe('A7');
  });

  it('stops at six, because the next thing to do with a full code is send it', () => {
    const state = answering();
    at(state, 'A');
    for (let i = 0; i < 9; i += 1) typeEnvoy(state);
    expect(state.entry).toBe('AAAAAA');
    expect(envoyCodeReady(state)).toBe(true);
  });

  it('deletes backwards, and leaves the step when there is nothing left to delete', () => {
    const state = answering();
    at(state, 'B');
    typeEnvoy(state);
    at(state, ENVOY_KEY_DELETE);
    typeEnvoy(state);
    expect(state.entry).toBe('');
    expect(state.answering).toBe(true);
    typeEnvoy(state);
    expect(state.answering).toBe(false);
  });

  it('always has a way back to the list', () => {
    const state = answering();
    at(state, 'C');
    typeEnvoy(state);
    at(state, ENVOY_KEY_BACK);
    typeEnvoy(state);
    expect(state.answering).toBe(false);
    expect(state.open).toBe(true);
  });

  it('sends only from SEND, and only with six characters', () => {
    const state = answering();
    at(state, ENVOY_KEY_SEND);
    expect(pressEnvoy(state, 'idle', ENVOY.at)).toBe('none');
    state.entry = 'ABC23';
    expect(pressEnvoy(state, 'idle', ENVOY.at)).toBe('none');
    state.entry = 'ABC234';
    expect(pressEnvoy(state, 'idle', ENVOY.at)).toBe('join');
    at(state, 'A');
    expect(pressEnvoy(state, 'idle', ENVOY.at)).toBe('type');
  });
});

describe('steering the grid', () => {
  const answering = () => {
    const state = createEnvoyState();
    openEnvoy(state, 0);
    answerEnvoy(state, 0, 0);
    return state;
  };
  const PUSH = 1 / Math.SQRT2;

  it('steps once for a held stick, on each axis independently', () => {
    const state = answering();
    moveEnvoyCursor(state, PUSH, 0);
    expect(state.keyCol).toBe(1);
    moveEnvoyCursor(state, PUSH, 0);
    expect(state.keyCol).toBe(1);
    moveEnvoyCursor(state, 0, 0);
    moveEnvoyCursor(state, PUSH, 0);
    expect(state.keyCol).toBe(2);
  });

  it('refuses a diagonal rather than stepping both axes', () => {

    const state = answering();
    moveEnvoyCursor(state, PUSH, PUSH);
    expect(state.keyCol).toBe(0);
    expect(state.keyRow).toBe(0);
  });

  it('does not walk the cursor when a held thumb rotates', () => {
    const state = answering();
    moveEnvoyCursor(state, PUSH, 0);
    expect(state.keyCol).toBe(1);
    for (const degrees of [10, 25, 34, 20, 5, 30, 12]) {
      const radians = (degrees * Math.PI) / 180;
      moveEnvoyCursor(state, Math.cos(radians) * PUSH, Math.sin(radians) * PUSH);
    }
    expect(state.keyCol).toBe(1);
  });

  it('repeats a held lean, because a row is twelve cells wide', () => {
    const state = answering();
    moveEnvoyCursor(state, PUSH, 0, TICK_MS);
    expect(state.keyCol).toBe(1);
    let ms = 0;
    while (ms < 300) {
      moveEnvoyCursor(state, PUSH, 0, TICK_MS);
      ms += TICK_MS;
    }
    expect(state.keyCol).toBe(1);
    while (ms < 900) {
      moveEnvoyCursor(state, PUSH, 0, TICK_MS);
      ms += TICK_MS;
    }
    expect(state.keyCol).toBeGreaterThan(4);
  });

  it('wraps across a row and between rows', () => {
    const state = answering();
    moveEnvoyCursor(state, -PUSH, 0);
    expect(state.keyCol).toBe(ENVOY_KEYS[0].length - 1);
    moveEnvoyCursor(state, 0, -PUSH);
    expect(state.keyRow).toBe(ENVOY_KEYS.length - 1);
  });

  it('clamps the column onto a shorter row rather than landing on nothing', () => {
    const state = answering();
    const last = ENVOY_KEYS.length - 1;
    state.keyCol = ENVOY_KEYS[0].length - 1;
    for (let row = 0; row < last; row += 1) {
      moveEnvoyCursor(state, 0, 0);
      moveEnvoyCursor(state, 0, PUSH);
    }
    expect(state.keyRow).toBe(last);
    expect(state.keyCol).toBeLessThan(ENVOY_KEYS[last].length);
    expect(envoyKeyAt(state)).not.toBe('');
  });

  it('reaches every cell, so no key is unpressable', () => {
    const state = answering();
    const seen = new Set<string>();
    for (let row = 0; row < ENVOY_KEYS.length; row += 1) {
      for (let col = 0; col < ENVOY_KEYS[row].length; col += 1) {
        state.keyRow = row;
        state.keyCol = col;
        seen.add(envoyKeyAt(state));
      }
    }
    expect(seen.size).toBe(ENVOY_KEYS.flat().length);
    expect(seen.has(ENVOY_KEY_SEND)).toBe(true);
  });

  it('does not spend the lean that opened it as the first cursor move', () => {
    const state = createEnvoyState();
    openEnvoy(state, 0);
    answerEnvoy(state, PUSH, 0);
    moveEnvoyCursor(state, PUSH, 0);
    expect(state.keyRow).toBe(0);
    expect(state.keyCol).toBe(0);
    moveEnvoyCursor(state, 0, 0);
    moveEnvoyCursor(state, PUSH, 0);
    expect(state.keyCol).toBe(1);
  });
});
