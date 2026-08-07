
import type { CombatConfig, Vec2, World } from '../sim/types';
import type { KingIdentityId } from '../render/king-identities';
import { KING_IDENTITIES } from '../render/king-identities';
import { addPlayer } from '../sim/encounter';
import { clampToArena } from '../sim/arena';
import { fingerprintWorld } from '../sim/fingerprint';

const FNV_PRIME = 0x01000193;

const mixU32 = (h: number, n: number): number => Math.imul(h ^ (n >>> 0), FNV_PRIME) >>> 0;

const mixString = (h: number, value: string): number => {
  let acc = mixU32(h, value.length);
  for (let i = 0; i < value.length; i++) acc = mixU32(acc, value.charCodeAt(i));
  return acc;
};

const usable = (h: number): number => (h >>> 0) || 1;

export const roomWorldSeed = (room: string): number => usable(mixString(0x811c9dc5, room));

export const nextWorldSeed = (world: World, exitId: string): number =>
  usable(mixString(mixU32(fingerprintWorld(world), world.tick), exitId));

export const seatIdentities = (room: string, size: number): KingIdentityId[] => {
  const pool = KING_IDENTITIES.slice(1).map((identity) => identity.id);
  let h = usable(mixString(0x811c9dc5, `${room}:identities`));
  for (let i = pool.length - 1; i > 0; i--) {
    h = usable(mixU32(h, i));
    const j = h % (i + 1);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const seats: KingIdentityId[] = [KING_IDENTITIES[0].id];
  for (let i = 1; i < size; i++) seats.push(pool[(i - 1) % pool.length]);
  return seats;
};

const ABREAST = 1.2;

export const seatCoopRoster = (world: World, cfg: CombatConfig, size: number): void => {
  const anchor = world.players[0];
  const inward = { x: -anchor.pos.x, y: -anchor.pos.y };
  const length = Math.sqrt(inward.x * inward.x + inward.y * inward.y);
  const step: Vec2 =
    length < 0.001 ? { x: ABREAST, y: 0 } : { x: (inward.x / length) * ABREAST, y: (inward.y / length) * ABREAST };
  for (let i = world.players.length; i < size; i++) {
    const at = clampToArena(
      world.arena,
      { x: anchor.pos.x + step.x * i, y: anchor.pos.y + step.y * i },
      cfg.player.radius,
    );
    addPlayer(world, cfg, at);
  }
};

const swappedSeat = (seat: number, moved: number): number =>
  seat === 0 ? moved : seat === moved ? 0 : seat;

export const partCoopRoster = (
  world: World,
  identities: KingIdentityId[],
  speakers: readonly { speaker: number }[],
  localPlayer: number,
): number => {
  if (world.players.length <= 1) return localPlayer;
  const survivor = world.players[localPlayer];
  if (survivor === undefined) return localPlayer;
  if (localPlayer !== 0) {
    world.players[localPlayer] = world.players[0];
    world.players[0] = survivor;
    const worn = identities[localPlayer];
    const firstWorn = identities[0];
    if (worn !== undefined && firstWorn !== undefined) {
      identities[localPlayer] = firstWorn;
      identities[0] = worn;
    }
    for (const state of speakers) state.speaker = swappedSeat(state.speaker, localPlayer);
  }
  for (let seat = 1; seat < world.players.length; seat++) world.players[seat].hp = 0;
  return 0;
};
