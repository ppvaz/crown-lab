
declare const __CROWN_LAB__: boolean;

declare const __CROWN_SIGNALING_URL__: string;

interface CrownLabWatermark {
  readonly version: number;
  readonly recipient: string;
  readonly commit: string;
  readonly sourceDigest: string;
  readonly dirty: boolean;
  readonly issuedAt: string;
  readonly nonce: string;
  readonly id: string;
  readonly signature: string;
  readonly signed: boolean;
}

declare const __CROWN_WATERMARK__: CrownLabWatermark;

interface CrownAssetBytes {
  readonly blocking: number;
  readonly heavy: { readonly music: number; readonly meshes: number };
  readonly total: number;
}

declare const __CROWN_ASSET_BYTES__: CrownAssetBytes;

declare module '*.webp' {
  const url: string;
  export default url;
}

declare module '*?raw' {
  const text: string;
  export default text;
}
