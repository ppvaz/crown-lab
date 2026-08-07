
import type {
  EncounterDef,
  Intent,
  PowerKind,
  SimEvent,
  SlowMoMode,
} from '../sim/types';
import type { ControlNames } from './controls';
import type { Copy } from './copy';

type TutorialTrack = NonNullable<EncounterDef['tutorial']>;

interface Lesson {
  id: string;
  prompt: (c: ControlNames, t: Copy['tutorial']) => string;
  goal?: number;
  completes: (intent: Intent, events: readonly SimEvent[]) => boolean;
}

const eventIs = (events: readonly SimEvent[], type: SimEvent['type']): boolean =>
  events.some((event) => event.type === type);

const attackStarted = (events: readonly SimEvent[], attack: string): boolean =>
  events.some((event) => event.type === 'attack_started' && event.data?.attack === attack);

const FUNDAMENTALS: Lesson[] = [
  {
    id: 'move',
    prompt: (c, t) => t.lessons.move(c),
    completes: (intent) => intent.move.x !== 0 || intent.move.y !== 0,
  },
  {
    id: 'aim',
    prompt: (c, t) => t.lessons.aim(c),
    completes: (intent) =>
      intent.facing !== null || intent.move.x !== 0 || intent.move.y !== 0,
  },
  {
    id: 'light',
    prompt: (c, t) => t.lessons.light(c),
    completes: (_intent, events) => attackStarted(events, 'light'),
  },
  {
    id: 'heavy',
    prompt: (c, t) => t.lessons.heavy(c),
    completes: (_intent, events) => attackStarted(events, 'heavy'),
  },
];

const DEFENSE: Lesson[] = [
  {
    id: 'guard',
    prompt: (c, t) => t.lessons.guard(c),
    completes: (_intent, events) => eventIs(events, 'guard_success'),
  },
  {
    id: 'parry',
    prompt: (c, t) => t.lessons.parry(c),
    completes: (_intent, events) => eventIs(events, 'parry_success'),
  },
  {
    id: 'step',
    prompt: (c, t) => t.lessons.step(c),
    completes: (_intent, events) => eventIs(events, 'step_started'),
  },
];

const FOCUS: Lesson[] = [
  {
    id: 'focus_charge',
    prompt: (_c, t) => t.lessons.focusCharge,
    goal: 3,
    completes: (_intent, events) => eventIs(events, 'parry_success'),
  },
  {
    id: 'focus_use',
    prompt: (c, t) => t.lessons.focusUse(c),
    completes: (_intent, events) =>
      events.some(
        (event) => event.type === 'slowmo_started' && event.data?.trigger === 'manual',
      ),
  },
];

const powerPrompt = (
  power: Exclude<PowerKind, 'none'>,
  c: ControlNames,
  t: Copy['tutorial'],
): string =>
  power === 'lightning'
    ? t.lessons.channelLightning(c)
    : t.lessons.power(`${power[0].toUpperCase()}${power.slice(1)}`, c);

const lessonsFor = (
  track: TutorialTrack,
  power: PowerKind,
  slowMoMode: SlowMoMode,
  t: Copy['tutorial'],
  setup: { focus: string; power: string } | null,
): { lessons: Lesson[]; setup: string | null } => {
  if (track === 'fundamentals') return { lessons: FUNDAMENTALS, setup: null };
  if (track === 'defense') return { lessons: DEFENSE, setup: null };
  if (track === 'focus') {
    return slowMoMode === 'player_focus'
      ? { lessons: FOCUS, setup: null }
      : {
          lessons: [],
          setup: setup?.focus ?? null,
        };
  }
  return power === 'none'
    ? {
        lessons: [],
        setup: setup?.power ?? null,
      }
    : {
        lessons: [
          {
            id: `power_${power}`,
            prompt: (c, t) => powerPrompt(power, c, t),
            completes: (_intent, events) =>
              events.some(
                (event) => event.type === 'power_used' && event.data?.power === power,
              ),
          },
        ],
        setup: null,
      };
};

export class TutorialCoach {
  private lessons: Lesson[] = [];
  private index = 0;
  private progress = 0;
  private setup: string | null = null;

  constructor(
    public controls: ControlNames,
    public copy: Copy,
    public labSetup: { focus: string; power: string } | null = null,
  ) {}

  reset(def: EncounterDef, power: PowerKind, slowMoMode: SlowMoMode): void {
    if (def.tutorial === undefined) {
      this.lessons = [];
      this.setup = null;
      this.index = 0;
      this.progress = 0;
      return;
    }
    const resolved = lessonsFor(def.tutorial, power, slowMoMode, this.copy.tutorial, this.labSetup);
    this.lessons = resolved.lessons;
    this.setup = resolved.setup;
    this.index = 0;
    this.progress = 0;
  }

  update(intent: Intent, events: readonly SimEvent[]): void {
    const lesson = this.lessons[this.index];
    if (lesson === undefined || !lesson.completes(intent, events)) return;
    this.progress += 1;
    if (this.progress < (lesson.goal ?? 1)) return;
    this.index += 1;
    this.progress = 0;
  }

  get currentId(): string | null {
    return this.lessons[this.index]?.id ?? null;
  }

  get prompt(): string | null {
    if (this.setup !== null) return this.setup;
    if (this.lessons.length === 0) return null;
    const lesson = this.lessons[this.index];
    if (lesson === undefined) return this.copy.tutorial.complete;
    const count = lesson.goal === undefined ? '' : ` (${this.progress}/${lesson.goal})`;
    const t = this.copy.tutorial;
    return `${t.heading(this.index + 1, this.lessons.length, count)} — ${lesson.prompt(
      this.controls,
      t,
    )}`;
  }
}

export const TUTORIAL_ACTIONS = [
  'move',
  'aim',
  'light',
  'heavy',
  'guard',
  'parry',
  'step',
  'focus',
  'power',
] as const;
