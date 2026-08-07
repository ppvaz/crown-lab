
import type { PowerKind, Vec2, World } from '../sim/types';
import { COURT_ENCOUNTER } from './court';
import { dist } from '../sim/vec';

export interface PowerStand {
  kind: Exclude<PowerKind, 'none'>;
  at: Vec2;
  label: string;
  teaches: string;
}

export const POWER_STANDS: readonly PowerStand[] = [
  {
    kind: 'lightning',
    at: { x: -6, y: 3.3 },
    label: 'THE STORM',
    teaches: 'Hold to pour lightning into everything in front of you',
  },
  {
    kind: 'blink',
    at: { x: -4, y: 4.35 },
    label: 'THE STEP',
    teaches: 'Cross the room instantly, through whatever is in the way',
  },
  {
    kind: 'pull',
    at: { x: -2, y: 5 },
    label: 'THE HOOK',
    teaches: 'Drag one of them off their footing and onto your blade',
  },
  {
    kind: 'push',
    at: { x: 0, y: 5.2 },
    label: 'THE WARD',
    teaches: 'Throw everything near you away and take the room back',
  },
  {
    kind: 'freeze',
    at: { x: 2, y: 5 },
    label: 'THE STILL',
    teaches: 'Stop a handful of them where they stand',
  },
  {
    kind: 'incinerate',
    at: { x: 4, y: 4.35 },
    label: 'THE PYRE',
    teaches: 'Set them burning, and let it finish them without you',
  },
  {
    kind: 'turncoat',
    at: { x: 6, y: 3.3 },
    label: 'THE WHISPER',
    teaches: 'Turn one of them, briefly, against the rest',
  },
];

export const STAND_RADIUS = 0.42;

export const STAND_REACH = 1.35;

export const armouryObstacles = (): Array<{ at: Vec2; radius: number }> =>
  POWER_STANDS.map((stand) => ({ at: { ...stand.at }, radius: STAND_RADIUS }));

export const standNear = (at: Vec2): PowerStand | null => {
  let best: PowerStand | null = null;
  let bestDistance = STAND_REACH;
  for (const stand of POWER_STANDS) {
    const d = dist(at, stand.at);
    if (d <= bestDistance) {
      best = stand;
      bestDistance = d;
    }
  }
  return best;
};

export const standPrompt = (
  stand: PowerStand | null,
  equipped: PowerKind,
  interact: string,
): string | null => {
  if (stand === null) return null;
  if (stand.kind === equipped) return null;
  return `${interact}  SWITCH POWER`;
};

export const isArmoury = (world: World): boolean =>
  world.encounter.defId === COURT_ENCOUNTER;
