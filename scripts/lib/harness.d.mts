
import type { Browser } from 'playwright-core';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';

export const DEFAULT_ATTEMPTS: number;

export interface ServerState {
  exited: boolean;
  stderr: string;
}

export function startViteServer(options: {
  port: number;
  mode?: string;
  host?: string;
}): { proc: ChildProcessWithoutNullStreams; state: ServerState };

export function waitForServer(url: string, state: ServerState, attempts?: number): Promise<void>;

export function launchChrome(): Promise<Browser>;
