
export type HeavyGroupId = 'music' | 'meshes';

let saver: boolean | null = null;

const savingData = (): boolean => {
  if (saver === null) {
    saver =
      typeof document !== 'undefined' && document.documentElement.dataset.dataMode === 'saver';
  }
  return saver;
};

export interface HeavyGroupState {
  allowed: boolean;
  loading: boolean;
}

const groups: Record<HeavyGroupId, HeavyGroupState> = {
  music: { allowed: false, loading: false },
  meshes: { allowed: false, loading: false },
};

export const heavyGroup = (id: HeavyGroupId): HeavyGroupState => groups[id];

export const heavyAllowed = (id: HeavyGroupId): boolean => !savingData() || groups[id].allowed;

export const allowHeavy = (id: HeavyGroupId): void => {
  groups[id].allowed = true;
};

export const setHeavyLoading = (id: HeavyGroupId, loading: boolean): void => {
  groups[id].loading = loading;
};

export const heavyLoading = (): boolean =>
  (Object.keys(groups) as HeavyGroupId[]).some((id) => groups[id].loading);

export const musicDownloadAllowed = (): boolean => heavyAllowed('music');
export const meshDownloadAllowed = (): boolean => heavyAllowed('meshes');
