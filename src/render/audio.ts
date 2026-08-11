
import type { MusicStems, ResolvedPresentation } from '../lab/presentation';
import { musicDownloadAllowed, setHeavyLoading } from './heavy-assets';
import type {
  AudioCue,
  CueDef,
  MaterialPack,
  MusicBed,
  TonalLayer,
  TransientLayer,
} from './soundbank';
import {
  ALL_CUES,
  CUES,
  EMPTY_MATERIAL_PACK,
  ESSENTIAL_CUES,
  MUSIC_BED,
  MUSIC_FADE_MS,
  MUSIC_OPEN_HZ,
  MUSIC_STAGGER_ATTACK_MS,
  MUSIC_STAGGER_HZ,
  MUSIC_STAGGER_RELEASE_MS,
} from './soundbank';

export type { AudioCue } from './soundbank';

export interface CueShape {
  spanMs?: number;
  intensity?: number;
}

const nominalSpanMs = (def: CueDef): number => {
  let end = 0;
  for (const layer of def.transient) end = Math.max(end, (layer.atMs ?? 0) + layer.durationMs);
  for (const layer of def.tonal) end = Math.max(end, (layer.atMs ?? 0) + layer.durationMs);
  return Math.max(1, end);
};

const freqHeat = (heat: number): number => 1 + 0.5 * heat;
const gainHeat = (heat: number): number => 1 + 0.25 * heat;

const MUSIC_STEM_KEYS: readonly (keyof MusicStems)[] = [
  'strings',
  'choir',
  'organ',
  'percussion',
];

export const stemLevel = (stems: MusicStems): number =>
  MUSIC_STEM_KEYS.filter((k) => stems[k]).length / MUSIC_STEM_KEYS.length;

let vary = 0x51ed270b;
const jitter = (): number => {
  vary = (vary * 1664525 + 1013904223) >>> 0;
  return vary / 4294967296;
};

interface MusicVoice {
  bedId: string;
  src: AudioBufferSourceNode;
  gain: GainNode;
}

