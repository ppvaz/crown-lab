
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MODE_PROFILES,
  MODE_PROFILE_IDS,
  modeDials,
  modeIdFor,
  modeIdFromSearch,
  modeProfile,
} from '../src/lab/modes';
import { COMBAT_PRESETS, SLOWMO_PRESETS } from '../src/lab/config';
import { PRESENTATION_PRESETS } from '../src/lab/presentation';
import { ENCOUNTERS } from '../src/lab/encounters';

describe('every mode profile names conditions the lab can actually run', () => {
  it('resolves all four ids against the real preset banks', () => {
    for (const profile of Object.values(MODE_PROFILES)) {
      expect(COMBAT_PRESETS[profile.combatId], `${profile.id} combat`).toBeDefined();
      expect(ENCOUNTERS[profile.encounterId], `${profile.id} encounter`).toBeDefined();
      expect(PRESENTATION_PRESETS[profile.presentationId], `${profile.id} presentation`).toBeDefined();
      expect(SLOWMO_PRESETS[profile.slowMoId], `${profile.id} slow-motion`).toBeDefined();
    }
  });

  it('says what it is for and where the claim comes from', () => {
    for (const profile of Object.values(MODE_PROFILES)) {
      expect(profile.question.length, `${profile.id} question`).toBeGreaterThan(0);
      expect(profile.source, `${profile.id} source`).toMatch(/05-EXPERIMENTS\.md §/);
      expect(profile.watchFor.length, `${profile.id} watchFor`).toBeGreaterThan(0);
    }
  });

  it('is keyed by its own id, so a lookup cannot return someone else', () => {
    for (const [key, profile] of Object.entries(MODE_PROFILES)) expect(profile.id).toBe(key);
    expect(MODE_PROFILE_IDS).toEqual(Object.keys(MODE_PROFILES));
    expect(modeProfile('nope')).toBeUndefined();
  });
});

describe('A Muralha carries §2.2 rather than a preference', () => {
  const wall = MODE_PROFILES.Muralha;

  it('runs the mode with no dodge, which is the kit constraint §1 states exclusively', () => {
    expect(COMBAT_PRESETS[wall.combatId].player.step.iframeMs).toBe(0);
  });

  it('pairs it with the composition §1 names: two swordsmen and one archer', () => {
    const roster = ENCOUNTERS[wall.encounterId].waves.flatMap((w) =>
      w.spawns.map((spawn) => spawn.archetype),
    );
    expect(roster.filter((a) => a === 'guard')).toHaveLength(2);
    expect(roster.filter((a) => a === 'archer')).toHaveLength(1);
    expect(roster).toHaveLength(3);
  });

  it('subtracts nothing and slows nothing, so the mode measures only its own question', () => {
    expect(wall.presentationId).toBe('Full');
    expect(wall.slowMoId).toBe('none');
  });
});

describe('A Caçada carries the clause that had never run', () => {
  const hunt = MODE_PROFILES.Cacada;

  it('pays for aggression, which is the combat half', () => {
    expect(COMBAT_PRESETS[hunt.combatId].player.staminaOnKill).toBeGreaterThan(0);
  });

  it('uses an encounter whose waves arrive on a clock, not on a clear', () => {
    const waves = ENCOUNTERS[hunt.encounterId].waves;
    expect(waves.every((w) => w.atMs !== null)).toBe(true);
    expect(waves.length).toBeGreaterThan(2);
  });

  it('differs from the gated siege in the trigger and in nothing else', () => {
    const paced = ENCOUNTERS[hunt.encounterId].waves.map((w) =>
      w.spawns.map((s) => s.archetype).join(','),
    );
    const gated = ENCOUNTERS.siege_10.waves.map((w) =>
      w.spawns.map((s) => s.archetype).join(','),
    );
    expect(paced).toEqual(gated);
  });

  it('paces each wave by the size of the one before it, not by a flat clock', () => {
    const waves = ENCOUNTERS[hunt.encounterId].waves;
    const gaps = waves.slice(1).map((w, i) => (w.atMs ?? 0) - (waves[i].atMs ?? 0));
    const sizes = waves.slice(0, -1).map((w) => w.spawns.length);
    const perBody = gaps.map((gap, i) => gap / sizes[i]);
    expect(new Set(perBody).size).toBe(1);
    expect(new Set(gaps).size).toBeGreaterThan(1);
  });
});

