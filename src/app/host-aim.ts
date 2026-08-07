
import type { Player, World } from '../sim/types';
import { angleOf, sub } from '../sim/vec';
import type { Camera } from '../render/iso';
import { screenToWorld } from '../render/iso';
import type { InputSource } from './input';

export const installAimResolvers = (
  input: InputSource,
  cam: Camera,
  king: () => Player,
  world: () => World,
): void => {
  input.aimResolver = (sx, sy) => {
    const target = screenToWorld(cam, sx, sy);
    const d = sub(target, king().pos);
    return Math.hypot(d.x, d.y) < 0.15 ? null : angleOf(d);
  };

  const bearingTo = (target: { pos: { x: number; y: number } }): number | null => {
    const d = sub(target.pos, king().pos);
    return Math.hypot(d.x, d.y) < 0.05 ? null : angleOf(d);
  };

  input.autoAimResolver = (strategy) => {
    const alive = world().enemies.filter((e) => e.state.kind !== 'dead');
    if (alive.length === 0) return null;

    if (strategy === 'nearest') {
      const from = king().pos;
      const nearest = alive.reduce((a, b) => {
        const da = Math.hypot(a.pos.x - from.x, a.pos.y - from.y);
        const db = Math.hypot(b.pos.x - from.x, b.pos.y - from.y);
        return da <= db ? a : b;
      });
      return bearingTo(nearest);
    }

    const committed = alive.filter(
      (e) => e.state.kind === 'telegraph' || e.state.kind === 'attack',
    );
    if (committed.length === 0) return null;
    return bearingTo(committed.reduce((a, b) => (a.state.elapsedMs >= b.state.elapsedMs ? a : b)));
  };

  input.aimDistanceResolver = (sx, sy) => {
    const target = screenToWorld(cam, sx, sy);
    const d = sub(target, king().pos);
    return Math.hypot(d.x, d.y);
  };
};
