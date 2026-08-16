
import { LAB_ROOMS } from '../src/render/rooms/index-lab';
import { FIRST_CROWN, ROUTES } from '../src/game/route';
import { PUBLIC_ROUTE_ROOMS, isPublicRoom } from '../src/game/public-profile';
import { arenaThemeFor } from '../src/render/arena-decor';
import {
  COMBAT_PRESETS,
  DEFAULT_COMBAT,
  PARRY_PRESETS,
  SLOWMO_PRESETS,
  DEFAULT_SLOWMO,
  DEFAULT_SLOWMO_ID,
} from '../src/lab/config';
import { ENCOUNTERS, DEFAULT_ENCOUNTER_ID } from '../src/lab/encounters';
import {
  PUBLIC_COMBAT,
  PUBLIC_ENCOUNTER,
  PUBLIC_ENCOUNTER_IDS,
  PUBLIC_ENCOUNTERS,
  PUBLIC_SLOWMO,
  PUBLIC_SLOWMO_STATIC,
} from '../src/game/public-profile';
import { arenaContains, arenaGeometryIsValid } from '../src/sim/arena';
import { bareWorld, intent, run } from './support/world';

const diffPaths = (a: unknown, b: unknown, prefix = ''): string[] => {
  if (a === b) return [];
  const bothObjects =
    typeof a === 'object' && a !== null && typeof b === 'object' && b !== null;
  if (!bothObjects) return [prefix];

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return [prefix];
    return a.flatMap((v, i) => diffPaths(v, b[i], `${prefix}[${i}]`));
  }

  const keys = new Set([
    ...Object.keys(a as object),
    ...Object.keys(b as object),
  ]);
  return [...keys].flatMap((k) =>
    diffPaths(
      (a as Record<string, unknown>)[k],
      (b as Record<string, unknown>)[k],
      prefix === '' ? k : `${prefix}.${k}`,
    ),
  );
};

const LABELS = new Set(['id', 'description']);

const axisOf = (presetName: string): string[] =>
  diffPaths(COMBAT_PRESETS[presetName], DEFAULT_COMBAT).filter((p) => !LABELS.has(p));

describe('the one-axis rule', () => {
  it.each([
    ['Parry_Strict', 'player.parry.'],
    ['Parry_Generous', 'player.parry.'],
    ['Heavy_Fast', 'player.attacks.heavy.'],
    ['Heavy_Committed', 'player.attacks.heavy.'],
    ['Kit_Sword_Shield', 'player.step.'],
    ['Broadsword', 'player.chain'],
  ])('%s moves only %s*', (preset, group) => {
    const changed = axisOf(preset);
    expect(changed.length).toBeGreaterThan(0);
    for (const path of changed) expect(path.startsWith(group)).toBe(true);
  });

  const MOVEMENT_GROUP = new Set([
    'player.moveSpeed',
    'player.acceleration',
    'player.step.distance',
  ]);

  it.each(['Movement_Agile', 'Movement_Deliberate'])('%s moves only the movement group', (preset) => {
    const changed = axisOf(preset);
    expect(changed.length).toBeGreaterThan(0);
    for (const path of changed) expect(MOVEMENT_GROUP.has(path)).toBe(true);
  });

  it('brackets each axis — the siblings sit on opposite sides of the default', () => {
    const d = DEFAULT_COMBAT.player;
    expect(COMBAT_PRESETS.Parry_Strict.player.parry.perfectMs).toBeLessThan(d.parry.perfectMs);
    expect(COMBAT_PRESETS.Parry_Generous.player.parry.perfectMs).toBeGreaterThan(d.parry.perfectMs);

    expect(COMBAT_PRESETS.Heavy_Fast.player.attacks.heavy.windupMs).toBeLessThan(
      d.attacks.heavy.windupMs,
    );
    expect(COMBAT_PRESETS.Heavy_Committed.player.attacks.heavy.windupMs).toBeGreaterThan(
      d.attacks.heavy.windupMs,
    );

    expect(COMBAT_PRESETS.Movement_Agile.player.moveSpeed).toBeGreaterThan(d.moveSpeed);
    expect(COMBAT_PRESETS.Movement_Deliberate.player.moveSpeed).toBeLessThan(d.moveSpeed);
  });
});

describe('presets are independent objects', () => {
  it('does not alias nested config between presets', () => {
    const a = COMBAT_PRESETS.Parry_Strict;
    const b = COMBAT_PRESETS.Parry_Generous;
    expect(a.player).not.toBe(b.player);
    expect(a.player.attacks).not.toBe(b.player.attacks);
    expect(a.player.attacks.heavy).not.toBe(DEFAULT_COMBAT.player.attacks.heavy);
    expect(a.player.parry).not.toBe(PARRY_PRESETS.Parry_Strict);
    expect(a.enemies.guard.attacks).not.toBe(DEFAULT_COMBAT.enemies.guard.attacks);
  });

  it('names every preset after its own key', () => {
    for (const [key, preset] of Object.entries(COMBAT_PRESETS)) {
      expect(preset.id).toBe(key);
    }
  });
});

