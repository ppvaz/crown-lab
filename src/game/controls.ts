
import type { ControlCopy, Locale } from './copy';
import { copyFor } from './copy';

export type ControlDevice = 'touch' | 'pointer';
export type ControlNames = ControlCopy;

export const controlNamesFor = (device: ControlDevice, locale: Locale = 'en'): ControlNames =>
  copyFor(locale).controls[device];

export const retryHintFor = (device: ControlDevice, locale: Locale = 'en'): string => {
  const copy = copyFor(locale);
  return copy.hud.retry(copy.controls[device].restart);
};
