
import VOCABULARY_JSON from '../lab/rooms/vocabulary.json';
import FIRST_ROOM from '../lab/rooms/kernel-guard.json';

const VOCABULARY = VOCABULARY_JSON as unknown as RoomVocabulary;
import type { EncounterDef } from '../sim/types';
import {
  moveSpawn,
  movePlayerStart,
  openDocument,
  openRoom,
  type RoomVocabulary,
  selectEncounter,
  selectedEncounter,
  serialize,
  serializeRoom,
  setSpawnArchetype,
  setWaveAtMs,
} from './editor-state';
import type { EditorState } from './editor-state';

const ARCHETYPES = [
  'guard',
  'duelist',
  'archer',
  'first_blade',
  'captain',
  'captain_read',
  'rain_boss',
  'chancellor',
  'elite_guard',
  'pike_novice',
  'pike_boss',
  'thorn_marshal',
  'queen',
] as const;

const ARCHETYPE_TINT: Record<string, string> = {
  guard: '#7fa8d8',
  duelist: '#d8a87f',
  archer: '#9fd87f',
  first_blade: '#e8cf94',
  captain: '#d87f7f',
  captain_read: '#d87fb8',
  rain_boss: '#8f7fd8',
  chancellor: '#b8b8d8',
  elite_guard: '#7fd8c8',
  pike_novice: '#7fd8f0',
  pike_boss: '#a8b0b8',
  thorn_marshal: '#b8c87f',
  queen: '#e08fa8',
};

const canvas = document.getElementById('floor') as HTMLCanvasElement;
const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
const panelEncounter = document.getElementById('encounter') as HTMLSelectElement;
const panelWaves = document.getElementById('waves') as HTMLDivElement;
const panelError = document.getElementById('error') as HTMLDivElement;
const panelDirty = document.getElementById('dirty') as HTMLSpanElement;
const buttonOpen = document.getElementById('open') as HTMLButtonElement;
const buttonDownload = document.getElementById('download') as HTMLButtonElement;
const filePicker = document.getElementById('file') as HTMLInputElement;

let state: EditorState = openRoom(`${JSON.stringify(FIRST_ROOM, null, 2)}\n`, VOCABULARY);

interface Fit {
  scale: number;
  cx: number;
  cy: number;
}

const currentDef = (): EncounterDef | null =>
  state.parsed?.encounters[state.selectedId ?? ''] ?? null;

const fitFor = (def: EncounterDef): Fit => {
  const pad = 40;
  const { x, y } = def.arena.halfExtents;
  const scale = Math.min(
    (canvas.clientWidth - pad * 2) / (x * 2),
    (canvas.clientHeight - pad * 2) / (y * 2),
  );
  return { scale, cx: canvas.clientWidth / 2, cy: canvas.clientHeight / 2 };
};

const toCanvas = (fit: Fit, p: { x: number; y: number }): { x: number; y: number } => ({
  x: fit.cx + p.x * fit.scale,
  y: fit.cy + p.y * fit.scale,
});

const toWorld = (fit: Fit, p: { x: number; y: number }): { x: number; y: number } => ({
  x: (p.x - fit.cx) / fit.scale,
  y: (p.y - fit.cy) / fit.scale,
});

const polygon = (fit: Fit, points: readonly { x: number; y: number }[]): void => {
  ctx.beginPath();
  points.forEach((p, i) => {
    const c = toCanvas(fit, p);
    if (i === 0) ctx.moveTo(c.x, c.y);
    else ctx.lineTo(c.x, c.y);
  });
  ctx.closePath();
};

