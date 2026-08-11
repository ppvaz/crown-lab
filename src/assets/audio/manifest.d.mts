
export interface AuthoredPrompt {
  prompt: string;
  durationSeconds?: number;
  durationReason?: string;
  promptInfluence?: number;
  influenceReason?: string;
}

export type PromptEntry = string | AuthoredPrompt;

export interface AudioPackManifest {
  id: string;
  description: string;
  prompts: Readonly<Record<string, PromptEntry>>;
}

export const PACKS: Readonly<Record<string, AudioPackManifest>>;

export interface BankTake {
  from?: string;
  roll?: number;
  file?: string;
}

export interface AudioBank {
  id: string;
  description: string;
  takes: Readonly<Record<string, BankTake>>;
}

export const BANK: AudioBank;
