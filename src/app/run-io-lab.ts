
import type { RunRecord } from '../lab/telemetry';
import { parseRunRecord, runPathFromSearch, runTickFromSearch } from '../lab/telemetry';

export const filePicker = (
  accept: string,
  onPick: (files: FileList) => void,
): HTMLInputElement => {
  const el = document.createElement('input');
  el.type = 'file';
  el.accept = accept;
  el.multiple = true;
  el.style.display = 'none';
  el.addEventListener('change', () => {
    if (el.files !== null && el.files.length > 0) onPick(el.files);
    el.value = '';
  });
  document.body.appendChild(el);
  return el;
};

export interface RunLoaderHost {
  notice(text: string): void;
  adoptRecord(record: RunRecord): void;
  startReplay(): void;
  seekReplay(tick: number): void;
  replaying(): boolean;
  replayStatus(): string;
}

export const createRunLoader = (host: RunLoaderHost) => {
  const openRunRecord = (text: string, source: string, atTick: number | null = null): boolean => {
    const parsed = parseRunRecord(text);
    if (!parsed.ok) {
      host.notice(`run not opened (${source}): ${parsed.reason}`);
      return false;
    }
    host.adoptRecord(parsed.record);
    const pilot = parsed.record.meta.pilot;
    let note = `opened ${pilot === undefined ? 'run' : `${pilot} pilot run`}: ${source}`;
    host.startReplay();
    if (!host.replaying()) note = `${note} — ${host.replayStatus()}`;
    host.notice(note);
    if (atTick !== null && host.replaying()) host.seekReplay(atTick);
    return host.replaying();
  };

  const picker = filePicker('application/json,.json', (files) => {
    const file = files[0];
    void file.text().then((text) => {
      openRunRecord(text, file.name);
    });
  });

  const openRunFromSearch = (search: string): void => {
    const path = runPathFromSearch(search);
    if (path === null) return;
    const atTick = runTickFromSearch(search);
    host.notice(`fetching run: ${path}`);
    void fetch(path)
      .then((res) => (res.ok ? res.text() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((text) => {
        openRunRecord(text, path, atTick);
      })
      .catch((err: unknown) => {
        host.notice(`run not opened (${path}): ${err instanceof Error ? err.message : 'fetch failed'}`);
      });
  };

  return { openRunFromSearch, pickRun: (): void => picker.click() };
};
