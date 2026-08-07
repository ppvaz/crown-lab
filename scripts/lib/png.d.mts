export function pngSize(buffer: Buffer): {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
};
export interface PngImage {
  width: number;
  height: number;
  channels: number;
  at: (x: number, y: number) => [number, number, number];
  alphaAt: (x: number, y: number) => number;
}
export function pngPixels(buffer: Buffer): PngImage;
export function pngEncode(image: {
  width: number;
  height: number;
  rgb?: Uint8Array | Buffer;
  rgba?: Uint8Array | Buffer;
}): Buffer;
