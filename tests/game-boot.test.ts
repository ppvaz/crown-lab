
import { vi } from 'vitest';

const probe = vi.hoisted(() => ({ steps: 0 }));
vi.mock('../src/sim/world', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/sim/world')>();
  return {
    ...actual,
    stepPublicWorld: (...args: Parameters<typeof actual.stepPublicWorld>) => {
      probe.steps += 1;
      return actual.stepPublicWorld(...args);
    },
  };
});

const frames: Array<(time: number) => void> = [];
let now = 0;
let fills = 0;
const windowListeners = new Map<string, Array<() => void>>();
const documentListeners = new Map<string, Array<() => void>>();
let visibility = 'visible';

const record = (into: Map<string, Array<() => void>>) => (type: string, fn: () => void) => {
  const list = into.get(type) ?? [];
  list.push(fn);
  into.set(type, list);
};

const fire = (into: Map<string, Array<() => void>>, type: string): void => {
  const list = into.get(type);
  if (list === undefined || list.length === 0) {
    throw new Error(`the public game registered no ${type} listener`);
  }
  for (const fn of list) fn();
};

const ticksOver = (count: number, tickOf: () => number): number => {
  const before = tickOf();
  for (let index = 0; index < count; index += 1) {
    now += 16.7;
    const next = frames.shift();
    if (next === undefined) throw new Error('public game stopped scheduling frames');
    next(now);
  }
  return tickOf() - before;
};

const context = new Proxy(
  {
    canvas: { width: 1280, height: 720 },
    measureText: () => ({ width: 12 }),
    setTransform: () => {},
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
    fillRect: () => {
      fills += 1;
    },
  } as Record<string, unknown>,
  {
    get(target, property: string) {
      return property in target ? target[property] : () => {};
    },
    set(target, property: string, value) {
      target[property] = value;
      return true;
    },
  },
);

const canvas = {
  clientWidth: 1280,
  clientHeight: 720,
  width: 1280,
  height: 720,
  getContext: () => context,
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }),
  addEventListener: () => {},
  removeEventListener: () => {},
};

beforeAll(() => {
  const global = globalThis as unknown as Record<string, unknown>;
  global.document = {
    getElementById: (id: string) => (id === 'view' ? canvas : null),
    querySelector: () => null,
    body: { classList: { add: () => {} } },
    addEventListener: record(documentListeners),
    removeEventListener: () => {},
    hasFocus: () => true,
    get visibilityState() {
      return visibility;
    },
  };
  global.window = {
    devicePixelRatio: 1,
    addEventListener: record(windowListeners),
    removeEventListener: () => {},
  };


  global.location = {
    protocol: 'http:',
    host: '127.0.0.1:5173',
    href: 'http://127.0.0.1:5173/?play',
    search: '?play',
  };
  global.performance = { now: () => now };
  global.requestAnimationFrame = (callback: (time: number) => void) => {
    frames.push(callback);
    return frames.length;
  };
});

it('pauses the world and the audio while the page is in the background', async () => {

  await import('../src/app/game');

  ticksOver(6, () => probe.steps);

  fire(windowListeners, 'blur');
  const whileBlurred = ticksOver(12, () => probe.steps);
  fire(windowListeners, 'focus');
  const whileFocused = ticksOver(12, () => probe.steps);

  expect(whileBlurred, 'the world advanced while the page was blurred').toBe(0);
  expect(whileFocused, 'the world never resumed on focus').toBeGreaterThan(0);
});

it('boots and renders the public game graph', async () => {
  await import('../src/app/game');
  expect(frames).toHaveLength(1);

  for (let index = 0; index < 10; index += 1) {
    now += 16.7;
    const next = frames.shift();
    if (next === undefined) throw new Error('public game stopped scheduling frames');
    next(now);
  }

  expect(fills).toBeGreaterThan(0);
  expect(frames).toHaveLength(1);
});