export class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private enabled = true;
  private noiseBuffer: AudioBuffer | null = null;

  private pack: MaterialPack = EMPTY_MATERIAL_PACK;
  private samples = new Map<AudioCue, AudioBuffer>();
  private loadToken = 0;

  private musicBuffers = new Map<string, AudioBuffer>();
  private musicVoice: MusicVoice | null = null;
  private musicBed: MusicBed = MUSIC_BED;
  private musicLoadToken = 0;
  private musicWanted = false;
  private musicGateOpen = true;
  private musicFilter: BiquadFilterNode | null = null;
  private musicBaseCutoff = MUSIC_OPEN_HZ;
  private paused = false;

  private pres: ResolvedPresentation | null = null;

  init(): void {
    if (this.ctx !== null) {
      if (!this.paused && this.ctx.state === 'suspended') {
        void this.ctx.resume().catch(() => undefined);
      }
      return;
    }
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.enabled ? 0.6 : 0;
    this.master.connect(this.ctx.destination);

    this.musicFilter = this.ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = MUSIC_OPEN_HZ;
    this.musicFilter.connect(this.master);

    const len = Math.floor(this.ctx.sampleRate * 0.4);
    this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    let s = 0x13579bdf;
    for (let i = 0; i < len; i++) {
      s = (s * 1664525 + 1013904223) >>> 0;
      data[i] = (s / 4294967296) * 2 - 1;
    }

    void this.loadPack(this.pack);
    void this.loadMusic();
    if (this.paused) void this.ctx.suspend().catch(() => undefined);
  }

  private async loadMusic(): Promise<void> {
    const ctx = this.ctx;
    if (ctx === null || this.musicBuffers.has(this.musicBed.id)) return;
    if (!musicDownloadAllowed()) return;
    const bed = this.musicBed;
    const token = ++this.musicLoadToken;
    const res = await fetch(bed.url);
    if (!res.ok || token !== this.musicLoadToken) return;
    const decoded = await ctx.decodeAudioData(await res.arrayBuffer());
    if (token !== this.musicLoadToken) return;
    this.musicBuffers.set(bed.id, decoded);
    this.handOver();
  }

  prefetchMusicBed(bed: MusicBed): void {
    const ctx = this.ctx;
    if (ctx === null || this.musicBuffers.has(bed.id)) return;
    if (!musicDownloadAllowed()) return;
    void (async () => {
      const res = await fetch(bed.url);
      if (!res.ok) return;
      const decoded = await ctx.decodeAudioData(await res.arrayBuffer());
      this.musicBuffers.set(bed.id, decoded);
      this.handOver();
    })();
  }

  setMusicBed(bed: MusicBed): void {
    if (bed.id === this.musicBed.id) return;
    this.musicLoadToken += 1;
    this.musicBed = bed;
    if (this.ctx === null) return;
    if (this.musicBuffers.has(bed.id)) this.handOver();
    else void this.loadMusic();
  }

  setMusicGate(open: boolean): void {
    this.musicGateOpen = open;
    if (open) this.handOver();
  }

  retireMusic(): void {
    this.musicGateOpen = false;
    this.setMusicMuffle(MUSIC_OPEN_HZ, 0);
    if (this.musicVoice !== null) this.fadeOutVoice(this.musicVoice, MUSIC_FADE_MS);
  }

  setMusicMuffle(cutoffHz: number, ms: number): void {
    this.musicBaseCutoff = cutoffHz;
    const filter = this.musicFilter;
    if (filter === null || this.ctx === null) return;
    const now = this.ctx.currentTime;
    filter.frequency.cancelScheduledValues(now);
    filter.frequency.setValueAtTime(filter.frequency.value, now);
    if (ms <= 0) filter.frequency.value = cutoffHz;
    else filter.frequency.exponentialRampToValueAtTime(cutoffHz, now + ms / 1000);
  }

  duckMusicForStagger(holdMs: number): void {
    const filter = this.musicFilter;
    if (filter === null || this.ctx === null) return;
    const now = this.ctx.currentTime;
    const attack = MUSIC_STAGGER_ATTACK_MS / 1000;
    const hold = Math.max(0, holdMs / 1000 - attack);
    filter.frequency.cancelScheduledValues(now);
    filter.frequency.setValueAtTime(filter.frequency.value, now);
    filter.frequency.exponentialRampToValueAtTime(MUSIC_STAGGER_HZ, now + attack);
    filter.frequency.setValueAtTime(MUSIC_STAGGER_HZ, now + attack + hold);
    filter.frequency.exponentialRampToValueAtTime(
      this.musicBaseCutoff,
      now + attack + hold + MUSIC_STAGGER_RELEASE_MS / 1000,
    );
  }

  resetMusicMuffle(): void {
    this.setMusicMuffle(MUSIC_OPEN_HZ, 0);
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (this.master !== null) this.master.gain.value = on ? 0.6 : 0;
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    if (this.ctx === null) return;
    if (paused && this.ctx.state === 'running') {
      void this.ctx.suspend().catch(() => undefined);
    } else if (!paused && this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => undefined);
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  get packId(): string {
    return this.pack.id;
  }

  get loadedCount(): number {
    return this.samples.size;
  }

  get musicReady(): boolean {
    return this.musicBuffers.has(this.musicBed.id);
  }

  async downloadMusic(): Promise<void> {
    setHeavyLoading('music', true);
    try {
      await this.loadMusic();
    } finally {
      setHeavyLoading('music', false);
    }
  }

  get musicPending(): boolean {
    return this.ctx !== null && this.musicWanted && !this.musicReady;
  }

  get contextLive(): boolean {
    return this.ctx !== null;
  }

  get musicStatus(): string {
    if (!this.musicWanted) return 'off';
    const under = this.musicVoice === null ? '' : ` over ${this.musicVoice.bedId}`;
    if (!this.musicReady) return `${this.musicBed.id} (loading before entrance)${under}`;
    if (!this.musicGateOpen) return `${this.musicBed.id} (armed: waiting for fight)${under}`;
    if (this.musicVoice === null) return `${this.musicBed.id} (loading)`;
    const level = this.pres === null ? 1 : stemLevel(this.pres.audio.stems);
    return `${this.musicBed.id} ${Math.round(level * 100)}% (single track: stems = volume)`;
  }


  setPack(pack: MaterialPack): void {
    this.pack = pack;
    this.samples.clear();
    this.loadToken += 1;
    if (this.ctx !== null) void this.loadPack(pack);
  }

  private async loadPack(pack: MaterialPack): Promise<void> {
    const token = this.loadToken;
    const ctx = this.ctx;
    if (ctx === null) return;

    await Promise.all(
      ALL_CUES.map(async (cue) => {
        const url = pack.urls[cue];
        if (url === undefined) return;
        try {
          const res = await fetch(url);
          if (!res.ok) return;
          const buf = await ctx.decodeAudioData(await res.arrayBuffer());
          if (token === this.loadToken) this.samples.set(cue, buf);
        } catch {
        }
      }),
    );
  }

  async importFiles(files: FileList | File[]): Promise<{ pack: MaterialPack; matched: AudioCue[] }> {
    const urls: Partial<Record<AudioCue, string>> = {};
    const matched: AudioCue[] = [];
    const byLength = [...ALL_CUES].sort((a, b) => b.length - a.length);

    for (const file of Array.from(files)) {
      const name = file.name.toLowerCase();
      const cue = byLength.find((c) => name.includes(c));
      if (cue === undefined || urls[cue] !== undefined) continue;
      urls[cue] = URL.createObjectURL(file);
      matched.push(cue);
    }

    const pack: MaterialPack = {
      id: 'imported',
      description: `Imported at runtime (${matched.length} cues matched).`,
      urls,
    };
    this.setPack(pack);
    if (this.ctx !== null) await this.loadPack(pack);
    return { pack, matched };
  }


  applyPresentation(pres: ResolvedPresentation): void {
    this.pres = pres;
    this.musicWanted = pres.audio.music;
    if (this.musicWanted) this.handOver();
    else if (this.musicVoice !== null) this.fadeOutVoice(this.musicVoice, MUSIC_FADE_MS);
    this.applyStems();
  }

  private gainFor(cue: AudioCue): number {
    const pres = this.pres;
    if (pres === null) return 1;
    if (ESSENTIAL_CUES.has(cue)) return pres.audio.essentialCues ? 1 : 0;
    return pres.audio.density;
  }


  play(cue: AudioCue, pan = 0, shape: CueShape = {}): void {
    if (!this.enabled || this.ctx === null || this.master === null) return;
    const scale = this.gainFor(cue);
    if (scale <= 0) return;

    const layers = this.pres?.audio;
    const def = CUES[cue];
    const dest = this.destinationFor(pan);
    const now = this.ctx.currentTime;

    const span = def.stretch === true ? (shape.spanMs ?? 0) : 0;
    const stretch = span > 0 ? span / nominalSpanMs(def) : 1;
    const heat = def.reactive === true ? Math.max(0, Math.min(1, shape.intensity ?? 0)) : 0;

    const sample = this.samples.get(cue);
    if (sample !== undefined && (layers?.material ?? true)) {
      this.playSample(sample, scale, dest, now);
    }
    if (layers?.transient ?? true) {
      for (const layer of def.transient) {
        this.playTransient(layer, scale, dest, now + (layer.atMs ?? 0) * stretch / 1000, stretch, heat);
      }
    }
    if (layers?.tonal ?? true) {
      for (const layer of def.tonal) {
        this.playTonal(layer, scale, dest, now + (layer.atMs ?? 0) * stretch / 1000, stretch, heat);
      }
    }
  }

  private destinationFor(pan: number): AudioNode {
    const ctx = this.ctx as AudioContext;
    const master = this.master as GainNode;
    if (this.pres !== null && !this.pres.audio.stereo) return master;
    if (pan === 0 || typeof ctx.createStereoPanner !== 'function') return master;
    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    panner.connect(master);
    return panner;
  }

  private get pitchJitter(): number {
    if (this.pres !== null && !this.pres.audio.pitchVariation) return 1;
    return 0.94 + jitter() * 0.12;
  }

  private playSample(buffer: AudioBuffer, scale: number, dest: AudioNode, at: number): void {
    const ctx = this.ctx as AudioContext;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = this.pitchJitter;
    const gain = ctx.createGain();
    gain.gain.value = 0.85 * scale;
    src.connect(gain);
    gain.connect(dest);
    src.start(at);
  }

  private playTransient(
    def: TransientLayer,
    scale: number,
    dest: AudioNode,
    now: number,
    stretch = 1,
    heat = 0,
  ): void {
    const ctx = this.ctx as AudioContext;
    if (this.noiseBuffer === null) return;
    const dur = (def.durationMs * stretch) / 1000;

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(def.gain * scale * gainHeat(heat), now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = def.freq * this.pitchJitter * freqHeat(heat);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(dest);
    src.start(now);
    src.stop(now + dur);
  }

  private playTonal(
    def: TonalLayer,
    scale: number,
    dest: AudioNode,
    now: number,
    stretch = 1,
    heat = 0,
  ): void {
    const ctx = this.ctx as AudioContext;
    const dur = (def.durationMs * stretch) / 1000;
    const bend = this.pitchJitter * freqHeat(heat);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(def.gain * scale * gainHeat(heat), now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    gain.connect(dest);

    const osc = ctx.createOscillator();
    osc.type = def.type;
    osc.frequency.setValueAtTime(def.freq * bend, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, def.toFreq * bend), now + dur);
    osc.connect(gain);
    osc.start(now);
    osc.stop(now + dur);
  }


  private musicTarget(): number {
    const stems = this.pres?.audio.stems;
    return this.musicBed.gain * (stems === undefined ? 1 : stemLevel(stems));
  }

  private ramp(gain: GainNode, to: number, ms: number): void {
    const ctx = this.ctx as AudioContext;
    const now = ctx.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(to, now + ms / 1000);
  }

  private handOver(): void {
    const ctx = this.ctx;
    if (ctx === null || this.master === null) return;
    if (!this.musicWanted) return;
    if (!this.musicGateOpen) return;
    if (this.musicVoice?.bedId === this.musicBed.id) return;
    const buffer = this.musicBuffers.get(this.musicBed.id);
    if (buffer === undefined) return;

    if (this.musicVoice !== null) this.fadeOutVoice(this.musicVoice, MUSIC_FADE_MS);

    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.musicFilter ?? this.master);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.connect(gain);
    src.start();
    this.musicVoice = { bedId: this.musicBed.id, src, gain };
    this.ramp(gain, this.musicTarget(), MUSIC_FADE_MS);
  }

  private fadeOutVoice(voice: MusicVoice, ms: number): void {
    const ctx = this.ctx as AudioContext;
    this.ramp(voice.gain, 0, ms);
    voice.src.stop(ctx.currentTime + ms / 1000);
    voice.src.onended = (): void => {
      voice.src.disconnect();
      voice.gain.disconnect();
    };
    if (this.musicVoice === voice) this.musicVoice = null;
  }

  private applyStems(): void {
    const voice = this.musicVoice;
    if (voice === null || this.pres === null || this.ctx === null) return;
    voice.gain.gain.setTargetAtTime(this.musicTarget(), this.ctx.currentTime, 0.08);
  }
}
