
import type { PlanEntry } from './audio-plan.d.mts';

export interface AudioProvider {
  id: string;
  keyEnv: string;
  format: string;
  endpoint: string;
  generate(entry: PlanEntry, key: string): Promise<Buffer>;
  credits?(key: string): Promise<number | null>;
}

export function soundKind(entry: PlanEntry): 'one_shot' | 'loop';

export const PROVIDERS: Record<string, AudioProvider>;
export function providerNamed(name: string): AudioProvider;
export function keyFor(provider: { keyEnv: string; id: string }): string;
