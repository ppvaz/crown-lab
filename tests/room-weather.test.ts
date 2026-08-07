
import { describe, expect, it } from 'vitest';

import { RESPONSE, lean, roomResponse, stormAt } from '../src/render/room-light-lab';
import {
  CLEAR,
  WEATHER,
  WEATHER_PRESETS,
  currentWeatherId,
  filmStrength,
  rainAt,
  setWeather,
} from '../src/render/room-weather-lab';
import { createWorld } from '../src/sim/encounter';
import { DEFAULT_COMBAT, SLOWMO_PRESETS } from '../src/lab/config';
import { stepWorld } from '../src/sim/world';
import { NEUTRAL_INTENT, TICK_MS } from '../src/sim/types';
import { ENCOUNTERS } from '../src/lab/encounters';

const STORM = WEATHER_PRESETS.storm;

const world = () => {
  const def = ENCOUNTERS.concept_lantern_cloister_live;
  const w = createWorld(def, DEFAULT_COMBAT, 7);
  stepWorld(w, [NEUTRAL_INTENT], DEFAULT_COMBAT, SLOWMO_PRESETS.none, def);
  return w;
};

describe('rain is a condition, not an accumulator', () => {
  it('says where every drop is as a pure function of simulation time', () => {
    expect(rainAt(3717, STORM)).toEqual(rainAt(3717, STORM));
  });

  it('falls harder under a heavier sky, and not at all under a clear one', () => {
    expect(rainAt(1000, CLEAR)).toHaveLength(0);
    expect(rainAt(1000, WEATHER_PRESETS.drizzle).length)
      .toBeLessThan(rainAt(1000, STORM).length);
    expect(rainAt(1000, STORM)).toHaveLength(WEATHER.drops);
  });

  it('keeps every streak between the sky and the floor, tail above head', () => {
    for (let t = 0; t < WEATHER.fallMs * 3; t += 29) {
      for (const streak of rainAt(t, STORM)) {
        expect(streak.elevation).toBeGreaterThanOrEqual(0);
        expect(streak.elevation).toBeLessThanOrEqual(WEATHER.height);
        expect(streak.fromElevation).toBeGreaterThanOrEqual(streak.elevation);
        expect(streak.fromElevation).toBeLessThanOrEqual(WEATHER.height);
      }
    }
  });

  it('blows the fall off vertical only when there is wind', () => {
    const still = rainAt(2000, { rain: 1, lightning: 0, wind: 0 });
    const blown = rainAt(2000, { rain: 1, lightning: 0, wind: 0.4 });
    const drifted = blown.filter((b, i) => Math.hypot(b.at.x - still[i].at.x, b.at.y - still[i].at.y) > 0.01);
    expect(drifted.length).toBeGreaterThan(blown.length / 2);
    for (const streak of still) {
      expect(streak.at.x).toBeCloseTo(streak.from.x, 10);
      expect(streak.at.y).toBeCloseTo(streak.from.y, 10);
    }
  });

  it('scatters the drops over the court rather than crowding its middle', () => {
    const radii = rainAt(500, { rain: 1, lightning: 0, wind: 0 })
      .map((s) => Math.hypot(s.from.x, s.from.y));
    expect(Math.max(...radii)).toBeLessThanOrEqual(WEATHER.spread);
    const outer = radii.filter((r) => r > WEATHER.spread / 2).length;
    expect(outer / radii.length).toBeGreaterThan(0.5);
  });

  it('wets the floor it falls on, and never past a film', () => {
    expect(filmStrength(0.4, CLEAR)).toBe(0.4);
    expect(filmStrength(0.4, STORM)).toBeGreaterThan(0.4);
    expect(filmStrength(1, STORM)).toBe(1);
  });
});

describe('the storm lights a room that is still being fought in', () => {
  it('leaves a clear sky lighting the room exactly as no sky at all', () => {
    const w = world();
    expect(roomResponse(w, CLEAR)).toEqual(roomResponse(w));
    expect(roomResponse(w, CLEAR).storm).toBe(0);
  });

  it('strikes over a living king, which the death storm never did', () => {
    const w = world();
    const samples: number[] = [];
    for (let ms = 0; ms <= 30_000; ms += TICK_MS) {
      w.tick = ms / TICK_MS;
      samples.push(roomResponse(w, STORM).storm);
    }
    const lit = samples.filter((s) => s > 0.05);
    expect(lit.length).toBeGreaterThan(0);
    expect(lit.length / samples.length).toBeLessThan(0.1);
    expect(Math.max(...samples)).toBeGreaterThan(STORM.lightning * 0.8);
    expect(Math.max(...samples)).toBeLessThanOrEqual(STORM.lightning);
  });

  it('keeps a sky with no lightning in it dark', () => {
    const w = world();
    for (let ms = 0; ms <= 20_000; ms += TICK_MS) {
      w.tick = ms / TICK_MS;
      expect(roomResponse(w, WEATHER_PRESETS.drizzle).storm).toBe(0);
    }
  });

  it('takes the louder of the two storms and never their sum', () => {
    const w = world();
    const fellAt = w.tick;
    w.players[0].hp = 0;
    w.players[0].state = { ...w.players[0].state, kind: 'dead', enteredTick: fellAt };

    for (let ms = 0; ms <= 20_000; ms += TICK_MS) {
      w.tick = fellAt + ms / TICK_MS;
      const struck = roomResponse(w, STORM);
      const clear = roomResponse(w, CLEAR);
      const sky = STORM.lightning * stormAt(w.tick * TICK_MS, RESPONSE.skyPeriodMs);
      expect(struck.storm).toBeCloseTo(Math.max(clear.storm, sky), 10);
      const blend = lean(1, 1, struck.mourning, struck.storm).blend;
      expect(blend).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it('strikes on the same curve as the death storm, only rarer', () => {
    const count = (period: number): number => {
      let strikes = 0;
      let lastLit = false;
      for (let ms = 0; ms < 60_000; ms += TICK_MS) {
        const lit = stormAt(ms, period) > 0;
        if (lit && !lastLit) strikes++;
        lastLit = lit;
      }
      return strikes;
    };
    expect(count(RESPONSE.skyPeriodMs)).toBeLessThan(count(RESPONSE.stormPeriodMs));
    expect(count(RESPONSE.skyPeriodMs)).toBeGreaterThan(0);
    expect(stormAt(4321)).toBe(stormAt(4321, RESPONSE.stormPeriodMs));
  });
});

describe('the dial', () => {
  it('lands on the sky it names, and clears rather than throwing on one it does not', () => {
    try {
      expect(setWeather('storm')).toBe('storm');
      expect(currentWeatherId()).toBe('storm');
      expect(setWeather('typhoon')).toBe('clear');
      expect(currentWeatherId()).toBe('clear');
    } finally {
      setWeather('clear');
    }
  });
});
