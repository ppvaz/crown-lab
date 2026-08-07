export const REQUIRED_LAYERS: string[];
export const OPTIONAL_LAYERS: string[];

export interface RoomPackageProblem {
  code: string;
  message: string;
  severity: 'error' | 'warning';
}
export function validateRoomPackage(
  manifest: Record<string, any>,
  contract: Record<string, any>,
  found: Record<string, { width: number; height: number; colorType?: number; bytes: number } | null>,
): RoomPackageProblem[];
