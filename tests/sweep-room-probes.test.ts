
import { describe, expect, it } from 'vitest';

import {
  ROOM_SWEEP_CONTROL,
  ROOM_SWEEP_SCALES,
  roomProbeFromName,
  sweepProbesFromSearch,
  sweepSchedule,
} from '../src/lab/sweep';
import { ROOM_SCALE_STEPS } from '../src/render/room-webgl-lab';

describe('the room probe grammar', () => {
  it('restates exactly the scales the renderer dial accepts', () => {
    expect([...ROOM_SWEEP_SCALES]).toEqual([...ROOM_SCALE_STEPS]);
  });

  it('reads msaa as removal and scale as a percentage, composed or alone', () => {
    expect(roomProbeFromName('room-msaa')).toEqual({ msaa: false, scale: 1 });
    expect(roomProbeFromName('room-scale-50')).toEqual({ msaa: true, scale: 0.5 });
    expect(roomProbeFromName('room-scale-75')).toEqual({ msaa: true, scale: 0.75 });
    expect(roomProbeFromName('room-msaa-scale-50')).toEqual({ msaa: false, scale: 0.5 });
  });

  it('refuses a spelling that would apply nothing', () => {
    expect(roomProbeFromName('room')).toBeNull();
    expect(roomProbeFromName('room-scale-60')).toBeNull();
    expect(roomProbeFromName('room-msaa-scale-33')).toBeNull();
    expect(roomProbeFromName('rooms-msaa')).toBeNull();
  });

  it('enters the sweep with Apotheosis off on both sides, and drops what it cannot parse', () => {
    const probes = sweepProbesFromSearch('?sweep=room-msaa,room-scale-60,room-scale-50');
    expect(probes).not.toBeNull();
    expect(probes!.map((probe) => probe.label)).toEqual(['room-msaa', 'room-scale-50']);
    for (const probe of probes!) {
      expect(probe.apotheosis).toBe('off');
      expect(probe.compositing).toBe('none');
      expect(probe.room).toBeDefined();
    }
  });

  it('weaves an Apotheosis-off control through an all-room sweep', () => {
    const probes = sweepProbesFromSearch('?sweep=room-msaa,room-scale-50')!;
    const steps = sweepSchedule(probes, 1);
    for (const step of steps.filter((s) => s.control)) {
      expect(step.apotheosis).toBe(ROOM_SWEEP_CONTROL.apotheosis);
      expect(step.apotheosis).toBe('off');
    }
    const compositing = sweepSchedule(sweepProbesFromSearch('?sweep=plain')!, 1);
    expect(compositing.find((s) => s.control)!.apotheosis).toBe('full');
  });

  it('refuses to mix room arms with tier or compositing probes', () => {
    const probes = sweepProbesFromSearch('?sweep=room-msaa,plain');
    expect(probes).not.toBeNull();
    expect(probes!.map((probe) => probe.label)).toEqual(['plain']);
  });
});
