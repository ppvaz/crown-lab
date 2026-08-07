
export const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const ROOM_CODE_LENGTH = 6;

export const isRoomCode = (code: string): boolean =>
  code.length === ROOM_CODE_LENGTH && [...code].every((c) => ROOM_ALPHABET.includes(c));
