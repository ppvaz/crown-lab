
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { DEFAULT_COMBAT } from '../src/lab/config';
import { MUSIC_STEM_KEYS, PRESENTATION_PRESETS, resolve } from '../src/lab/presentation';
import type { MusicStems } from '../src/lab/presentation';
import { Audio, stemLevel } from '../src/render/audio';
import { FIRST_CROWN } from '../src/game/route';
import {
  BLADE_OF_HEIR_ALT_MUSIC_BED,
  BLADE_OF_HEIR_MUSIC_BED,
  CAPTAIN_BLADE_OF_HEIR_MUSIC_BED,
  COURTLY_TAKES,
  bossMusicBedForEncounter,
  CAPTAIN_MUSIC_BED,
  MUSIC_BEDS,
  forgetCourtlyTake,
  LAB_ONLY_BOSS_SCORING,
  labMusicBedForEncounter,
  QUEEN_MUSIC_BED,
  setCourtlyDraw,
} from '../src/render/music-route';
import { DEFAULT_MATERIAL } from '../src/render/materials-lab';
import {
  ALL_CUES,
  CUES,
  ESSENTIAL_CUES,
  FIRST_BLADE_MUSIC_BED,
  MUSIC_BED,
  MUSIC_FADE_MS,
  MUSIC_OPEN_HZ,
  MUSIC_STAGGER_ATTACK_MS,
  MUSIC_STAGGER_HZ,
  PUBLIC_MATERIAL,
  musicBedForEncounter,
} from '../src/render/soundbank';
import { PUBLIC_ENCOUNTERS } from '../src/game/public-profile';
import { PUBLIC_MUSIC } from '../src/render/asset-registry';


const stems = (...on: (keyof MusicStems)[]): MusicStems => ({
  strings: on.includes('strings'),
  choir: on.includes('choir'),
  organ: on.includes('organ'),
  percussion: on.includes('percussion'),
});

describe('stemLevel', () => {
  it('is full volume with every stem on and silent with none', () => {
    expect(stemLevel(stems(...MUSIC_STEM_KEYS))).toBe(1);
    expect(stemLevel(stems())).toBe(0);
  });

  it('falls one quarter per stem removed', () => {
    expect(stemLevel(stems('strings', 'choir', 'organ'))).toBeCloseTo(0.75);
    expect(stemLevel(stems('strings', 'choir'))).toBeCloseTo(0.5);
    expect(stemLevel(stems('percussion'))).toBeCloseTo(0.25);
  });

  it('cannot tell one stem from another — the stand-in\'s known blind spot', () => {
    for (const key of MUSIC_STEM_KEYS) {
      expect(stemLevel(stems(...MUSIC_STEM_KEYS.filter((k) => k !== key)))).toBeCloseTo(0.75);
    }
  });
});

describe('material sample paths', () => {
  it('names every sample file rather than deriving it from the cue', () => {
    for (const cue of ALL_CUES) {
      const file = CUES[cue].material;
      if (file === null) continue;
      expect(file).toMatch(/\.ogg$/);
    }
  });

  it('points every pack URL at a file that exists on disk', () => {
    for (const pack of [DEFAULT_MATERIAL, PUBLIC_MATERIAL]) {
      for (const [cue, url] of Object.entries(pack.urls)) {
        expect(
          existsSync(fileURLToPath(url as string)),
          `${pack.id}/${cue} -> ${url as string}`,
        ).toBe(true);
      }
    }
  });

  it('gives the public game a sample for the parry, the cue it is built around', () => {
    expect(PUBLIC_MATERIAL.urls.parry?.endsWith('/audio/forged/parry.ogg')).toBe(true);
    expect(PUBLIC_MATERIAL.urls.stagger?.endsWith('/audio/forged/stagger.ogg')).toBe(true);
    expect(PUBLIC_MATERIAL.urls.power_hit?.endsWith('/audio/forged/power_hit.ogg')).toBe(true);
  });
});

