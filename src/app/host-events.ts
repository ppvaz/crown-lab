
import type { CombatConfig, Player, SimEvent, World } from '../sim/types';
import type { Audio } from '../render/audio';
import type { AudioCue } from '../render/soundbank';
import type { Camera } from '../render/iso';
import { worldToScreen } from '../render/iso';

export interface HostEventFeedHost {
  audio: Audio;
  cam: Camera;
  world(): World;
  combat(): CombatConfig;
  cueForEvent(event: SimEvent): AudioCue | null;
  panAnchor(): Player;
  observe?(event: SimEvent): void;
}

export class HostEventFeed {
  constructor(private readonly host: HostEventFeedHost) {}

  absorb(events: readonly SimEvent[]): void {
    const { audio } = this.host;
    for (const event of events) {
      if (event.type === 'boss_intro_roar_started') audio.setMusicGate(true);
      if (event.type === 'enemy_died' && this.isBossArchetype(event.data?.archetype)) {
        audio.retireMusic();
      }
      if (event.type === 'guard_broken') {
        audio.duckMusicForStagger(this.host.combat().player.guard.guardBreakStaggerMs);
      }
      const cue = this.host.cueForEvent(event);
      if (cue !== null) audio.play(cue, this.panFor(event));
      this.host.observe?.(event);
    }
  }

  private panFor(event: SimEvent): number {
    const world = this.host.world();
    const anchor = this.host.panAnchor();
    const id = event.target ?? event.actor;
    const source =
      id === undefined || id === 0
        ? anchor
        : (world.enemies.find((enemy) => enemy.id === id) ?? anchor);
    const point = worldToScreen(this.host.cam, source.pos);
    return Math.max(
      -1,
      Math.min(1, (point.x - this.host.cam.width / 2) / (this.host.cam.width / 2)),
    );
  }

  private isBossArchetype(archetype: unknown): boolean {
    return (
      typeof archetype === 'string' &&
      (this.host.combat().enemies as Record<string, { boss?: unknown } | undefined>)[archetype]
        ?.boss !== undefined
    );
  }
}
