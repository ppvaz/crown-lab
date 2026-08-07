
import { clearSelections, indexOfId, loadSelections, saveSelections } from '../src/app/prefs';

const KEY = 'crown-lab.selections.v1';

const makeStorage = () => {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
};

let storage: ReturnType<typeof makeStorage>;

beforeEach(() => {
  storage = makeStorage();
  (globalThis as unknown as Record<string, unknown>).sessionStorage = storage;
});

describe('a round trip', () => {
  it('restores what it stored', () => {
    saveSelections({ combatId: 'Parry_Strict', seed: 7, aimMode: 'movement' });

    expect(loadSelections()).toMatchObject({
      combatId: 'Parry_Strict',
      seed: 7,
      aimMode: 'movement',
    });
  });

  it('reports nothing to restore when the slot is empty', () => {
    expect(loadSelections()).toBeNull();
  });

  it('forgets the blob on clear', () => {
    saveSelections({ combatId: 'Parry_Strict' });
    clearSelections();

    expect(loadSelections()).toBeNull();
    expect(storage.map.has(KEY)).toBe(false);
  });
});

describe('it does not trust what it reads', () => {
  it('ignores a blob that is not JSON', () => {
    storage.map.set(KEY, '{not json');

    expect(loadSelections()).toBeNull();
  });

  it('ignores a blob that is not an object', () => {
    storage.map.set(KEY, '"Parry_Strict"');

    expect(loadSelections()).toBeNull();
  });

  it('ignores null, which is technically typeof object', () => {
    storage.map.set(KEY, 'null');

    expect(loadSelections()).toBeNull();
  });

  it('drops fields of the wrong type rather than passing them through', () => {
    storage.map.set(KEY, JSON.stringify({ combatId: 42, encounterId: 'kernel_guard' }));

    const out = loadSelections();
    expect(out).not.toBeNull();
    expect(out!.combatId).toBeUndefined();
    expect(out!.encounterId).toBe('kernel_guard');
  });

  it('rejects a seed that is not a positive integer', () => {
    for (const bad of [0, -3, 1.5, Number.NaN, '7', null]) {
      storage.map.set(KEY, JSON.stringify({ combatId: 'Default', seed: bad }));
      expect(loadSelections()!.seed).toBeUndefined();
    }
  });

  it('treats a blob whose every field failed validation as nothing to restore', () => {
    storage.map.set(KEY, JSON.stringify({ combatId: 1, seed: 'x', nonsense: true }));

    expect(loadSelections()).toBeNull();
  });

  it('ignores a blob stored under a different version key', () => {
    storage.map.set('crown-lab.selections.v0', JSON.stringify({ combatId: 'Parry_Strict' }));

    expect(loadSelections()).toBeNull();
  });
});

describe('ids resolve to positions, and never to a neighbour', () => {
  const PRESETS = ['Default', 'Parry_Strict', 'Parry_Generous'];

  it('finds a stored id', () => {
    expect(indexOfId(PRESETS, 'Parry_Generous', 0)).toBe(2);
  });

  it('falls back to the default when the id is gone', () => {
    expect(indexOfId(PRESETS, 'Parry_Lenient_Removed', 0)).toBe(0);
  });

  it('falls back when nothing was stored for that dial', () => {
    expect(indexOfId(PRESETS, undefined, 1)).toBe(1);
  });

  it('is unaffected by the list being reordered, unlike an index would be', () => {
    const reordered = ['Parry_Generous', 'Default', 'Parry_Strict'];

    expect(PRESETS[indexOfId(PRESETS, 'Parry_Strict', 0)]).toBe('Parry_Strict');
    expect(reordered[indexOfId(reordered, 'Parry_Strict', 0)]).toBe('Parry_Strict');
  });
});

describe('a host without storage is still a working lab', () => {
  it('reports nothing to restore rather than throwing', () => {
    delete (globalThis as unknown as Record<string, unknown>).sessionStorage;

    expect(() => loadSelections()).not.toThrow();
    expect(loadSelections()).toBeNull();
  });

  it('swallows a failed write', () => {
    (globalThis as unknown as Record<string, unknown>).sessionStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {},
    };

    expect(() => saveSelections({ combatId: 'Default' })).not.toThrow();
  });
});
