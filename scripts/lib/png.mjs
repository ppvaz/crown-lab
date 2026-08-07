
import { deflateSync, inflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * @param {Buffer} buffer
 * @returns {{ width: number, height: number, bitDepth: number, colorType: number }}
 * @throws when the buffer is not a PNG, so a truncated or misnamed file fails loudly rather than
 *         reading as 0x0 and passing a dimension check by accident.
 */
export const pngSize = (buffer) => {
  if (buffer.length < 33) throw new Error(`too short to be a PNG (${buffer.length} bytes)`);
  if (!buffer.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG (bad signature)');
  if (buffer.subarray(12, 16).toString('ascii') !== 'IHDR') {
    throw new Error('not a PNG (first chunk is not IHDR)');
  }
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (width === 0 || height === 0) throw new Error(`degenerate PNG (${width}x${height})`);
  return { width, height, bitDepth: buffer.readUInt8(24), colorType: buffer.readUInt8(25) };
};

const CHANNELS = { 0: 1, 2: 3, 4: 2, 6: 4 };

/**
 * Full RGB decode, for the one job the header cannot do: measuring a concept panel.
 *
 * `pngSize` above stays the validator's reader and gains nothing from this — a check that runs on
 * every commit should not inflate two megabytes to learn a width. This is the other half of the
 * argument in that header rather than a contradiction of it: `measure-panel-corners.mjs` runs by
 * hand, against a gitignored panel, to produce numbers that then get committed and checked without
 * it. `node:zlib` keeps that off the dependency list, which is what made a decoder unwelcome.
 *
 * 8-bit non-interlaced only — the whole concept corpus is `colour 2, depth 8, interlace 0`, and a
 * decoder that quietly half-supports a format is how a measurement instrument returns a plausible
 * wrong number. Anything else throws.
 *
 * @param {Buffer} buffer
 * @returns {{ width: number, height: number, at: (x: number, y: number) => [number, number, number] }}
 */
export const pngPixels = (buffer) => {
  const { width, height, bitDepth, colorType } = pngSize(buffer);
  if (bitDepth !== 8) throw new Error(`unsupported bit depth ${bitDepth} — only 8 is decoded`);
  const channels = CHANNELS[colorType];
  if (!channels) throw new Error(`unsupported colour type ${colorType}`);
  if (buffer.readUInt8(28) !== 0) throw new Error('interlaced PNGs are not decoded');

  const parts = [];
  for (let offset = 8; offset + 8 <= buffer.length; ) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
    if (type === 'IDAT') parts.push(buffer.subarray(offset + 8, offset + 8 + length));
    offset += 12 + length;
    if (type === 'IEND') break;
  }
  if (parts.length === 0) throw new Error('no IDAT chunk');

  const raw = inflateSync(Buffer.concat(parts));
  const stride = width * channels;
  if (raw.length < (stride + 1) * height) {
    throw new Error(`truncated image data (${raw.length} bytes for ${width}x${height})`);
  }

  const out = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    const up = dst - stride;
    for (let i = 0; i < stride; i += 1) {
      const x = raw[src + i];
      const a = i >= channels ? out[dst + i - channels] : 0;
      const b = y > 0 ? out[up + i] : 0;
      const c = y > 0 && i >= channels ? out[up + i - channels] : 0;
      let value;
      if (filter === 0) value = x;
      else if (filter === 1) value = x + a;
      else if (filter === 2) value = x + b;
      else if (filter === 3) value = x + ((a + b) >> 1);
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        value = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      } else throw new Error(`unknown scanline filter ${filter} on row ${y}`);
      out[dst + i] = value & 0xff;
    }
  }

  const at = (x, y) => {
    const i = y * stride + x * channels;
    return channels >= 3 ? [out[i], out[i + 1], out[i + 2]] : [out[i], out[i], out[i]];
  };
  const alphaAt =
    channels === 2 || channels === 4
      ? (x, y) => out[y * stride + x * channels + channels - 1]
      : () => 255;
  return { width, height, channels, at, alphaAt };
};

/**
 * Re-encode pixels as a PNG, so a measurement can show its work.
 *
 * `measure-panel-corners.mjs` draws its samples and its fitted lines back over the art and writes
 * the result out. That overlay is the only reason to trust the numbers: every instrument in this
 * repository that produced a plausible wrong figure produced it in a form nobody could look at.
 * Filter 0 on every row and let zlib do the work — the encoder should stay small enough to be
 * obviously correct.
 *
 * **`rgba` writes an asset and not a debug image**, which is a real change to what this function is
 * for. `export-room-layers.mjs` derives the `shadow` layer from two renders rather than taking it
 * from a pass, for reasons in `light-layers.mjs`, and a layer without alpha composites as an opaque
 * rectangle over everything beneath it — which `room-package.mjs` fails a package for. Straight
 * alpha, matching what Blender writes and what the manifest declares.
 *
 * @param {{ width: number, height: number, rgb?: Uint8Array | Buffer, rgba?: Uint8Array | Buffer }} image
 * @returns {Buffer}
 */
export const pngEncode = ({ width, height, rgb, rgba }) => {
  const source = rgba ?? rgb;
  if (source === undefined) throw new Error('pngEncode needs rgb or rgba pixels');
  if (rgb !== undefined && rgba !== undefined) throw new Error('pngEncode takes rgb or rgba, not both');
  const channels = rgba === undefined ? 3 : 4;
  const stride = width * channels;
  if (source.length !== stride * height) {
    throw new Error(`expected ${stride * height} bytes of ${channels}-channel pixels, got ${source.length}`);
  }
  const pixels = Buffer.isBuffer(source) ? source : Buffer.from(source);
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const crcTable = [];
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c >>> 0;
  }
  const crc32 = (buf) => {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, payload) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(payload.length, 0);
    head.write(type, 4, 'ascii');
    const tail = Buffer.alloc(4);
    tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), payload])), 0);
    return Buffer.concat([head, payload, tail]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8);
  ihdr.writeUInt8(channels === 4 ? 6 : 2, 9);
  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};
