
import { COMBAT_PRESETS, DEFAULT_SLOWMO_ID, SLOWMO_PRESETS } from '../lab/config';
import { DEFAULT_ENCOUNTER_ID } from '../lab/encounters';
import { DEFAULT_PRESENTATION_ID, PRESENTATION_PRESETS } from '../lab/presentation';
import { ORCHESTRATION_POLICIES } from '../lab/orchestrator';
import { DEFAULT_MATERIAL, MATERIAL_PACKS } from '../render/materials-lab';
import { MODEL_BANKS } from '../render/cast/banks-lab';
import { DEFAULT_MODEL_BANK } from '../render/models';
import { modeIdFor, modeProfile } from '../lab/modes';
import type { ModeProfile } from '../lab/modes';
import type { CaptureShot } from './capture';
import { clearSelections, indexOfId, loadSelections, saveSelections } from './prefs';
import { rendererId, restoreRenderer } from './lab-gl';
import { setWeather } from '../render/room-weather-lab';
import { AIM_MODES } from './input';
import type { AimMode } from './input';

export class LabDials {
  readonly combatIds: string[];
  readonly slowMoIds: string[];
  readonly presentationIds: string[];
  readonly packIds: string[];
  readonly modelBankIds: string[];

  combatIndex: number;
  slowMoIndex: number;
  encounterIndex: number;
  presentationIndex: number;
  packIndex: number;
  modelBankIndex: number;
  seed = 1;

  private lastSaved = '';

  constructor(
    readonly encounterIds: string[],
    private readonly aim: { get(): AimMode; set(mode: AimMode): void },
  ) {
    this.combatIds = Object.keys(COMBAT_PRESETS);
    this.slowMoIds = Object.keys(SLOWMO_PRESETS);
    this.presentationIds = [
      ...Object.keys(PRESENTATION_PRESETS),
      ...Object.keys(ORCHESTRATION_POLICIES),
    ];
    this.packIds = Object.keys(MATERIAL_PACKS);
    this.modelBankIds = Object.keys(MODEL_BANKS);
    this.combatIndex = this.combatIds.indexOf('Default');
    this.slowMoIndex = this.slowMoIds.indexOf(DEFAULT_SLOWMO_ID);
    this.encounterIndex = encounterIds.indexOf(DEFAULT_ENCOUNTER_ID);
    this.presentationIndex = this.presentationIds.indexOf(DEFAULT_PRESENTATION_ID);
    this.packIndex = this.packIds.indexOf(DEFAULT_MATERIAL.id);
    this.modelBankIndex = this.modelBankIds.indexOf(DEFAULT_MODEL_BANK);
  }

  combatId(): string {
    return this.combatIds[this.combatIndex];
  }
  slowMoId(): string {
    return this.slowMoIds[this.slowMoIndex];
  }
  encounterId(): string {
    return this.encounterIds[this.encounterIndex];
  }
  presentationId(): string {
    return this.presentationIds[this.presentationIndex];
  }
  packId(): string {
    return this.packIds[this.packIndex];
  }
  modelBankId(): string {
    return this.modelBankIds[this.modelBankIndex];
  }

  applyDefaults(): void {
    clearSelections();
    this.lastSaved = '';
    this.combatIndex = this.combatIds.indexOf('Default');
    this.slowMoIndex = this.slowMoIds.indexOf(DEFAULT_SLOWMO_ID);
    this.encounterIndex = this.encounterIds.indexOf(DEFAULT_ENCOUNTER_ID);
    this.presentationIndex = this.presentationIds.indexOf(DEFAULT_PRESENTATION_ID);
    this.packIndex = this.packIds.indexOf(DEFAULT_MATERIAL.id);
    this.modelBankIndex = this.modelBankIds.indexOf(DEFAULT_MODEL_BANK);
    this.seed = 1;
    this.aim.set('mouse');
  }

  private selections() {
    return {
      combatId: this.combatId(),
      slowMoId: this.slowMoId(),
      encounterId: this.encounterId(),
      presentationId: this.presentationId(),
      materialPack: this.packId(),
      modelBank: this.modelBankId(),
      seed: this.seed,
      aimMode: this.aim.get(),
      rendererId: rendererId(),
    };
  }

  persist(): void {
    const next = JSON.stringify(this.selections());
    if (next === this.lastSaved) return;
    this.lastSaved = next;
    saveSelections(this.selections());
  }

  restore(): boolean {
    const stored = loadSelections();
    restoreRenderer();
    if (stored === null) return false;
    this.combatIndex = indexOfId(this.combatIds, stored.combatId, this.combatIndex);
    this.slowMoIndex = indexOfId(this.slowMoIds, stored.slowMoId, this.slowMoIndex);
    this.encounterIndex = indexOfId(this.encounterIds, stored.encounterId, this.encounterIndex);
    this.presentationIndex = indexOfId(
      this.presentationIds,
      stored.presentationId,
      this.presentationIndex,
    );
    this.packIndex = indexOfId(this.packIds, stored.materialPack, this.packIndex);
    this.modelBankIndex = indexOfId(this.modelBankIds, stored.modelBank, this.modelBankIndex);
    if (stored.seed !== undefined) this.seed = stored.seed;
    const aim = AIM_MODES.find((m) => m === stored.aimMode);
    if (aim !== undefined) this.aim.set(aim);
    return true;
  }

  applyCapture(shot: CaptureShot | null): void {
    if (shot === null) return;
    this.combatIndex = indexOfId(this.combatIds, shot.combatId, this.combatIndex);
    this.slowMoIndex = indexOfId(this.slowMoIds, shot.slowMoId, this.slowMoIndex);
    this.encounterIndex = indexOfId(this.encounterIds, shot.encounterId, this.encounterIndex);
    this.presentationIndex = indexOfId(
      this.presentationIds,
      shot.presentationId,
      this.presentationIndex,
    );
    this.packIndex = indexOfId(this.packIds, shot.materialPack, this.packIndex);
    this.modelBankIndex = indexOfId(this.modelBankIds, shot.modelBank, this.modelBankIndex);
    this.seed = shot.seed;
    setWeather(shot.weather ?? 'clear');
  }

  applyModeProfile(profile: ModeProfile): void {
    this.combatIndex = indexOfId(this.combatIds, profile.combatId, this.combatIndex);
    this.encounterIndex = indexOfId(this.encounterIds, profile.encounterId, this.encounterIndex);
    this.presentationIndex = indexOfId(
      this.presentationIds,
      profile.presentationId,
      this.presentationIndex,
    );
    this.slowMoIndex = indexOfId(this.slowMoIds, profile.slowMoId, this.slowMoIndex);
  }

  activeModeId(): string | null {
    return modeIdFor({
      combatId: this.combatId(),
      encounterId: this.encounterId(),
      presentationId: this.presentationId(),
      slowMoId: this.slowMoId(),
    });
  }

  modeReadout(): string[] {
    const id = this.activeModeId();
    const profile = id === null ? undefined : modeProfile(id);
    if (profile === undefined) return ['  mode         none — the dials constitute no profile'];
    return [
      `  mode         ${profile.name} [${profile.id}] · ${profile.source}`,
      `  question     ${profile.question}`,
      `  watch        ${profile.watchFor}`,
    ];
  }
}
