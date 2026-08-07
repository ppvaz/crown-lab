
import {
  approximateSize,
  dataModeFromSearch,
  readStoredMode,
  setDataMode,
  storeMode,
  type DataMode,
} from './data-saver';

const boot = async (): Promise<void> => {
  if (__CROWN_LAB__) {
    await import('./lab');
  } else {
    await import('./game');
  }
};

const begin = (choice: DataMode, gate: HTMLElement | null): void => {
  setDataMode(choice);
  storeMode(choice);
  gate?.remove();
  void boot();
};

const gate = document.getElementById('gate');
const remembered = dataModeFromSearch(location.search) ?? readStoredMode();

if (gate === null || remembered !== null) {

  setDataMode(remembered ?? 'full');
  gate?.remove();
  await boot();
} else {
  const start = document.getElementById('gate-start');
  const full = document.getElementById('gate-full');
  if (start !== null) start.textContent = approximateSize(__CROWN_ASSET_BYTES__.blocking);
  if (full !== null) full.textContent = approximateSize(__CROWN_ASSET_BYTES__.total);
  gate.hidden = false;
  document.getElementById('gate-play')?.addEventListener('click', () => begin('full', gate));
  document.getElementById('gate-saver')?.addEventListener('click', () => begin('saver', gate));
}

export {};