describe('public distribution allow-list', () => {
  it('matches the Lab kernel without carrying unpublished content', () => {
    expect(PUBLIC_COMBAT.player).toEqual(DEFAULT_COMBAT.player);
    for (const archetype of [
      'guard',
      'duelist',
      'archer',
      'first_blade',
      'captain',
      'chancellor',
      'glass_regent',
      'queen',
      'thorn_marshal',
    ] as const) {
      expect(PUBLIC_COMBAT.enemies[archetype]).toEqual(DEFAULT_COMBAT.enemies[archetype]);
    }
    expect(Object.keys(PUBLIC_COMBAT.enemies)).toEqual([
      'guard',
      'duelist',
      'archer',
      'first_blade',
      'captain',
      'chancellor',
      'glass_regent',
      'queen',
      'thorn_marshal',
    ]);
    expect(PUBLIC_COMBAT.power).toBe('lightning');


    for (const kind of ['lightning', 'blink', 'pull', 'push', 'freeze', 'incinerate', 'turncoat'] as const) {
      expect(PUBLIC_COMBAT.powers[kind], kind).toEqual(DEFAULT_COMBAT.powers[kind]);
    }
    expect(Object.keys(PUBLIC_COMBAT.powers).sort()).toEqual(
      Object.keys(DEFAULT_COMBAT.powers).sort(),
    );


    const reachable = Object.values(ROUTES).flatMap((route) => [...route.nodes, ...route.asides]);
    expect(Object.keys(PUBLIC_ENCOUNTERS).sort()).toEqual(
      [...new Set(reachable.map((n) => n.encounterId))].sort(),
    );
    for (const node of reachable) {
      expect(PUBLIC_ENCOUNTERS[node.encounterId], node.label).toEqual(
        ENCOUNTERS[node.encounterId],
      );
    }
    expect(PUBLIC_COMBAT.drops).toEqual(DEFAULT_COMBAT.drops);
    expect(PUBLIC_SLOWMO).toEqual(SLOWMO_PRESETS.none);

    expect(PUBLIC_SLOWMO_STATIC).toEqual(SLOWMO_PRESETS.shipped);

    expect(DEFAULT_SLOWMO).toEqual(SLOWMO_PRESETS.none);
    expect(DEFAULT_SLOWMO_ID).toBe('none');

    expect(PUBLIC_ENCOUNTER_IDS).toEqual(['siege_10', 'first_blade']);
    for (const id of PUBLIC_ENCOUNTER_IDS) {
      expect(PUBLIC_ENCOUNTERS[id]).toEqual(ENCOUNTERS[id]);
    }
    expect(PUBLIC_ENCOUNTER).toBe(PUBLIC_ENCOUNTERS.siege_10);
  });
});

describe('the king carries authority in the baseline kit', () => {
  it('makes both sword verbs move more than one body instead of poking a single target', () => {
    const { light, heavy } = DEFAULT_COMBAT.player.attacks;
    expect(light.maxTargets).toBeGreaterThan(1);
    expect(light.knockback).toBeGreaterThan(3);
    expect(heavy.maxTargets).toBeGreaterThanOrEqual(5);
    expect(heavy.damage * 2).toBeGreaterThanOrEqual(DEFAULT_COMBAT.enemies.guard.maxHp);
    expect(heavy.poiseDamage + DEFAULT_COMBAT.player.parry.poiseDamage).toBeGreaterThan(
      DEFAULT_COMBAT.enemies.guard.maxPoise,
    );
  });
});

describe('Kit_Sword_Shield — the 45-second target\'s kit constraint', () => {
  it('leaves the step inert rather than merely short', () => {
    const combat = COMBAT_PRESETS.Kit_Sword_Shield;
    const w = bareWorld(combat);
    const before = { ...w.players[0].pos };

    run(w, 1, intent({ stepPressed: true, move: { x: 1, y: 0 } }), { combat });

    expect(w.players[0].iframeMs).toBe(0);
    expect(w.players[0].vel).toEqual({ x: 0, y: 0 });

    run(w, 10, intent(), { combat });
    expect(w.players[0].pos).toEqual(before);
    expect(w.players[0].state.kind).toBe('idle');
  });

  it('still costs no stamina, so the input is not a hidden tax', () => {
    const combat = COMBAT_PRESETS.Kit_Sword_Shield;
    const w = bareWorld(combat);
    const before = w.players[0].stamina;
    run(w, 4, intent({ stepPressed: true }), { combat });
    expect(w.players[0].stamina).toBe(before);
  });
});

describe('parry windows', () => {
  it('orders strict inside balanced inside generous on every edge', () => {
    const s = PARRY_PRESETS.Parry_Strict;
    const b = PARRY_PRESETS.Parry_Balanced;
    const g = PARRY_PRESETS.Parry_Generous;
    expect(s.perfectMs).toBeLessThan(b.perfectMs);
    expect(b.perfectMs).toBeLessThan(g.perfectMs);
    expect(s.bufferMs).toBeLessThan(b.bufferMs);
    expect(b.bufferMs).toBeLessThan(g.bufferMs);
    expect(s.onsetMs).toBeGreaterThan(g.onsetMs);
  });

  it('keeps hitstop inside the sourced 80-120 ms band', () => {
    for (const parry of Object.values(PARRY_PRESETS)) {
      expect(parry.hitstopMs).toBeGreaterThanOrEqual(80);
      expect(parry.hitstopMs).toBeLessThanOrEqual(120);
    }
  });
});

