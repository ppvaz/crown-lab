
export function listArg(name: string, fallback: string[]): string[];
export function listArg(name: string, fallback: null): string[] | null;
export function listArg(name: string, fallback: undefined): string[] | undefined;

export function valueArg(name: string, fallback: string): string;
export function valueArg(name: string, fallback: undefined): string | undefined;

export function flag(name: string): boolean;
