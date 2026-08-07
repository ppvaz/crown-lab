
import { describe, expect, it } from 'vitest';
import { deflateSync } from 'node:zlib';

import { pngEncode, pngPixels, pngSize } from '../scripts/lib/png.mjs';

const gradient = (width: number, height: number) => {
  const rgb = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 3;
      rgb[i] = (x * 7 + y * 3) & 0xff;
      rgb[i + 1] = (y * 5) & 0xff;
      rgb[i + 2] = (x * y) & 0xff;
    }
  }
  return rgb;
};

const withFilter = (width: number, height: number, rgb: Buffer, filter: number) => {
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = filter;
    for (let i = 0; i < stride; i += 1) {
      const value = rgb[y * stride + i];
      const a = i >= 3 ? rgb[y * stride + i - 3] : 0;
      const b = y > 0 ? rgb[(y - 1) * stride + i] : 0;
      const c = y > 0 && i >= 3 ? rgb[(y - 1) * stride + i - 3] : 0;
      let encoded = value;
      if (filter === 1) encoded = value - a;
      else if (filter === 2) encoded = value - b;
      else if (filter === 3) encoded = value - ((a + b) >> 1);
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        encoded = value - (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      }
      raw[y * (stride + 1) + 1 + i] = encoded & 0xff;
    }
  }
  const base = pngEncode({ width, height, rgb });
  const idatStart = base.indexOf(Buffer.from('IDAT', 'ascii')) - 4;
  const head = base.subarray(0, idatStart);
  const payload = deflateSync(raw);
  const chunk = Buffer.alloc(8 + payload.length + 4);
  chunk.writeUInt32BE(payload.length, 0);
  chunk.write('IDAT', 4, 'ascii');
  payload.copy(chunk, 8);
  const iend = base.subarray(base.length - 12);
  return Buffer.concat([head, chunk, iend]);
};

describe('pngPixels', () => {
  it('round-trips every pixel through pngEncode', () => {
    const rgb = gradient(37, 23);
    const decoded = pngPixels(pngEncode({ width: 37, height: 23, rgb }));
    expect(decoded.width).toBe(37);
    expect(decoded.height).toBe(23);
    for (let y = 0; y < 23; y += 1) {
      for (let x = 0; x < 37; x += 1) {
        const i = (y * 37 + x) * 3;
        expect(decoded.at(x, y)).toEqual([rgb[i], rgb[i + 1], rgb[i + 2]]);
      }
    }
  });

  it('decodes all five scanline filters identically', () => {
    const rgb = gradient(31, 19);
    for (const filter of [0, 1, 2, 3, 4]) {
      const decoded = pngPixels(withFilter(31, 19, rgb, filter));
      const wrong: number[] = [];
      for (let y = 0; y < 19; y += 1) {
        for (let x = 0; x < 31; x += 1) {
          const i = (y * 31 + x) * 3;
          const got = decoded.at(x, y);
          if (got[0] !== rgb[i] || got[1] !== rgb[i + 1] || got[2] !== rgb[i + 2]) wrong.push(i);
        }
      }
      expect({ filter, wrong: wrong.length }).toEqual({ filter, wrong: 0 });
    }
  });

  it('refuses what it cannot decode instead of returning approximate pixels', () => {
    const png = pngEncode({ width: 4, height: 4, rgb: gradient(4, 4) });
    const interlaced = Buffer.from(png);
    interlaced.writeUInt8(1, 28);
    expect(() => pngPixels(interlaced)).toThrow(/interlaced/);

    const deepened = Buffer.from(png);
    deepened.writeUInt8(16, 24);
    expect(() => pngPixels(deepened)).toThrow(/bit depth/);

    expect(() => pngPixels(Buffer.alloc(64))).toThrow(/not a PNG/);
  });

  it('agrees with pngSize on the header it shares', () => {
    const png = pngEncode({ width: 12, height: 9, rgb: gradient(12, 9) });
    expect(pngSize(png)).toEqual({ width: 12, height: 9, bitDepth: 8, colorType: 2 });
  });
});

describe('pngEncode', () => {
  it('refuses a buffer that is not the size it claims', () => {
    expect(() => pngEncode({ width: 10, height: 10, rgb: Buffer.alloc(10) })).toThrow(/expected/);
  });

  it('round-trips alpha, which is what makes it able to write a layer', () => {
    const rgba = new Uint8Array(17 * 11 * 4);
    for (let i = 0; i < rgba.length; i += 1) rgba[i] = (i * 7) & 0xff;
    const png = pngEncode({ width: 17, height: 11, rgba });
    expect(pngSize(png)).toEqual({ width: 17, height: 11, bitDepth: 8, colorType: 6 });
    const decoded = pngPixels(png);
    expect(decoded.channels).toBe(4);
    for (let y = 0; y < 11; y += 1) {
      for (let x = 0; x < 17; x += 1) {
        const i = (y * 17 + x) * 4;
        expect(decoded.at(x, y)).toEqual([rgba[i], rgba[i + 1], rgba[i + 2]]);
        expect(decoded.alphaAt(x, y)).toBe(rgba[i + 3]);
      }
    }
  });

  it('takes one of the two, so a caller cannot silently get the wrong channel count', () => {
    expect(() => pngEncode({ width: 1, height: 1 })).toThrow(/needs rgb or rgba/);
    expect(() =>
      pngEncode({ width: 1, height: 1, rgb: Buffer.alloc(3), rgba: Buffer.alloc(4) }),
    ).toThrow(/not both/);
  });

  it('reports an RGB image as three channels and opaque, because that is the truth about it', () => {
    const decoded = pngPixels(pngEncode({ width: 3, height: 2, rgb: gradient(3, 2) }));
    expect(decoded.channels).toBe(3);
    expect(decoded.alphaAt(1, 1)).toBe(255);
  });
});