describe('slow-motion presets', () => {
  it('never lets the player outrun the world', () => {
    for (const preset of Object.values(SLOWMO_PRESETS)) {
      expect(preset.playerScale).toBeLessThanOrEqual(1);
      expect(preset.worldScale).toBeLessThanOrEqual(preset.playerScale);
    }
  });

  it('admits the mastery taper only as the lab-driven mode', () => {
    const modes = Object.values(SLOWMO_PRESETS).map((p) => p.mode);
    expect(new Set(modes)).toEqual(
      new Set(['none', 'static', 'mastery_taper', 'assist', 'player_focus']),
    );
    expect(SLOWMO_PRESETS.mastery_taper.intensity).toBe(1);
    expect(SLOWMO_PRESETS.mastery_reward.intensity).toBe(0.1);
  });

  it('keeps the control condition inert', () => {
    const none = SLOWMO_PRESETS.none;
    expect(none.triggers).toEqual([]);
    expect(none.worldScale).toBe(1);
    expect(none.playerScale).toBe(1);
    expect(none.maxPerEncounter).toBe(0);
  });
});

describe('encounters', () => {
  it('names every encounter after its own key, and the default exists', () => {
    for (const [key, def] of Object.entries(ENCOUNTERS)) expect(def.id).toBe(key);
    expect(ENCOUNTERS[DEFAULT_ENCOUNTER_ID]).toBeDefined();
  });

  it('spawns everything inside its own arena', () => {
    for (const def of Object.values(ENCOUNTERS)) {
      expect(arenaGeometryIsValid(def.arena), `${def.id}: invalid arena geometry`).toBe(true);
      expect(
        arenaContains(def.arena, def.playerStart),
        `${def.id}: player start outside arena`,
      ).toBe(true);
      for (const gate of def.arena.gates ?? []) {
        expect(gate.from).not.toEqual(gate.to);
        expect(
          arenaContains(def.arena, gate.from),
          `${def.id}/${gate.id}: gate start outside arena`,
        ).toBe(true);
        expect(
          arenaContains(def.arena, gate.to),
          `${def.id}/${gate.id}: gate end outside arena`,
        ).toBe(true);
        expect(
          def.waves.some((wave) => wave.id === gate.lockUntilWaveCleared),
          `${def.id}/${gate.id}: gate references unknown wave`,
        ).toBe(true);
      }
      for (const wave of def.waves) {
        for (const spawn of wave.spawns) {
          expect(
            arenaContains(def.arena, spawn.at),
            `${def.id}/${wave.id}: spawn outside arena`,
          ).toBe(true);
        }
      }
    }
  });

  it('starts every encounter with a wave that can actually fire', () => {
    for (const def of Object.values(ENCOUNTERS)) {
      if (def.exploration === true) {
        expect(def.waves).toHaveLength(0);
        continue;
      }
      expect(def.waves.length).toBeGreaterThan(0);
      const first = def.waves[0];
      expect(first.atMs === null || first.atMs === 0).toBe(true);
    }
  });
});

describe('the public room allow-list', () => {
  it('covers every room the player can reach, and nothing else', () => {
    const reachable = new Set(
      Object.values(ROUTES)
        .flatMap((route) => [...route.nodes, ...route.asides])
        .map((node) => node.encounterId),
    );
    expect(new Set(PUBLIC_ROUTE_ROOMS)).toEqual(reachable);
  });

  it('answers for every reachable room and refuses everything off it', () => {
    for (const route of Object.values(ROUTES)) {
      for (const node of [...route.nodes, ...route.asides]) {
        expect(isPublicRoom(node.encounterId), `${route.label} · ${node.label}`).toBe(true);
      }
    }

    for (const id of ['captain_read', 'projectile_rain_boss', 'elite_guard', 'reach_study']) {
      expect(isPublicRoom(id), id).toBe(false);
    }
  });

  it('gives every reachable room a decor theme, except the one with authored props', () => {
    for (const node of FIRST_CROWN.nodes) {
      if (node.encounterId === 'first_blade') continue;
      expect(
        arenaThemeFor(LAB_ROOMS, node.encounterId),
        `${node.label} (${node.encounterId})`,
      ).not.toBeNull();
    }
  });

  it('keeps the two lab-only themes out of the public map', () => {
    const publicThemes = new Set(
      FIRST_CROWN.nodes
        .map((node) => arenaThemeFor(LAB_ROOMS, node.encounterId))
        .filter((theme): theme is NonNullable<typeof theme> => theme !== null),
    );
    expect(publicThemes.has('guard_hall')).toBe(false);
    expect(publicThemes.has('chancellery')).toBe(false);
  });
});
