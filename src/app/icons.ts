
export type IconName =
  | 'restart'
  | 'pause'
  | 'play'
  | 'fullscreen'
  | 'fullscreen-exit'
  | 'lab'
  | 'game';

export const setIcon = (
  button: HTMLElement | null,
  icon: IconName,
  label: string,
  pressed?: boolean,
): void => {
  if (button === null) return;
  button.querySelector('use')?.setAttribute('href', `#i-${icon}`);
  button.setAttribute('aria-label', label);
  button.setAttribute('title', label);
  if (pressed !== undefined) button.setAttribute('aria-pressed', String(pressed));
};

