
import type { BufferedAction, TouchHeldAction } from './input';
import { InputSource } from './input';

const releaseEvents = ['pointerup', 'pointercancel', 'lostpointercapture'] as const;

export class TouchControls {
  private stickPointer: number | null = null;
  private actionButtons: HTMLElement[] = [];
  private availableKey = '';

  constructor(
    private readonly root: HTMLElement,
    private readonly input: InputSource,
    private readonly onGesture: () => void,
  ) {}

  attach(): void {
    const pad = this.root.querySelector<HTMLElement>('[data-touch-stick]');
    const knob = this.root.querySelector<HTMLElement>('[data-touch-knob]');
    if (pad !== null && knob !== null) this.attachStick(pad, knob);

    this.actionButtons = [
      ...this.root.querySelectorAll<HTMLElement>('[data-touch-action]'),
    ];
    for (const button of this.actionButtons) {
      this.attachButton(button);
    }
  }

  releaseAll(): void {
    this.stickPointer = null;
    const knob = this.root.querySelector<HTMLElement>('[data-touch-knob]');
    if (knob !== null) knob.style.transform = 'translate(0, 0)';
    for (const button of this.actionButtons) {
      button.classList.remove('is-held');
    }
  }

  setAvailable(actions: ReadonlySet<string>): void {
    const key = [...actions].sort().join('|');
    if (key === this.availableKey) return;
    this.availableKey = key;
    for (const button of this.actionButtons) {
      const action = button.dataset.touchAction;
      button.hidden = action === undefined || !actions.has(action);
      if (button.hidden) button.classList.remove('is-held');
    }
  }

  private attachStick(pad: HTMLElement, knob: HTMLElement): void {
    const move = (e: PointerEvent): void => {
      if (e.pointerId !== this.stickPointer) return;
      const rect = pad.getBoundingClientRect();
      const radius = Math.max(1, Math.min(rect.width, rect.height) / 2);
      let x = (e.clientX - (rect.left + rect.width / 2)) / radius;
      let y = (e.clientY - (rect.top + rect.height / 2)) / radius;
      const mag = Math.hypot(x, y);
      if (mag > 1) {
        x /= mag;
        y /= mag;
      }
      this.input.setTouchMove(x, y);
      knob.style.transform = `translate(${x * radius * 0.48}px, ${y * radius * 0.48}px)`;
      e.preventDefault();
    };

    const release = (e: PointerEvent): void => {
      if (e.pointerId !== this.stickPointer) return;
      this.stickPointer = null;
      this.input.setTouchMove(0, 0);
      knob.style.transform = 'translate(0, 0)';
      e.preventDefault();
    };

    pad.addEventListener('pointerdown', (e) => {
      this.onGesture();
      this.stickPointer = e.pointerId;
      pad.setPointerCapture(e.pointerId);
      move(e);
    });
    pad.addEventListener('pointermove', move);
    for (const event of releaseEvents) pad.addEventListener(event, release);
  }

  private attachButton(button: HTMLElement): void {
    const action = button.dataset.touchAction;
    if (action === undefined) return;

    const press = (e: PointerEvent): void => {
      this.onGesture();
      button.setPointerCapture(e.pointerId);
      button.classList.add('is-held');

      if (action === 'guard' || action === 'power') {
        this.input.setTouchHeld(action as TouchHeldAction, true);
      }
      if (action !== 'guard') this.input.pressTouch(action as BufferedAction);
      e.preventDefault();
    };

    const release = (e: PointerEvent): void => {
      button.classList.remove('is-held');
      if (action === 'guard' || action === 'power') {
        this.input.setTouchHeld(action as TouchHeldAction, false);
      }
      e.preventDefault();
    };

    button.addEventListener('pointerdown', press);
    for (const event of releaseEvents) button.addEventListener(event, release);
  }
}
