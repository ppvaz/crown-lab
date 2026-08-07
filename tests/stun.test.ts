
import { describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';

import {
  bindingResponse,
  STUN_BINDING_REQUEST,
  STUN_BINDING_SUCCESS,
  STUN_MAGIC_COOKIE,
  STUN_MAPPED_ADDRESS,
  STUN_XOR_MAPPED_ADDRESS,
} from '../scripts/lib/stun.mjs';

const bindingRequest = (transactionId = randomBytes(12)): Buffer => {
  const message = Buffer.alloc(20);
  message.writeUInt16BE(STUN_BINDING_REQUEST, 0);
  message.writeUInt16BE(0, 2);
  message.writeUInt32BE(STUN_MAGIC_COOKIE, 4);
  transactionId.copy(message, 8);
  return message;
};

const attributes = (response: Buffer): Map<number, Buffer> => {
  const found = new Map<number, Buffer>();
  let offset = 20;
  while (offset + 4 <= response.length) {
    const type = response.readUInt16BE(offset);
    const length = response.readUInt16BE(offset + 2);
    found.set(type, response.subarray(offset + 4, offset + 4 + length));
    offset += 4 + length + ((4 - (length % 4)) % 4);
  }
  return found;
};

describe('stun binding response', () => {
  it('answers a binding request with a success response carrying the same transaction id', () => {
    const transactionId = randomBytes(12);
    const response = bindingResponse(bindingRequest(transactionId), { address: '10.0.0.76', port: 55033 });

    expect(response).not.toBeNull();
    expect(response!.readUInt16BE(0)).toBe(STUN_BINDING_SUCCESS);
    expect(response!.readUInt32BE(4)).toBe(STUN_MAGIC_COOKIE);
    expect(response!.subarray(8, 20).equals(transactionId)).toBe(true);
    expect(response!.readUInt16BE(2)).toBe(response!.length - 20);
  });

  it('reflects the sender address, XOR-masked as a browser reads it', () => {
    const response = bindingResponse(bindingRequest(), { address: '10.0.0.76', port: 55033 })!;
    const value = attributes(response).get(STUN_XOR_MAPPED_ADDRESS)!;

    expect(value).toBeDefined();
    expect(value.readUInt8(1)).toBe(0x01);
    expect(value.readUInt16BE(2) ^ (STUN_MAGIC_COOKIE >>> 16)).toBe(55033);

    const address = (value.readUInt32BE(4) ^ STUN_MAGIC_COOKIE) >>> 0;
    expect([address >>> 24, (address >>> 16) & 255, (address >>> 8) & 255, address & 255]).toEqual([
      10, 0, 0, 76,
    ]);
  });

  it('also sends the unmasked MAPPED-ADDRESS, for a client older than the XOR form', () => {
    const response = bindingResponse(bindingRequest(), { address: '192.168.1.5', port: 3000 })!;
    const value = attributes(response).get(STUN_MAPPED_ADDRESS)!;

    expect(value.readUInt16BE(2)).toBe(3000);
    expect(value.readUInt32BE(4)).toBe(((192 << 24) | (168 << 16) | (1 << 8) | 5) >>> 0);
  });

  it('is the LAN address and not a public one — the whole reason to run STUN locally', () => {
    const response = bindingResponse(bindingRequest(), { address: '10.0.0.91', port: 44100 })!;
    const value = attributes(response).get(STUN_XOR_MAPPED_ADDRESS)!;
    const address = (value.readUInt32BE(4) ^ STUN_MAGIC_COOKIE) >>> 0;
    expect(`${address >>> 24}.${(address >>> 16) & 255}.${(address >>> 8) & 255}.${address & 255}`).toBe(
      '10.0.0.91',
    );
  });

  describe('drops rather than answers', () => {
    it('a datagram shorter than a header', () => {
      expect(bindingResponse(Buffer.alloc(8), { address: '10.0.0.76', port: 1 })).toBeNull();
    });

    it('a message that is not a binding request', () => {
      const message = bindingRequest();
      message.writeUInt16BE(0x0101, 0);
      expect(bindingResponse(message, { address: '10.0.0.76', port: 1 })).toBeNull();
    });

    it('a message without the magic cookie — a stray packet on a LAN socket, not an error', () => {
      const message = bindingRequest();
      message.writeUInt32BE(0xdeadbeef, 4);
      expect(bindingResponse(message, { address: '10.0.0.76', port: 1 })).toBeNull();
    });
  });
});
