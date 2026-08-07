
import { describe, expect, it } from 'vitest';
import {
  TRAVEL_REACH,
  createTravelState,
  interactTravel,
  nearTravelNpc,
  syncTravel,
  travelNpcFor,
  travelPrompt,
} from '../src/game/travel';

const PUBLIC_IDS = ['siege_10', 'first_blade'] as const;

describe('who is standing there', () => {
  it('places a speaker in both public encounters', () => {
    for (const id of PUBLIC_IDS) {
      expect(travelNpcFor(id), id).not.toBeNull();
    }
  });

  it('makes every route two-way, so no arena is a trap', () => {
    for (const id of PUBLIC_IDS) {
      const npc = travelNpcFor(id)!;
      expect(npc.to).not.toBe(id);
      const back = travelNpcFor(npc.to)!;
      expect(back.to).toBe(id);
    }
  });

  it('offers nobody in an encounter that is not public', () => {
    expect(travelNpcFor('wayfarer_court')).toBeNull();
    expect(travelNpcFor('')).toBeNull();
  });

  it('says nothing about encounters, levels or menus', () => {
    const forbidden = /encontro|encounter|n[íi]vel|level|menu|selec/i;
    for (const id of PUBLIC_IDS) {
      const npc = travelNpcFor(id)!;
      expect(npc.line, id).not.toMatch(forbidden);
      expect(npc.accept, id).not.toMatch(forbidden);
      expect(npc.name, id).not.toMatch(forbidden);
    }
  });
});

describe('reach', () => {
  const npc = travelNpcFor('siege_10')!;

  it('answers inside its radius and not outside', () => {
    expect(nearTravelNpc(npc, npc.at)).toBe(true);
    expect(nearTravelNpc(npc, { x: npc.at.x + TRAVEL_REACH - 0.1, y: npc.at.y })).toBe(true);
    expect(nearTravelNpc(npc, { x: npc.at.x + TRAVEL_REACH + 0.1, y: npc.at.y })).toBe(false);
  });

  it('keeps the speaker out of the fight in both arenas', () => {
    for (const id of PUBLIC_IDS) {
      const at = travelNpcFor(id)!.at;
      expect(Math.abs(at.x), id).toBeLessThanOrEqual(10);
      expect(Math.abs(at.y), id).toBeLessThanOrEqual(7);
      expect(nearTravelNpc(travelNpcFor(id)!, { x: 0, y: 5 }), `${id} vs the king's start`).toBe(
        false,
      );
      expect(nearTravelNpc(travelNpcFor(id)!, { x: 0, y: -5 }), `${id} vs the boss entry`).toBe(
        false,
      );
    }
  });
});

describe('the prompt', () => {
  const npc = travelNpcFor('siege_10')!;

  it('is silent out of reach', () => {
    const state = createTravelState();
    expect(travelPrompt(npc, { x: 9, y: -6 }, state, 'E')).toBeNull();
  });

  it('names the device verb, not a key', () => {
    const state = createTravelState();
    expect(travelPrompt(npc, npc.at, state, 'ACT')).toContain('ACT');
    expect(travelPrompt(npc, npc.at, state, 'ACT')).not.toContain('E ');
  });

  it('switches to the confirmation once the line is open', () => {
    const state = createTravelState();
    interactTravel(npc, npc.at, state);
    expect(travelPrompt(npc, npc.at, state, 'E')).toContain(npc.accept);
  });
});

describe('interaction', () => {
  const npc = travelNpcFor('siege_10')!;

  it('takes two presses to travel', () => {
    const state = createTravelState();
    expect(interactTravel(npc, npc.at, state)).toBeNull();
    expect(state.open).toBe(true);
    expect(interactTravel(npc, npc.at, state)).toBe('first_blade');
    expect(state.open).toBe(false);
  });

  it('ignores a press from out of reach', () => {
    const state = createTravelState();
    expect(interactTravel(npc, { x: 9, y: -6 }, state)).toBeNull();
    expect(state.open).toBe(false);
  });

  it('closes the line when the king walks away', () => {
    const state = createTravelState();
    interactTravel(npc, npc.at, state);
    syncTravel(npc, { x: 9, y: -6 }, state);
    expect(state.open).toBe(false);
    expect(interactTravel(npc, { x: 9, y: -6 }, state)).toBeNull();
  });

  it('does nothing at all where there is no speaker', () => {
    const state = createTravelState();
    expect(interactTravel(null, { x: 0, y: 0 }, state)).toBeNull();
    expect(travelPrompt(null, { x: 0, y: 0 }, state, 'E')).toBeNull();
  });
});
