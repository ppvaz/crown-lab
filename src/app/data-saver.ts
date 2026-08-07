

export type DataMode = 'full' | 'saver';

const KEY = 'crown.data-mode';

let mode: DataMode = 'full';

export const dataSaver = (): boolean => mode === 'saver';

export const dataMode = (): DataMode => mode;

export const setDataMode = (next: DataMode): void => {
  mode = next;
  if (typeof document !== 'undefined') document.documentElement.dataset.dataMode = next;
};

export const dataModeFromSearch = (search: string): DataMode | null => {
  const raw = new URLSearchParams(search).get('data')?.trim().toLowerCase();
  return raw === 'full' || raw === 'saver' ? raw : null;
};

export const readStoredMode = (): DataMode | null => {
  try {
    const raw = localStorage.getItem(KEY);
    return raw === 'saver' || raw === 'full' ? raw : null;
  } catch {
    return null;
  }
};

export const storeMode = (next: DataMode): void => {
  try {
    localStorage.setItem(KEY, next);
  } catch {
  }
};

export const approximateSize = (bytes: number): string => {
  const mb = bytes / 1_000_000;
  if (mb >= 10) return `${Math.round(mb)} MB`;
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1000))} KB`;
};
