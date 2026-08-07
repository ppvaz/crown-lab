
import type { Obstacle, Vec2 } from '../sim/types';

export const COURT_ENCOUNTER = 'wayfarer_court';

export interface CourtPillar {
  at: Vec2;
  radius: number;
}

export const COURT_PILLARS: readonly CourtPillar[] = [
  { at: { x: 2.2, y: -3.4 }, radius: 0.78 },
  { at: { x: -3.4, y: 1.6 }, radius: 0.78 },
];

export const courtPillarObstacles = (): Obstacle[] =>
  COURT_PILLARS.map((pillar) => ({ at: { ...pillar.at }, radius: pillar.radius }));
