
export const STUN_MAGIC_COOKIE = 0x2112a442;

export const STUN_BINDING_REQUEST = 0x0001;
export const STUN_BINDING_SUCCESS = 0x0101;
export const STUN_XOR_MAPPED_ADDRESS = 0x0020;
export const STUN_MAPPED_ADDRESS = 0x0001;

const HEADER_BYTES = 20;

const addressAttribute = (type, address, port, mask) => {
  const value = Buffer.alloc(8);
  value.writeUInt8(0, 0);
  value.writeUInt8(0x01, 1);
  value.writeUInt16BE(port ^ (mask >>> 16), 2);

  const octets = address.split('.').map(Number);
  const packed = ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0;
  value.writeUInt32BE((packed ^ mask) >>> 0, 4);

  const attribute = Buffer.alloc(4 + value.length);
  attribute.writeUInt16BE(type, 0);
  attribute.writeUInt16BE(value.length, 2);
  value.copy(attribute, 4);
  return attribute;
};

/**
 * The answer to a binding request, or `null` for anything that is not one.
 *
 * Returning `null` rather than throwing is what lets the caller drop a packet in silence. This
 * socket is on a LAN and will be sent scans, mDNS spill and other protocols' traffic; none of that
 * is an error worth a line of output, and a UDP server that logs every stray packet is a server
 * somebody can make write an unbounded log by sending it noise.
 *
 * Both attributes go out. `XOR-MAPPED-ADDRESS` is what a browser reads; `MAPPED-ADDRESS` is the
 * pre-RFC-5389 field, costs twelve bytes, and means a client older than the XOR form still works.
 *
 * @param {Buffer} message  The datagram as received.
 * @param {{ address: string, port: number }} remote  Where it came from — the answer's whole content.
 * @returns {Buffer | null}
 */
export const bindingResponse = (message, remote) => {
  if (message.length < HEADER_BYTES) return null;
  if (message.readUInt16BE(0) !== STUN_BINDING_REQUEST) return null;
  if (message.readUInt32BE(4) !== STUN_MAGIC_COOKIE) return null;
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(remote.address)) return null;

  const attributes = Buffer.concat([
    addressAttribute(STUN_XOR_MAPPED_ADDRESS, remote.address, remote.port, STUN_MAGIC_COOKIE),
    addressAttribute(STUN_MAPPED_ADDRESS, remote.address, remote.port, 0),
  ]);

  const response = Buffer.alloc(HEADER_BYTES + attributes.length);
  response.writeUInt16BE(STUN_BINDING_SUCCESS, 0);
  response.writeUInt16BE(attributes.length, 2);
  response.writeUInt32BE(STUN_MAGIC_COOKIE, 4);
  message.copy(response, 8, 8, HEADER_BYTES);
  attributes.copy(response, HEADER_BYTES);
  return response;
};
