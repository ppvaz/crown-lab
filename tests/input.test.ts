import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { InputDevice } from '../src/app/input';
import { InputSource } from '../src/app/input';

const makeInput = () => new InputSource({} as HTMLElement, { bufferMs: 120 });

const makeHarness = () => {
  const listeners = new Map<string, Array<(e: unknown) => void>>();
  const add = (type: string, fn: (e: unknown) => void): void => {
    listeners.set(type, [...(listeners.get(type) ?? []), fn]);
  };
  const remove = (type: string, fn: (e: unknown) => void): void => {
    listeners.set(type, (listeners.get(type) ?? []).filter((each) => each !== fn));
  };
  (globalThis as unknown as Record<string, unknown>).window = {
    addEventListener: add,
    removeEventListener: remove,
  };
  const target = {
    addEventListener: add,
    removeEventListener: remove,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
  } as unknown as HTMLElement;

  const input = new InputSource(target, { bufferMs: 120 });
  const devices: InputDevice[] = [];
  input.onDeviceChange = (device) => devices.push(device);
  input.attach();

  const fire = (type: string, event: Record<string, unknown>): void => {
    for (const fn of [...(listeners.get(type) ?? [])]) fn(event);
  };
  const bound = (type: string): number => (listeners.get(type) ?? []).length;
  return { input, devices, fire, bound };
};

const keyDown = (code: string) => ({ code, repeat: false, preventDefault: () => {} });

describe('touch input', () => {
  it('maps a screen-right stick gesture into the isometric world direction', () => {
    const input = makeInput();
    input.setTouchMove(1, 0);

    expect(input.sample().move.x).toBeCloseTo(Math.SQRT1_2);
    expect(input.sample().move.y).toBeCloseTo(-Math.SQRT1_2);

    input.setTouchMove(0, 0);
    expect(input.sample().move).toEqual({ x: 0, y: 0 });
  });

  it('preserves guard edges while the touch button is held', () => {
    const input = makeInput();
    input.setTouchHeld('guard', true);

    expect(input.sample()).toMatchObject({ guardHeld: true, guardPressed: true });
    expect(input.sample()).toMatchObject({ guardHeld: true, guardPressed: false });

    input.setTouchHeld('guard', false);
    expect(input.sample()).toMatchObject({ guardHeld: false, guardPressed: false });
  });

  it('buffers a touch action and supports held powers', () => {
    const input = makeInput();
    input.pressTouch('power');
    input.setTouchHeld('power', true);

    expect(input.sample()).toMatchObject({ powerPressed: true, powerHeld: true });
    expect(input.sample()).toMatchObject({ powerPressed: false, powerHeld: true });

    input.setTouchHeld('power', false);
    expect(input.sample()).toMatchObject({ powerPressed: false, powerHeld: false });
  });
});

describe('one device at a time', () => {
  it('keeps K bound exclusively to the heavy attack', () => {
    const { input, fire } = makeHarness();

    fire('keydown', keyDown('KeyK'));

    expect(input.sample()).toMatchObject({
      lightPressed: false,
      heavyPressed: true,
    });

    const labSource = readFileSync(
      new URL('../src/app/lab.ts', import.meta.url),
      'utf8',
    );
    expect(labSource).not.toMatch(/case 'Key[JKL]'/);
  });

  it('listens for nothing on the canvas while the pad is live', () => {
    const { input, fire, bound } = makeHarness();
    input.useDevice('touch');

    expect(bound('pointerdown')).toBe(0);
    expect(bound('pointermove')).toBe(0);
    expect(bound('pointerup')).toBe(0);
    expect(bound('mousedown')).toBe(0);

    fire('pointerdown', { pointerType: 'mouse', button: 0, clientX: 400, clientY: 300 });
    fire('mousedown', { button: 0, clientX: 400, clientY: 300 });

    expect(input.sample().lightPressed).toBe(false);
    expect(input.activeDevice).toBe('touch');
  });

  it('leaves the keyboard wired only to hand the run back', () => {
    const { input, fire } = makeHarness();
    input.useDevice('touch');

    fire('keydown', keyDown('KeyJ'));
    expect(input.activeDevice).toBe('keyboard');
    expect(input.sample().lightPressed).toBe(false);

    fire('keydown', keyDown('KeyJ'));
    expect(input.sample().lightPressed).toBe(true);
  });

  it('still attacks on a real mouse click', () => {
    const { input, fire } = makeHarness();

    fire('pointerdown', { pointerType: 'mouse', button: 0, clientX: 400, clientY: 300 });

    expect(input.sample().lightPressed).toBe(true);
    expect(input.activeDevice).toBe('keyboard');
  });

  it('hands the run back to the pad when a finger touches the canvas', () => {
    const { input, fire, bound } = makeHarness();

    fire('pointerdown', { pointerType: 'touch', button: 0, clientX: 400, clientY: 300 });

    expect(input.activeDevice).toBe('touch');
    expect(input.sample().lightPressed).toBe(false);
    expect(bound('pointerdown')).toBe(0);
  });

  it('drops the stick when the keyboard takes over', () => {
    const { input, devices, fire } = makeHarness();
    input.setTouchMove(1, 0);
    input.setTouchHeld('guard', true);
    expect(input.activeDevice).toBe('touch');

    fire('keydown', keyDown('KeyW'));
    fire('keydown', keyDown('KeyW'));

    const intent = input.sample();
    expect(intent.guardHeld).toBe(false);
    expect(intent.move.x).toBeCloseTo(-Math.SQRT1_2);
    expect(intent.move.y).toBeCloseTo(-Math.SQRT1_2);
    expect(devices).toEqual(['touch', 'keyboard']);
  });

  it('drops held keys and buffered presses when the stick takes over', () => {
    const { input, fire } = makeHarness();
    fire('keydown', keyDown('KeyW'));
    fire('keydown', keyDown('KeyJ'));

    input.setTouchMove(1, 0);

    const intent = input.sample();
    expect(intent.lightPressed).toBe(false);
    expect(intent.move.x).toBeCloseTo(Math.SQRT1_2);
    expect(intent.move.y).toBeCloseTo(-Math.SQRT1_2);
    expect(input.isHeld('KeyW')).toBe(false);
  });

  it('does not let a released stick take the run back from the keyboard', () => {
    const { input, devices, fire } = makeHarness();
    input.setTouchMove(1, 0);
    fire('keydown', keyDown('KeyW'));

    input.setTouchMove(0, 0);

    expect(input.activeDevice).toBe('keyboard');
    expect(devices).toEqual(['touch', 'keyboard']);
  });
});
