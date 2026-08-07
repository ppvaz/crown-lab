export function blenderCandidates(
  env: Record<string, string | undefined>,
  platform: string,
): { path: string; why: string }[];
export function resolveBlender(
  env?: Record<string, string | undefined>,
  platform?: string,
): string;
export function blenderVersion(bin: string): string;