const drawFloor = (): void => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const def = currentDef();
  if (def === null) {
    ctx.fillStyle = '#8a8798';
    ctx.font = '14px ui-monospace';
    ctx.fillText(
      state.error === null ? 'no encounter selected' : 'document invalid — see panel',
      24,
      36,
    );
    return;
  }
  const fit = fitFor(def);
  const arena = def.arena;

  for (const region of arena.regions ?? []) {
    polygon(fit, region);
    ctx.fillStyle = 'rgba(120, 130, 170, 0.08)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(120, 130, 170, 0.25)';
    ctx.stroke();
  }
  const boundary =
    arena.outline ??
    arena.vertices ?? [
      { x: -arena.halfExtents.x, y: -arena.halfExtents.y },
      { x: arena.halfExtents.x, y: -arena.halfExtents.y },
      { x: arena.halfExtents.x, y: arena.halfExtents.y },
      { x: -arena.halfExtents.x, y: arena.halfExtents.y },
    ];
  polygon(fit, boundary);
  ctx.strokeStyle = '#d8d4c8';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  for (const obstacle of arena.obstacles ?? []) {
    const c = toCanvas(fit, obstacle.at);
    ctx.beginPath();
    ctx.arc(c.x, c.y, obstacle.radius * fit.scale, 0, Math.PI * 2);
    ctx.strokeStyle = '#8a8798';
    ctx.stroke();
  }
  for (const gate of arena.gates ?? []) {
    const from = toCanvas(fit, gate.from);
    const to = toCanvas(fit, gate.to);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.strokeStyle = '#d8a87f';
    ctx.setLineDash([5, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  def.waves.forEach((wave, waveIndex) => {
    wave.spawns.forEach((spawn, spawnIndex) => {
      const c = toCanvas(fit, spawn.at);
      ctx.beginPath();
      ctx.arc(c.x, c.y, 7, 0, Math.PI * 2);
      ctx.fillStyle = ARCHETYPE_TINT[spawn.archetype] ?? '#ffffff';
      ctx.fill();
      ctx.fillStyle = '#14141a';
      ctx.font = 'bold 9px ui-monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(waveIndex + 1), c.x, c.y);
    });
  });

  const start = toCanvas(fit, def.playerStart);
  ctx.beginPath();
  ctx.arc(start.x, start.y, 9, 0, Math.PI * 2);
  ctx.strokeStyle = '#e8cf94';
  ctx.lineWidth = 2.5;
  ctx.stroke();
};

const renderPanel = (): void => {
  panelError.textContent = state.error ?? '';
  panelDirty.textContent = state.dirty ? 'edited — download to keep' : '';

  panelEncounter.replaceChildren(
    ...state.doc.encounters.map((entry) => {
      const option = document.createElement('option');
      option.value = entry.id;
      option.textContent = entry.id;
      option.selected = entry.id === state.selectedId;
      return option;
    }),
  );

  const entry = selectedEncounter(state);
  panelWaves.replaceChildren();
  if (entry === null) return;
  entry.waves.forEach((wave, waveIndex) => {
    const box = document.createElement('div');
    box.className = 'wave';
    const header = document.createElement('header');
    const name = document.createElement('strong');
    name.textContent = wave.id;
    const timing = document.createElement('input');
    timing.value = wave.atMs === null ? 'clear' : String(wave.atMs);
    timing.title = "milliseconds, or 'clear' to wait for an empty room";
    timing.addEventListener('change', () => {
      const value = timing.value.trim();
      apply(setWaveAtMs(state, waveIndex, value === 'clear' ? null : Number(value)));
    });
    header.append(name, timing);
    box.append(header);
    wave.spawns.forEach((spawn, spawnIndex) => {
      const row = document.createElement('div');
      row.className = 'spawn';
      const kind = document.createElement('select');
      kind.replaceChildren(
        ...ARCHETYPES.map((archetype) => {
          const option = document.createElement('option');
          option.value = archetype;
          option.textContent = archetype;
          option.selected = archetype === spawn.archetype;
          return option;
        }),
      );
      kind.addEventListener('change', () =>
        apply(setSpawnArchetype(state, waveIndex, spawnIndex, kind.value)),
      );
      const at = document.createElement('span');
      at.className = 'muted';
      at.textContent = `(${spawn.at.x}, ${spawn.at.y})`;
      row.append(kind, at);
      box.append(row);
    });
    panelWaves.append(box);
  });
};

const apply = (next: EditorState): void => {
  state = next;
  renderPanel();
  drawFloor();
};


type Handle =
  | { kind: 'start' }
  | { kind: 'spawn'; waveIndex: number; spawnIndex: number };

let dragging: Handle | null = null;

const handleAt = (canvasPoint: { x: number; y: number }): Handle | null => {
  const def = currentDef();
  if (def === null) return null;
  const fit = fitFor(def);
  const near = (p: { x: number; y: number }, radius: number): boolean => {
    const c = toCanvas(fit, p);
    return Math.hypot(c.x - canvasPoint.x, c.y - canvasPoint.y) <= radius;
  };
  if (near(def.playerStart, 11)) return { kind: 'start' };
  for (let waveIndex = 0; waveIndex < def.waves.length; waveIndex++) {
    const wave = def.waves[waveIndex];
    for (let spawnIndex = 0; spawnIndex < wave.spawns.length; spawnIndex++) {
      if (near(wave.spawns[spawnIndex].at, 9)) return { kind: 'spawn', waveIndex, spawnIndex };
    }
  }
  return null;
};

const canvasPoint = (event: MouseEvent): { x: number; y: number } => {
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
};

canvas.addEventListener('mousedown', (event) => {
  dragging = handleAt(canvasPoint(event));
});
canvas.addEventListener('mousemove', (event) => {
  if (dragging === null) return;
  const def = currentDef();
  if (def === null) return;
  const world = toWorld(fitFor(def), canvasPoint(event));
  apply(
    dragging.kind === 'start'
      ? movePlayerStart(state, world)
      : moveSpawn(state, dragging.waveIndex, dragging.spawnIndex, world),
  );
});
window.addEventListener('mouseup', () => {
  dragging = null;
});


panelEncounter.addEventListener('change', () => apply(selectEncounter(state, panelEncounter.value)));

buttonOpen.addEventListener('click', () => filePicker.click());
filePicker.addEventListener('change', async () => {
  const file = filePicker.files?.[0];
  if (file === undefined) return;
  const text = await file.text();
  let looksLikeDocument = false;
  try {
    looksLikeDocument = Array.isArray((JSON.parse(text) as { encounters?: unknown }).encounters);
  } catch {
    looksLikeDocument = false;
  }
  apply(looksLikeDocument ? openDocument(text) : openRoom(text, VOCABULARY));
});

buttonDownload.addEventListener('click', () => {
  const single = state.doc.encounters.length === 1;
  const blob = new Blob([single ? serializeRoom(state) : serialize(state)], {
    type: 'application/json',
  });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = single ? `${state.selectedId ?? 'room'}.json` : 'encounter-content.json';
  link.click();
  URL.revokeObjectURL(link.href);
});

const resize = (): void => {
  canvas.width = canvas.clientWidth * devicePixelRatio;
  canvas.height = canvas.clientHeight * devicePixelRatio;
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  drawFloor();
};
window.addEventListener('resize', resize);

renderPanel();
resize();
