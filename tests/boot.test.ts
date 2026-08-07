
const rafCallbacks: Array<(t: number) => void> = [];
const listeners = new Map<string, Array<(e: unknown) => void>>();

let clockMs = 0;

const makeCtx = () => {
  const canvasEl = { width: 1280, height: 720 };
  const target: Record<string, unknown> = {
    canvas: canvasEl,
    measureText: () => ({ width: 12 }),
    setTransform: () => {},
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
  };
  return new Proxy(target, {
    get(obj, prop: string) {
      if (prop in obj) return obj[prop];
      return () => {};
    },
    set(obj, prop: string, value) {
      obj[prop] = value;
      return true;
    },
  });
};

const makeElement = (id: string) => ({
  id,
  hidden: false,
  textContent: '',
  clientWidth: 1280,
  clientHeight: 720,
  width: 1280,
  height: 720,
  type: '',
  accept: '',
  multiple: false,
  value: '',
  files: null,
  style: {} as Record<string, string>,
  getContext: () => makeCtx(),
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }),
  addEventListener: () => {},
  removeEventListener: () => {},
  click: () => {},
  remove: () => {},
  appendChild: () => {},
  querySelector: () => null,
  setAttribute: () => {},
  getAttribute: () => null,
});

const canvasEl = makeElement('view');
const panelEl = makeElement('panel');

beforeAll(() => {
  const g = globalThis as unknown as Record<string, unknown>;

  g.document = {
    getElementById: (id: string) => (id === 'view' ? canvasEl : panelEl),
    querySelector: () => null,
    createElement: (tag: string) => makeElement(tag),
    body: { appendChild: () => {}, classList: { toggle: () => {}, add: () => {} } },
    documentElement: { dataset: {} },
  };

  g.window = {
    devicePixelRatio: 1,
    addEventListener: (type: string, fn: (e: unknown) => void) => {
      const list = listeners.get(type) ?? [];
      list.push(fn);
      listeners.set(type, list);
    },
    removeEventListener: () => {},
  };

  g.location = { search: '?lab' };



  const stored = new Map<string, string>([['crown.data-mode', 'full']]);
  g.localStorage = {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
  };

  g.performance = { now: () => clockMs };
  g.requestAnimationFrame = (fn: (t: number) => void) => {
    rafCallbacks.push(fn);
    return rafCallbacks.length;
  };
});

const frame = (dtMs: number): void => {
  clockMs += dtMs;
  const next = rafCallbacks.shift();
  if (next === undefined) throw new Error('no animation frame was scheduled');
  next(clockMs);
};

const fire = (type: string): void => {
  for (const fn of listeners.get(type) ?? []) fn({});
};

const tickFromPanel = (): number =>
  Number(/tick\s+(\d+)/.exec(String(panelEl.textContent))?.[1] ?? 0);

describe('boot', () => {
  it('starts, runs frames, and advances the simulation', async () => {
    await import('../src/app/main');

    expect(rafCallbacks.length).toBe(1);

    for (let i = 0; i < 60; i++) frame(16.7);

    const text = String(panelEl.textContent);
    expect(text).toContain('CROWN LAB');

    const tick = Number(/tick\s+(\d+)/.exec(text)?.[1] ?? 0);
    expect(tick).toBeGreaterThan(100);
    expect(tick).toBeLessThan(140);
  }, 30_000);

  it('reports the mastery readout before any run has completed', () => {
    expect(String(panelEl.textContent)).toContain('mastery     (no completed runs yet)');
  });

  it('survives a frame gap without simulating the whole absence', () => {
    frame(150);
    const before = tickFromPanel();

    frame(9000);

    const advanced = tickFromPanel() - before;
    expect(advanced).toBeGreaterThanOrEqual(29);
    expect(advanced).toBeLessThanOrEqual(30);
  });

  it('stops simulating while the window is out of focus', () => {
    frame(150);
    const before = tickFromPanel();

    fire('blur');
    for (let i = 0; i < 12; i++) frame(16.7);
    expect(tickFromPanel()).toBe(before);

    fire('focus');
    for (let i = 0; i < 12; i++) frame(16.7);
    expect(tickFromPanel()).toBeGreaterThan(before);
  });
});
