
import type { Vec2, World } from '../sim/types';
import { COURT_ENCOUNTER } from './court';
import { dist } from '../sim/vec';

export type EscortStatus = 'available' | 'active' | 'complete' | 'failed';

export interface EscortState {
  status: EscortStatus;
  hp: number;
  maxHp: number;
  everHurt: boolean;
}

export const MARA = {
  name: 'MARA',
  at: { x: 5.5, y: -3.5 } as Vec2,
  radius: 0.46,
  reach: 1.8,
  offer: 'Take me as far as the Blade and I will show you the way in.',
  accepted: 'Then stay between me and them.',
};

export const createEscortState = (): EscortState => ({
  status: 'available',
  hp: 90,
  maxHp: 90,
  everHurt: false,
});

export const escortPresent = (world: World): boolean =>
  world.encounter.defId === COURT_ENCOUNTER;

export const nearMara = (at: Vec2): boolean => dist(at, MARA.at) <= MARA.reach;

export const maraWaiting = (state: EscortState): boolean => state.status === 'available';

export const escortPrompt = (
  state: EscortState,
  at: Vec2,
  interact: string,
): string | null =>
  maraWaiting(state) && nearMara(at) ? `${interact}  TAKE MARA WITH YOU` : null;

export const acceptEscort = (state: EscortState, at: Vec2): boolean => {
  if (!maraWaiting(state) || !nearMara(at)) return false;
  state.status = 'active';
  return true;
};

export const syncEscort = (state: EscortState, world: World): void => {
  if (state.status !== 'active') return;
  const companion = world.companion;
  if (companion === null) return;
  if (companion.hp < state.hp) state.everHurt = true;
  state.hp = companion.hp;
  if (companion.state === 'downed') state.status = 'failed';
};

export const settleEscort = (state: EscortState): void => {
  if (state.status === 'active') state.status = 'complete';
};

export const escortSpawn = (
  state: EscortState,
  playerAt: Vec2,
  playerFacing: number,
): Vec2 | null => {
  if (state.status !== 'active') return null;
  const back = playerFacing + Math.PI;
  return {
    x: playerAt.x + Math.cos(back) * 1.3 + Math.cos(back + Math.PI / 2) * 0.5,
    y: playerAt.y + Math.sin(back) * 1.3 + Math.sin(back + Math.PI / 2) * 0.5,
  };
};

export const escortObjective = (state: EscortState): string | null => {
  if (state.status === 'active') return `${MARA.name} — keep her alive`;
  if (state.status === 'failed') return `${MARA.name} is down`;
  return null;
};