describe('a selected mode can be read back off the dials', () => {
  it('recognises each profile from the four selections it makes', () => {
    for (const profile of Object.values(MODE_PROFILES)) {
      expect(modeIdFor(modeDials(profile))).toBe(profile.id);
    }
  });

  it('reports no mode when one dial has been moved off the profile', () => {
    const wall = modeDials(MODE_PROFILES.Muralha);
    expect(modeIdFor({ ...wall, presentationId: 'Hud_None' })).toBeNull();
    expect(modeIdFor({ ...wall, slowMoId: 'static' })).toBeNull();
    expect(modeIdFor({ ...wall, combatId: 'Default' })).toBeNull();
    expect(modeIdFor({ ...wall, encounterId: 'siege_10' })).toBeNull();
  });

  it('does not confuse two profiles that share dials', () => {
    const hunt = modeDials(MODE_PROFILES.Cacada);
    expect(modeIdFor({ ...hunt, combatId: MODE_PROFILES.Muralha.combatId })).toBeNull();
  });
});

describe('the ?mode= door', () => {
  it('reads the id the operator typed, verbatim', () => {
    expect(modeIdFromSearch('?mode=Muralha')).toBe('Muralha');
    expect(modeIdFromSearch('?participant=P02&mode=Cacada&exposure=none')).toBe('Cacada');
    expect(modeIdFromSearch('?mode=%20Muralha%20')).toBe('Muralha');
  });

  it('is absent rather than defaulted when nothing was asked for', () => {
    expect(modeIdFromSearch('')).toBeNull();
    expect(modeIdFromSearch('?participant=P02')).toBeNull();
    expect(modeIdFromSearch('?mode=')).toBeNull();
    expect(modeIdFromSearch('?mode=%20%20')).toBeNull();
  });

  it('hands an unknown id through instead of swallowing it', () => {
    expect(modeIdFromSearch('?mode=Muralah')).toBe('Muralah');
    expect(modeProfile('Muralah')).toBeUndefined();
  });
});

describe('the panel can select a mode without a keyboard', () => {
  const html = readFileSync(join(process.cwd(), 'index.html'), 'utf8') as string;

  it('offers the mode dial as a lab button', () => {
    expect(html).toMatch(/data-lab-key="KeyZ"[^>]*>\s*Next mode/);
  });

  it('keeps the first group at an even count, which is what makes the button free', () => {
    const group = /<div class="lab-actions__title">Run<\/div>([\s\S]*?)<\/div>/.exec(html);
    expect(group, 'the Run group is no longer findable').not.toBeNull();
    const count = (group![1].match(/class="lab-action"/g) ?? []).length;
    expect(count % 2, `Run holds ${count} buttons, leaving a half-empty row`).toBe(0);
  });

  it('puts it above the fold, not in the eight buttons a phone has to scroll for', () => {
    const groups = [...html.matchAll(/<div class="lab-actions__title">([^<]+)</g)].map((m) => m[1]);
    const modeGroup = /<div class="lab-actions__title">([^<]+)<[\s\S]*?data-lab-key="KeyZ"/.exec(html);
    expect(modeGroup).not.toBeNull();
    expect(groups.indexOf(modeGroup![1])).toBe(0);
  });
});

describe('the modes that cannot be run are absent rather than aspirational', () => {
  it('offers no profile for the Marco 5 modes', () => {
    expect(MODE_PROFILES.Autoridade).toBeUndefined();
    expect(MODE_PROFILES.Tempestade).toBeUndefined();
  });
});
