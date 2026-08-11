
export type OggInfo =
  | {
      ok: true;
      codec: 'vorbis' | 'opus';
      channels: number;
      sampleRate: number;
      durationSeconds: number;
    }
  | { ok: false; problem: string };

export function oggInfo(buffer: Buffer): OggInfo;

export function decodedBytes(info: OggInfo): number;

export function oggProblem(info: OggInfo): string | null;
