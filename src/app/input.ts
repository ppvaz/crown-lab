
import type { Intent, Radians } from '../sim/types';
import { quantizeIntent } from '../sim/intent';

const SCREEN_DIRS = {
  up: { x: -1, y: -1 },
  down: { x: 1, y: 1 },
  left: { x: -1, y: 1 },
  right: { x: 1, y: -1 },
} as const;

export const screenVertical = (move: { x: number; y: number }): number =>
  (move.x * SCREEN_DIRS.down.x + move.y * SCREEN_DIRS.down.y) / 2;

export const screenHorizontal = (move: { x: number; y: number }): number =>
  (move.x * SCREEN_DIRS.right.x + move.y * SCREEN_DIRS.right.y) / 2;

export type BufferedAction = 'light' | 'heavy' | 'step' | 'focus' | 'power' | 'interact';
export type TouchHeldAction = 'guard' | 'power';

interface Buffered {
  remainingMs: number;
}

export type AimMode =
  | 'mouse'
  | 'movement'
  | 'auto_threat'
  | 'auto_nearest';

export const AIM_MODES: AimMode[] = ['mouse', 'movement', 'auto_threat', 'auto_nearest'];

export type AutoAimStrategy = 'threat' | 'nearest';

export const interactVerbFor = (device: InputDevice): string =>
  device === 'touch' ? 'ACT' : 'E';

export type InputDevice = 'keyboard' | 'touch';

export interface InputOpts {
  bufferMs: number;
}

export class InputSource {
  aimResolver: ((screenX: number, screenY: number) => Radians | null) | null = null;

  autoAimResolver: ((strategy: AutoAimStrategy) => Radians | null) | null = null;

  aimDistanceResolver: ((screenX: number, screenY: number) => number | null) | null = null;

  aimMode: AimMode = 'mouse';

  onDeviceChange: ((device: InputDevice) => void) | null = null;

  private device: InputDevice = 'keyboard';
  private readonly keys = new Set<string>();
  private readonly buffer = new Map<BufferedAction, Buffered>();
  private pointer: { x: number; y: number } | null = null;
  private readonly mouseHeld = new Set<number>();
  private touchMove = { x: 0, y: 0 };
  private touchGuardHeld = false;
  private touchPowerHeld = false;
  private guardWasHeld = false;
  private attached = false;

  constructor(
    private readonly target: HTMLElement,
    private readonly opts: InputOpts = { bufferMs: 120 },
  ) {}

  attach(): void {
    if (this.attached) return;
    this.attached = true;
    window.addEventListener('blur', this.onBlur);
    this.target.addEventListener('contextmenu', this.onContextMenu);
    this.wire(this.device);
  }

  detach(): void {
    if (!this.attached) return;
    this.attached = false;
    window.removeEventListener('blur', this.onBlur);
    this.target.removeEventListener('contextmenu', this.onContextMenu);
    this.unwire(this.device);
  }

  isHeld(code: string): boolean {
    return this.keys.has(code);
  }

  get activeDevice(): InputDevice {
    return this.device;
  }

  useDevice(device: InputDevice): void {
    if (this.device === device) return;
    if (this.attached) this.unwire(this.device);
    this.device = device;
    if (this.attached) this.wire(device);
    this.buffer.clear();
    if (device === 'touch') {
      this.keys.clear();
      this.mouseHeld.clear();
      this.pointer = null;
    } else {
      this.clearTouch();
    }
    this.onDeviceChange?.(device);
  }

  setTouchMove(screenX: number, screenY: number): void {
    const mag = Math.hypot(screenX, screenY);
    if (mag > 0) this.useDevice('touch');
    const scale = mag > 1 ? 1 / mag : 1;
    this.touchMove = { x: screenX * scale, y: screenY * scale };
  }

  pressTouch(action: BufferedAction): void {
    this.useDevice('touch');
    this.press(action);
  }

  setTouchHeld(action: TouchHeldAction, held: boolean): void {
    if (held) this.useDevice('touch');
    if (action === 'guard') this.touchGuardHeld = held;
    if (action === 'power') this.touchPowerHeld = held;
  }

  clearTouch(): void {
    this.touchMove = { x: 0, y: 0 };
    this.touchGuardHeld = false;
    this.touchPowerHeld = false;
  }

  update(dtMs: number): void {
    for (const [key, b] of this.buffer) {
      b.remainingMs -= dtMs;
      if (b.remainingMs <= 0) this.buffer.delete(key);
    }
  }

