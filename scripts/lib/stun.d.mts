
export const STUN_MAGIC_COOKIE: number;
export const STUN_BINDING_REQUEST: number;
export const STUN_BINDING_SUCCESS: number;
export const STUN_XOR_MAPPED_ADDRESS: number;
export const STUN_MAPPED_ADDRESS: number;

export function bindingResponse(
  message: Buffer,
  remote: { address: string; port: number },
): Buffer | null;
