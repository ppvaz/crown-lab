
import type { Palette } from '../render/palette';
import type { Camera } from '../render/iso';
import type { ResolvedPresentation } from '../lab/presentation';
import {
  MODEL_TURNTABLE_STATES,
  drawModelTurntable,
} from '../render/models';
import type { ModelBank, ModelRole } from '../render/models';
import type { KingIdentityId } from '../render/king-identities';
import { identityById, identityModels, identityPalette } from '../render/king-identities';

type TurntableState = (typeof MODEL_TURNTABLE_STATES)[number];

const TURNTABLE_ROLES: readonly ModelRole[] = [
  'player',
  'guard',
  'duelist',
  'archer',
  'first_blade',
  'captain',
  'captain_read',
  'rain_boss',
  'chancellor',
  'elite_guard',
  'mesh_guard',
  'pike_novice',
  'pike_boss',
  'thorn_marshal',
  'queen',
];

export class ShowcaseLab {
  private index: number;
  private stateIndex: number;
  private elapsedMs: number;
  private readonly fixedTimeMs: number | null;
  private readonly requestedIdentity: string | null;
  readonly requestedBank: string | null;

  constructor(search: URLSearchParams) {
    const requestedTime = Number(search.get('turntableTime'));
    this.fixedTimeMs =
      search.has('turntableTime') && Number.isFinite(requestedTime)
        ? Math.max(0, requestedTime)
        : null;
    this.index = TURNTABLE_ROLES.indexOf(search.get('turntable') as ModelRole);
    this.stateIndex = Math.max(
      0,
      MODEL_TURNTABLE_STATES.findIndex((state) => state.id === search.get('turntableState')),
    );
    this.elapsedMs = this.fixedTimeMs ?? 0;
    this.requestedIdentity = search.get('turntableIdentity');
    this.requestedBank = search.get('turntableBank');
  }

  get active(): boolean {
    return this.index >= 0;
  }

  role(): ModelRole | null {
    return this.index < 0 ? null : TURNTABLE_ROLES[this.index];
  }

  state(): TurntableState {
    return MODEL_TURNTABLE_STATES[this.stateIndex];
  }

  cycleRole(step: number): ModelRole | null {
    const slots = TURNTABLE_ROLES.length + 1;
    const current = this.index + 1;
    this.index = ((current + step + slots) % slots) - 1;
    return this.role();
  }

  cycleState(step: number): TurntableState | null {
    if (this.role() === null) return null;
    this.stateIndex =
      (this.stateIndex + step + MODEL_TURNTABLE_STATES.length) % MODEL_TURNTABLE_STATES.length;
    this.elapsedMs = 0;
    return this.state();
  }

  private tint(role: ModelRole, pal: Palette): string {
    const colors: Partial<Record<ModelRole, string>> = {
      player: pal.player,
      guard: pal.guard,
      duelist: pal.duelist,
      archer: pal.archer,
      first_blade: pal.firstBlade,
      captain: pal.captain,
      captain_read: pal.captain,
      rain_boss: pal.rainBoss,
      chancellor: pal.chancellor,
      elite_guard: pal.eliteGuard,
      mesh_guard: pal.guard,
      pike_novice: pal.pikeNovice,
      pike_boss: pal.pikeBoss,
      thorn_marshal: pal.thornMarshal,
      queen: pal.queen,
    };
    return colors[role] ?? pal.hudText;
  }

  draw(
    ctx: CanvasRenderingContext2D,
    cam: Camera,
    models: ModelBank,
    pal: Palette,
    pres: ResolvedPresentation,
    content: { x: number; y: number; w: number; h: number },
    dtRealMs: number,
  ): boolean {
    const showcase = this.role();
    if (showcase === null) {
      delete document.documentElement.dataset.turntableReady;
      delete document.documentElement.dataset.turntableRole;
      delete document.documentElement.dataset.turntableIdentity;
      delete document.documentElement.dataset.turntableState;
      delete document.documentElement.dataset.turntableTime;
      return false;
    }
    if (this.fixedTimeMs === null) this.elapsedMs += dtRealMs;
    const dressed =
      showcase === 'player' && this.requestedIdentity !== null
        ? identityById(this.requestedIdentity as KingIdentityId)
        : null;
    const showcasePal =
      dressed === null
        ? pal
        : identityPalette(pal, dressed, pres.visual, pres.preserveThreatColors);
    drawModelTurntable(
      ctx,
      cam,
      dressed === null ? models : identityModels(models, dressed),
      showcase,
      showcasePal,
      dressed === null ? this.tint(showcase, pal) : showcasePal.player,
      showcase === 'player' ? pal.playerAccent : null,
      content,
      {
        pose: this.state(),
        elapsedMs: this.fixedTimeMs ?? this.elapsedMs,
      },
    );
    document.documentElement.dataset.turntableReady = 'true';
    document.documentElement.dataset.turntableRole = showcase;
    if (dressed !== null) document.documentElement.dataset.turntableIdentity = dressed.id;
    document.documentElement.dataset.turntableState = this.state().id;
    document.documentElement.dataset.turntableTime = String(
      Math.round(this.fixedTimeMs ?? this.elapsedMs),
    );
    return true;
  }
}
