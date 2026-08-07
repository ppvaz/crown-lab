
import { describe, expect, it } from 'vitest';

import {
  coopControlsView,
  isRoomCode,
  normalizeRoomEntry,
  type CoopControlsState,
} from '../src/app/coop-controls';

const state = (over: Partial<CoopControlsState> = {}): CoopControlsState => ({
  available: true,
  session: '',
  room: '',
  entry: '',
  entryOpen: false,
  ...over,
});

describe('what somebody typed, as a room code', () => {
  it('takes a code however it is capitalized', () => {
    expect(normalizeRoomEntry('abc234')).toEqual({ code: 'ABC234', hint: '' });
  });

  it('takes the whole join link, because that is what the host copies', () => {
    expect(normalizeRoomEntry('http://192.168.1.4:5173/?mode=lab&join=KMP7ZQ').code).toBe('KMP7ZQ');
    expect(normalizeRoomEntry('?join=abc234').code).toBe('ABC234');
  });

  it('stops at six characters rather than accepting a code that cannot exist', () => {
    expect(normalizeRoomEntry('ABC234XYZ').code).toBe('ABC234');
  });

  it('says which four characters the alphabet leaves out, instead of dropping them silently', () => {
    const heard = normalizeRoomEntry('ABC2I4');
    expect(heard.code).toBe('ABC24');
    expect(heard.hint).toContain('I, O, 0 or 1');
  });

  it('ignores punctuation and spaces without complaining about them', () => {
    expect(normalizeRoomEntry(' abc-234 ')).toEqual({ code: 'ABC234', hint: '' });
  });

  it('knows a room code from something the service would refuse', () => {
    expect(isRoomCode('ABC234')).toBe(true);
    expect(isRoomCode('ABC23')).toBe(false);
    expect(isRoomCode('ABC2I4')).toBe(false);
  });
});

describe('what the controls show', () => {
  it('offers both doors before there is a session', () => {
    const view = coopControlsView(state());
    expect(view.host.hidden).toBe(false);
    expect(view.join.hidden).toBe(false);
    expect(view.code.hidden).toBe(true);
    expect(view.link.hidden).toBe(true);
  });

  it('refuses to enter a room until the code could be one', () => {
    const partial = coopControlsView(state({ entryOpen: true, entry: 'ABC' }));
    expect(partial.join.disabled).toBe(true);
    expect(partial.hint).toBe("3/6 — the other player's room code");

    const whole = coopControlsView(state({ entryOpen: true, entry: 'abc234' }));
    expect(whole.join.disabled).toBe(false);
    expect(whole.code.value).toBe('ABC234');
    expect(whole.hint).toBe('');
  });

  it('takes the create button away while a code is being typed', () => {
    expect(coopControlsView(state({ entryOpen: true, entry: 'AB' })).host.hidden).toBe(true);
  });

  it('leaves only the link once a session exists, and only once there is a room', () => {
    const waiting = coopControlsView(state({ session: 'waiting', room: 'ABC234' }));
    expect(waiting.host.hidden).toBe(true);
    expect(waiting.join.hidden).toBe(true);
    expect(waiting.link.hidden).toBe(false);

    expect(coopControlsView(state({ session: 'connecting', room: '' })).link.hidden).toBe(true);
  });

  it('says why there is no co-op rather than showing nothing at all', () => {
    const view = coopControlsView(state({ available: false }));
    expect(view.host.hidden).toBe(true);
    expect(view.hint).toContain('signaling');
  });
});

describe('the button that seals a roster early', () => {
  const lobby = (over: Partial<NonNullable<CoopControlsState['lobby']>> = {}) => ({
    peers: ['a', 'b', 'c'],
    linked: ['b', 'c'],
    capacity: 3,
    isHost: true,
    ...over,
  });

  const inSession = (over: Partial<CoopControlsState> = {}): CoopControlsState => ({
    available: true,
    session: 'waiting',
    room: 'ABC234',
    entry: '',
    entryOpen: false,
    lobby: lobby(),
    ...over,
  });

  it('offers to start, and says how many it would start with', () => {
    const view = coopControlsView(inSession());
    expect(view.start.hidden).toBe(false);
    expect(view.start.disabled).toBe(false);
    expect(view.start.label).toBe('Start with 3');
  });

  it('never offers it to a guest', () => {
    expect(coopControlsView(inSession({ lobby: lobby({ isHost: false }) })).start.hidden).toBe(true);
  });

  it('never offers it in a room for two, which seals itself', () => {
    const pair = lobby({ capacity: 2, peers: ['a', 'b'], linked: ['b'] });
    expect(coopControlsView(inSession({ lobby: pair })).start.hidden).toBe(true);
  });

  it('disables rather than hides it while a leg is still connecting', () => {
    const connecting = lobby({ peers: ['a', 'b', 'c'], linked: ['b'] });
    const view = coopControlsView(inSession({ lobby: connecting }));
    expect(view.start.hidden).toBe(false);
    expect(view.start.disabled).toBe(true);
    expect(view.hint).toBe('2/3 in the room — connecting');
  });

  it('will not start a session of one', () => {
    const alone = lobby({ peers: ['a'], linked: [] });
    expect(coopControlsView(inSession({ lobby: alone })).start.disabled).toBe(true);
  });

  it('says nothing about a lobby that is not one', () => {
    expect(coopControlsView(inSession({ lobby: null })).start.hidden).toBe(true);
    expect(coopControlsView(inSession({ lobby: null })).hint).toBe('');
  });
});
