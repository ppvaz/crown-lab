
import type { Player, SimEvent } from '../sim/types';
import { labCueForEvent } from '../render/cue-route';
import { HostEventFeed, type HostEventFeedHost } from './host-events';

export class LabEventFeed {
  readonly offsets: number[] = [];
  readonly tail: string[] = [];
  private readonly feed: HostEventFeed;

  constructor(
    host: Omit<HostEventFeedHost, 'cueForEvent' | 'panAnchor' | 'observe'> & {
      panAnchor(): Player;
    },
  ) {
    this.feed = new HostEventFeed({
      ...host,
      cueForEvent: labCueForEvent,
      panAnchor: host.panAnchor,
      observe: (event) => this.observe(event),
    });
  }

  reset(): void {
    this.offsets.length = 0;
    this.tail.length = 0;
  }

  absorb(events: readonly SimEvent[]): void {
    this.feed.absorb(events);
  }

  private observe(event: SimEvent): void {
    if (event.type === 'parry_success' || event.type === 'parry_failed') {
      this.offsets.push(Number(event.data?.offsetMs ?? 0));
      if (this.offsets.length > 120) this.offsets.shift();
    }

    const bits: string[] = [`${event.tick} ${event.type}`];
    if (event.data?.offsetMs !== undefined) {
      bits.push(`${Number(event.data.offsetMs).toFixed(0)}ms`);
    }
    if (event.data?.reason !== undefined) bits.push(String(event.data.reason));
    if (event.data?.power !== undefined) bits.push(String(event.data.power));
    if (event.data?.attackId !== undefined) bits.push(String(event.data.attackId));
    this.tail.push(bits.join(' '));
    if (this.tail.length > 40) this.tail.shift();
  }
}