describe('the music bed', () => {
  beforeEach(() => {
    setCourtlyDraw(() => 0);
    forgetCourtlyTake();
  });

  it('sits below the cue layers, since the bed is context rather than information', () => {
    expect(MUSIC_BED.gain).toBeLessThan(0.5);
  });

  it('leaves Music_Off as the only preset that silences the bed outright', () => {
    const off = PRESENTATION_PRESETS.Music_Off.audio;
    expect(off.music).toBe(false);
    expect(stemLevel(off.stems)).toBe(1);

    const full = PRESENTATION_PRESETS.Full.audio;
    expect(full.music).toBe(true);
    expect(stemLevel(full.stems)).toBe(1);
  });

  it('routes each boss to a single-track bed rather than the courtly rotation', () => {
    expect(musicBedForEncounter('first_blade')).toBe(FIRST_BLADE_MUSIC_BED);
    expect(labMusicBedForEncounter('captain')).toBe(CAPTAIN_BLADE_OF_HEIR_MUSIC_BED);
    expect(labMusicBedForEncounter('siege_10')).toBe(BLADE_OF_HEIR_ALT_MUSIC_BED);
    expect(labMusicBedForEncounter('chancellor')).toBe(BLADE_OF_HEIR_MUSIC_BED);
    expect(labMusicBedForEncounter('queen')).toBe(QUEEN_MUSIC_BED);
    expect(QUEEN_MUSIC_BED.url).toContain('bgm-01.webm');
    expect(QUEEN_MUSIC_BED.gain).toBeCloseTo(MUSIC_BED.gain * 10 ** (-2.6 / 20), 2);
    for (const id of ['captain', 'captain_read', 'siege_10', 'chancellor', 'first_blade', 'queen']) {
      expect(COURTLY_TAKES).not.toContain(labMusicBedForEncounter(id));
    }
    expect(Object.keys(MUSIC_BEDS)).toEqual([
      'bgm-06',
      'bgm-04',
      'bgm-05',
      'bgm-08',
      'bgm-07',
      'bgm-03',
      'bgm-02',
      'bgm-02-throne',
      'bgm-01',
    ]);
  });

  it('keeps the Blade of Heir beds distinguishable by id and by file', () => {
    expect(BLADE_OF_HEIR_MUSIC_BED.url).toContain('bgm-03.webm');
    expect(BLADE_OF_HEIR_ALT_MUSIC_BED.url).toContain('bgm-02.webm');
    expect(BLADE_OF_HEIR_MUSIC_BED.url).not.toBe(BLADE_OF_HEIR_ALT_MUSIC_BED.url);
    expect(CAPTAIN_BLADE_OF_HEIR_MUSIC_BED.url).toBe(BLADE_OF_HEIR_ALT_MUSIC_BED.url);
    expect(CAPTAIN_BLADE_OF_HEIR_MUSIC_BED.id).not.toBe(BLADE_OF_HEIR_ALT_MUSIC_BED.id);
    expect(CAPTAIN_BLADE_OF_HEIR_MUSIC_BED.gain).toBeGreaterThan(
      BLADE_OF_HEIR_ALT_MUSIC_BED.gain,
    );
  });

  it('gives the read condition the control\'s level and not merely its recording', () => {
    expect(labMusicBedForEncounter('captain_read')).toBe(labMusicBedForEncounter('captain'));
  });

  it('leaves the Captain\'s Crimson Ledger arrangement dormant but intact', () => {
    expect(MUSIC_BEDS[CAPTAIN_MUSIC_BED.id]).toBe(CAPTAIN_MUSIC_BED);
    const routed = new Set(
      [...FIRST_CROWN.nodes.map((node) => node.encounterId), 'captain', 'captain_read',
        'chancellor', 'first_blade'].map((id) => labMusicBedForEncounter(id).id),
    );
    expect(routed.has(CAPTAIN_MUSIC_BED.id)).toBe(false);
  });

  it('breaks the corridor bed at the siege, whose only new arrival is fatigue', () => {
    setCourtlyDraw(() => 1);
    const corridor = labMusicBedForEncounter('kernel_guard');
    expect(labMusicBedForEncounter('siege_10').id).not.toBe(corridor.id);
  });

  it('gives the paced siege its control\'s bed, since that pair isolates the wave trigger', () => {
    expect(labMusicBedForEncounter('siege_10_paced')).toBe(labMusicBedForEncounter('siege_10'));
  });

  it('keeps every lab room name out of the routing the public game links', () => {
    expect(musicBedForEncounter('wayfarer_court')).toBe(MUSIC_BED);
    expect(musicBedForEncounter('captain_read')).toBe(MUSIC_BED);
    expect(musicBedForEncounter('projectile_rain_boss')).toBe(MUSIC_BED);
  });

  it('lets the two builds disagree only where that is declared, and nowhere it is not', () => {


    for (const id of Object.keys(PUBLIC_ENCOUNTERS)) {
      const declared = LAB_ONLY_BOSS_SCORING.has(id);
      const diverges = labMusicBedForEncounter(id) !== musicBedForEncounter(id);
      expect(diverges, `${id} diverges=${diverges} declared=${declared}`).toBe(declared);
    }
    for (const id of LAB_ONLY_BOSS_SCORING) {
      expect(Object.keys(PUBLIC_ENCOUNTERS), `${id} is declared but not public`).toContain(id);
    }
  });

  it('gives every public boss room the boss bed, and no room a track the build lacks', () => {

    const shipped = new Set(Object.keys(PUBLIC_MUSIC).map((file) => file.replace(/\.[a-z0-9]+$/, '')));
    for (const id of Object.keys(PUBLIC_ENCOUNTERS)) {
      const bed = musicBedForEncounter(id);
      const file = bed.id.replace(/-throne$/, '');
      expect(shipped.has(file), `${id} -> ${bed.id}`).toBe(true);
    }


    expect(musicBedForEncounter('first_blade')).toBe(FIRST_BLADE_MUSIC_BED);
    expect(musicBedForEncounter('chancellor').gain).toBe(0.26);
    expect(musicBedForEncounter('captain').gain).toBe(0.35);
    expect(musicBedForEncounter('siege_10').gain).toBe(0.17);
    expect(musicBedForEncounter('siege_10')).not.toBe(MUSIC_BED);
    expect(musicBedForEncounter('kernel_guard')).toBe(MUSIC_BED);
  });

  it('treats every room that is not a named fight as a courtly arena', () => {
    setCourtlyDraw(() => 2);
    expect(labMusicBedForEncounter('shape_cramped_keep')).toBe(COURTLY_TAKES[2]);
    expect(labMusicBedForEncounter('tutorial_fundamentals')).toBe(COURTLY_TAKES[2]);
  });

  it('holds one courtly take across every corridor, so no door restarts the music', () => {
    setCourtlyDraw(() => 1);
    const teaching = new Set(['introduce', 'develop', 'twist', 'conclude', 'breather']);
    const corridors = FIRST_CROWN.nodes.filter((node) => teaching.has(node.beat));
    expect(corridors.length).toBeGreaterThan(3);
    const beds = corridors.map((node) => labMusicBedForEncounter(node.encounterId));
    for (const bed of beds) expect(bed).toBe(COURTLY_TAKES[1]);
  });

  it('draws the take rather than assigning it, and can reach all three', () => {
    const seen = new Set<string>();
    for (let i = 0; i < COURTLY_TAKES.length; i++) {
      setCourtlyDraw(() => i);
      seen.add(labMusicBedForEncounter('wayfarer_court').id);
    }
    expect(seen.size).toBe(COURTLY_TAKES.length);
  });

  it('peeks the room ahead without deciding the corridor a room early', () => {
    setCourtlyDraw(() => 1);
    const inForce = labMusicBedForEncounter('wayfarer_court');
    expect(bossMusicBedForEncounter('captain')).toBe(CAPTAIN_BLADE_OF_HEIR_MUSIC_BED);
    expect(bossMusicBedForEncounter('kernel_guard')).toBeNull();
    expect(labMusicBedForEncounter('kernel_guard')).toBe(inForce);
  });

  it('forgets the take at a boss door, where there is no continuity left to protect', () => {
    let next = 0;
    setCourtlyDraw(() => next);
    expect(labMusicBedForEncounter('wayfarer_court')).toBe(COURTLY_TAKES[0]);
    expect(labMusicBedForEncounter('captain')).toBe(CAPTAIN_BLADE_OF_HEIR_MUSIC_BED);
    next = 2;
    expect(labMusicBedForEncounter('wayfarer_court')).toBe(COURTLY_TAKES[2]);
  });

  it('finishes the handover inside the roar that carries it', () => {
    for (const [id, enemy] of Object.entries(DEFAULT_COMBAT.enemies)) {
      const boss = enemy.boss;
      if (boss === undefined) continue;
      expect(MUSIC_FADE_MS, `${id} roars for ${boss.introRoarMs} ms`).toBeLessThanOrEqual(
        boss.introRoarMs,
      );
    }
  });

  it('keeps the resting cutoff above the parry cue', () => {
    const parryTop = CUES['parry'].tonal?.freq ?? 0;
    expect(MUSIC_OPEN_HZ).toBeGreaterThan(parryTop);
    expect(MUSIC_STAGGER_HZ).toBeLessThan(parryTop);
  });

  it('lands the guard-break duck with the break rather than after it', () => {
    const stagger = DEFAULT_COMBAT.player.guard.guardBreakStaggerMs;
    expect(MUSIC_STAGGER_ATTACK_MS).toBeLessThan(stagger);
  });

  it('keeps the Captain scored while the ladder never reaches him', () => {
    expect(COURTLY_TAKES).not.toContain(labMusicBedForEncounter('captain'));
    expect(FIRST_CROWN.nodes.map((node) => node.encounterId)).not.toContain('captain');
  });

  it('scores the two ending rungs differently', () => {
    const endings = FIRST_CROWN.nodes.filter(
      (node) => node.beat === 'endure' || node.beat === 'crown',
    );
    expect(endings).toHaveLength(2);
    const ids = endings.map((node) => labMusicBedForEncounter(node.encounterId).id);
    expect(new Set(ids).size).toBe(2);
  });

  it('points every bed URL at a file that exists on disk', () => {
    for (const bed of Object.values(MUSIC_BEDS)) {
      expect(existsSync(fileURLToPath(bed.url)), bed.id).toBe(true);
    }
  });

  it('pays back the loudness the third courtly take carries, since the bed sits under the cues', () => {
    expect(MUSIC_BEDS['bgm-05'].gain).toBeLessThan(MUSIC_BED.gain);
    const paidBack = MUSIC_BEDS['bgm-05'].gain;
    expect(MUSIC_BEDS['bgm-02'].gain).toBe(paidBack);

    expect(MUSIC_BEDS['bgm-03'].gain).toBeGreaterThan(paidBack);
    expect(MUSIC_BEDS['bgm-02-throne'].gain).toBeGreaterThan(
      MUSIC_BEDS['bgm-03'].gain,
    );
    for (const bed of Object.values(MUSIC_BEDS)) expect(bed.gain).toBeLessThan(0.5);
  });

  it('gives both boss roars a pack-independent low, rough cue', () => {
    expect(CUES.roar.material).toBe(null);
    expect(CUES.roar.transient?.freq).toBeLessThan(200);
    expect(CUES.roar.tonal?.toFreq).toBeLessThan(CUES.roar.tonal?.freq ?? 0);
    expect(ESSENTIAL_CUES.has('roar')).toBe(true);
  });

  it('reports that the boss asset is not ready before an AudioContext decodes it', () => {
    const audio = new Audio();
    audio.setMusicBed(FIRST_BLADE_MUSIC_BED);
    audio.applyPresentation(resolve(PRESENTATION_PRESETS.Full));
    audio.setMusicGate(false);
    expect(audio.musicReady).toBe(false);
    expect(audio.musicStatus).toBe('bgm-08 (loading before entrance)');

    audio.setMusicGate(true);
    expect(audio.musicStatus).toBe('bgm-08 (loading before entrance)');
  });

  it('walks into the throne on the corridor, crosses under the roar, and leaves with the body', async () => {
    const sounding: string[] = [];
    let now = 0;

    const param = (): unknown => ({
      value: 0,
      cancelScheduledValues: () => {},
      setValueAtTime: () => {},
      linearRampToValueAtTime: () => {},
      setTargetAtTime: () => {},
    });

    class FakeAudioContext {
      sampleRate = 8;
      destination = {};
      get currentTime(): number {
        return now;
      }
      state: AudioContextState = 'running';
      createGain(): unknown {
        return { gain: param(), connect: () => {}, disconnect: () => {} };
      }
      createBiquadFilter(): unknown {
        return { type: '', frequency: param(), Q: param(), connect: () => {} };
      }
      createBuffer(_c: number, length: number): unknown {
        return { getChannelData: () => new Float32Array(length) };
      }
      createBufferSource(): unknown {
        return {
          buffer: null as unknown,
          loop: false,
          onended: null,
          playbackRate: param(),
          connect: () => {},
          disconnect: () => {},
          start: () => {},
          stop: () => {},
        };
      }
      decodeAudioData(bytes: ArrayBuffer): Promise<unknown> {
        return Promise.resolve({ tag: new TextDecoder().decode(bytes) });
      }
    }

    vi.stubGlobal('AudioContext', FakeAudioContext);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => ({
        ok: true,
        arrayBuffer: async () => new TextEncoder().encode(url).buffer,
      })),
    );
    try {
      const audio = new Audio();
      const corridor = COURTLY_TAKES[0];
      audio.setMusicBed(corridor);
      audio.applyPresentation(resolve(PRESENTATION_PRESETS.Full));
      audio.init();
      await vi.waitFor(() => expect(audio.musicStatus).toContain('single track'));
      expect(audio.musicStatus).toContain(corridor.id);

      audio.setMusicBed(CAPTAIN_MUSIC_BED);
      audio.setMusicGate(false);
      await vi.waitFor(() => expect(audio.musicReady).toBe(true));
      expect(audio.musicStatus).toBe(
        `${CAPTAIN_MUSIC_BED.id} (armed: waiting for fight) over ${corridor.id}`,
      );

      audio.setMusicGate(true);
      expect(audio.musicStatus).toContain(CAPTAIN_MUSIC_BED.id);
      expect(audio.musicStatus).not.toContain(corridor.id);

      audio.retireMusic();
      audio.applyPresentation(resolve(PRESENTATION_PRESETS.Full));
      expect(audio.musicStatus).toContain('armed: waiting for fight');
      expect(sounding).toEqual([]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('freezes and resumes an unlocked audio context with gameplay', () => {
    let state: AudioContextState = 'running';
    let suspendCalls = 0;
    let resumeCalls = 0;

    class FakeAudioContext {
      sampleRate = 8;
      destination = {};
      currentTime = 0;

      get state(): AudioContextState {
        return state;
      }

      createGain() {
        return {
          gain: { value: 0, setTargetAtTime: () => {} },
          connect: () => {},
        };
      }

      createBiquadFilter() {
        return {
          type: '',
          frequency: { value: 0, cancelScheduledValues: () => {}, setValueAtTime: () => {} },
          connect: () => {},
        };
      }

      createBuffer(_channels: number, length: number) {
        return { getChannelData: () => new Float32Array(length) };
      }

      suspend() {
        suspendCalls += 1;
        state = 'suspended';
        return Promise.resolve();
      }

      resume() {
        resumeCalls += 1;
        state = 'running';
        return Promise.resolve();
      }
    }

    vi.stubGlobal('AudioContext', FakeAudioContext);
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })));
    try {
      const audio = new Audio();
      audio.setPaused(true);
      audio.init();
      expect(state).toBe('suspended');
      expect(suspendCalls).toBe(1);

      audio.setPaused(false);
      expect(state).toBe('running');
      expect(resumeCalls).toBe(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