  sample(acceptsCommands = true): Intent {
    const move = { x: 0, y: 0 };
    const add = (d: { x: number; y: number }) => {
      move.x += d.x;
      move.y += d.y;
    };
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) add(SCREEN_DIRS.up);
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) add(SCREEN_DIRS.down);
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) add(SCREEN_DIRS.left);
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) add(SCREEN_DIRS.right);
    if (Math.abs(this.touchMove.x) > 0.08) {
      const d = this.touchMove.x > 0 ? SCREEN_DIRS.right : SCREEN_DIRS.left;
      move.x += d.x * Math.abs(this.touchMove.x);
      move.y += d.y * Math.abs(this.touchMove.x);
    }
    if (Math.abs(this.touchMove.y) > 0.08) {
      const d = this.touchMove.y > 0 ? SCREEN_DIRS.down : SCREEN_DIRS.up;
      move.x += d.x * Math.abs(this.touchMove.y);
      move.y += d.y * Math.abs(this.touchMove.y);
    }

    const mag = Math.hypot(move.x, move.y);
    const normalized = mag > 0 ? { x: move.x / mag, y: move.y / mag } : { x: 0, y: 0 };

    const guardHeld =
      this.keys.has('ShiftLeft') ||
      this.keys.has('ShiftRight') ||
      this.keys.has('KeyL') ||
      this.touchGuardHeld;
    const guardPressed = guardHeld && !this.guardWasHeld;
    this.guardWasHeld = guardHeld;

    let facing: Radians | null = null;
    if (this.aimMode === 'mouse' && this.pointer !== null && this.aimResolver !== null) {
      facing = this.aimResolver(this.pointer.x, this.pointer.y);
    } else if (this.aimMode !== 'movement' && this.autoAimResolver !== null) {
      facing = this.autoAimResolver(this.aimMode === 'auto_threat' ? 'threat' : 'nearest');
    }

    return quantizeIntent({
      move: normalized,
      facing,
      lightPressed: this.take('light', acceptsCommands),
      heavyPressed: this.take('heavy', acceptsCommands),
      guardHeld,
      guardPressed,
      stepPressed: this.take('step', acceptsCommands),
      focusPressed: this.take('focus', acceptsCommands),
      interactPressed: this.take('interact', acceptsCommands),
      powerPressed: this.take('power', acceptsCommands),
      powerHeld: this.keys.has('KeyQ') || this.mouseHeld.has(1) || this.touchPowerHeld,
      aimDistance:
        this.aimMode === 'mouse' && this.pointer !== null && this.aimDistanceResolver !== null
          ? this.aimDistanceResolver(this.pointer.x, this.pointer.y)
          : null,
    });
  }

  private wire(device: InputDevice): void {
    if (device === 'keyboard') {
      window.addEventListener('keydown', this.onKeyDown);
      window.addEventListener('keyup', this.onKeyUp);
      this.target.addEventListener('pointermove', this.onPointerMove);
      this.target.addEventListener('pointerdown', this.onPointerDown);
      this.target.addEventListener('pointerup', this.onPointerUp);
      return;
    }
    window.addEventListener('keydown', this.onKeyClaim);
  }

  private unwire(device: InputDevice): void {
    if (device === 'keyboard') {
      window.removeEventListener('keydown', this.onKeyDown);
      window.removeEventListener('keyup', this.onKeyUp);
      this.target.removeEventListener('pointermove', this.onPointerMove);
      this.target.removeEventListener('pointerdown', this.onPointerDown);
      this.target.removeEventListener('pointerup', this.onPointerUp);
      return;
    }
    window.removeEventListener('keydown', this.onKeyClaim);
  }

  private take(key: BufferedAction, acceptsCommands: boolean): boolean {
    if (!this.buffer.has(key)) return false;
    if (!acceptsCommands) return false;
    this.buffer.delete(key);
    return true;
  }

  private press(key: BufferedAction): void {
    this.buffer.set(key, { remainingMs: this.opts.bufferMs });
  }

  private readonly onKeyClaim = (): void => {
    this.useDevice('keyboard');
  };

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.repeat) {
      this.keys.add(e.code);
      return;
    }
    this.keys.add(e.code);
    if (e.code === 'KeyJ') this.press('light');
    if (e.code === 'KeyK') this.press('heavy');
    if (e.code === 'Space') {
      this.press('step');
      e.preventDefault();
    }
    if (e.code === 'KeyF') this.press('focus');
    if (e.code === 'KeyQ') this.press('power');
    if (e.code === 'KeyE') this.press('interact');
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private readonly onBlur = (): void => {
    this.keys.clear();
    this.mouseHeld.clear();
    this.buffer.clear();
    this.clearTouch();
    this.guardWasHeld = false;
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    if (e.pointerType !== 'mouse') return;
    const rect = this.target.getBoundingClientRect();
    this.pointer = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  private readonly onPointerDown = (e: PointerEvent): void => {
    if (e.pointerType !== 'mouse') {
      this.useDevice('touch');
      return;
    }
    this.useDevice('keyboard');
    this.mouseHeld.add(e.button);
    if (e.button === 0) this.press('light');
    if (e.button === 2) this.press('heavy');
    if (e.button === 1) this.press('power');
  };

  private readonly onPointerUp = (e: PointerEvent): void => {
    if (e.pointerType !== 'mouse') return;
    this.mouseHeld.delete(e.button);
  };

  private readonly onContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
  };
}
