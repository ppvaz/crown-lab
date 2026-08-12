
const STORAGE_KEY = 'crown-lab.selections.v1';

export interface StoredSelections {
  combatId?: string;
  slowMoId?: string;
  encounterId?: string;
  presentationId?: string;
  materialPack?: string;
  modelBank?: string;
  seed?: number;
  aimMode?: string;
  rendererId?: string;
}

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

const seedOf = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isInteger(v) && v >= 1 ? v : undefined;

export const loadSelections = (): StoredSelections | null => {
  let raw: string | null;
  try {
    raw = sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;

  const p = parsed as Record<string, unknown>;
  const out: StoredSelections = {
    combatId: str(p.combatId),
    slowMoId: str(p.slowMoId),
    encounterId: str(p.encounterId),
    presentationId: str(p.presentationId),
    materialPack: str(p.materialPack),
    modelBank: str(p.modelBank),
    seed: seedOf(p.seed),
    aimMode: str(p.aimMode),
    rendererId: str(p.rendererId),
  };

  return Object.values(out).some((v) => v !== undefined) ? out : null;
};

export const saveSelections = (s: StoredSelections): void => {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
  }
};

export const indexOfId = (ids: readonly string[], id: string | undefined, fallback: number): number => {
  if (id === undefined) return fallback;
  const i = ids.indexOf(id);
  return i >= 0 ? i : fallback;
};

export const clearSelections = (): void => {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
  }
};
