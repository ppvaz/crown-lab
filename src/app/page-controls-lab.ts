
import { setIcon } from './icons';
import { PageControls, type PageControlsHost } from './page-controls';

export interface LabPageControlsHost extends PageControlsHost {
  encounters(): ReadonlyArray<{ id: string; description: string }>;
  currentEncounterId(): string;
  refuseWorldChange(): boolean;
  selectEncounter(id: string): void;
  mazePortalDirection(): 'up' | 'down';
  toggleMazePortal(): void;
  updatePanel(): void;
  applyViewMode(mode: 'game' | 'lab'): void;
  viewMode(): 'game' | 'lab';
  touchCapable: boolean;
  panelShown(): boolean;
}

export class LabPageControls extends PageControls {
  private readonly select: HTMLSelectElement | null;
  private readonly mazeButton: HTMLButtonElement | null;

  constructor(private readonly host: LabPageControlsHost) {
    super(host);
    const modeButton = document.getElementById('touch-view-mode');
    this.mazeButton = document.getElementById('maze-portal-steps') as HTMLButtonElement | null;
    this.select = document.getElementById('touch-encounter') as HTMLSelectElement | null;

    for (const element of [modeButton, this.select]) {
      if (element !== null) element.hidden = false;
    }
    if (this.select !== null) {
      const select = this.select;
      for (const encounter of host.encounters()) {
        const option = document.createElement('option');
        option.value = encounter.id;
        option.textContent = encounter.id.replaceAll('_', ' ');
        option.title = encounter.description;
        select.appendChild(option);
      }
      select.value = host.currentEncounterId();
      select.addEventListener('change', () => {
        select.blur();
        if (host.refuseWorldChange()) {
          select.value = host.currentEncounterId();
          return;
        }
        host.audioInit();
        host.selectEncounter(select.value);
      });
    }
    this.mazeButton?.addEventListener('click', () => {
      host.audioInit();
      host.toggleMazePortal();
      host.updatePanel();
    });
    this.syncMazePortal();

    const applyMode = (mode: 'game' | 'lab'): void => {
      host.applyViewMode(mode);
      const detailed = mode === 'lab';
      document.body.classList.toggle('touch-lab-mode', detailed);
      setIcon(
        modeButton,
        detailed ? 'lab' : 'game',
        detailed ? 'Leave lab mode' : 'Lab mode',
        detailed,
      );
      host.resize();
    };
    modeButton?.addEventListener('click', () => {
      host.audioInit();
      applyMode(host.viewMode() === 'game' ? 'lab' : 'game');
    });

    if (host.touchCapable) {
      applyMode('game');
    } else {
      setIcon(
        modeButton,
        host.panelShown() ? 'lab' : 'game',
        host.panelShown() ? 'Leave lab mode' : 'Lab mode',
        host.panelShown(),
      );
    }
  }

  showEncounter(id: string): void {
    if (this.select !== null) this.select.value = id;
  }

  syncMazePortal(): void {
    if (this.mazeButton === null) return;
    this.mazeButton.hidden = this.host.currentEncounterId() !== 'maze_serpentine';
    const descends = this.host.mazePortalDirection() === 'down';
    this.mazeButton.setAttribute('aria-pressed', String(descends));
    this.mazeButton.title = `Portal stairs: ${descends ? 'down' : 'up'}`;
    this.mazeButton.setAttribute(
      'aria-label',
      `Portal stairs: ${descends ? 'down' : 'up'}; toggle direction`,
    );
    const glyph = this.mazeButton.querySelector('.portal-direction');
    if (glyph !== null) glyph.textContent = descends ? '↓' : '↑';
  }
}
