
export type Locale = 'en';

export const LOCALES: readonly Locale[] = ['en'];

export interface ControlCopy {
  move: string;
  aim: string;
  light: string;
  heavy: string;
  guard: string;
  step: string;
  focus: string;
  power: string;
  interact: string;
  restart: string;
}

export interface Copy {
tutorial: {
    heading: (index: number, total: number, count: string) => string;
    complete: string;
    lessons: {
      move: (c: ControlCopy) => string;
      aim: (c: ControlCopy) => string;
      light: (c: ControlCopy) => string;
      heavy: (c: ControlCopy) => string;
      guard: (c: ControlCopy) => string;
      parry: (c: ControlCopy) => string;
      step: (c: ControlCopy) => string;
      focusCharge: string;
      focusUse: (c: ControlCopy) => string;
      power: (name: string, c: ControlCopy) => string;
      channelLightning: (c: ControlCopy) => string;
    };
  };
  controls: { touch: ControlCopy; pointer: ControlCopy };
  outcome: { cleared: string; timeout: string; dead: string };
  hud: {
    retry: (restart: string) => string;
    attempt: string;
    wave: string;
    bossWave: string;
    enemies: string;
    parryStreak: string;
    riposte: string;
    replay: string;
  };
  travel: {
    sentinel: { name: string; line: string; accept: string };
    squire: { name: string; line: string; accept: string };
    talkTo: (name: string) => string;
  };
  herald: { choose: string; go: string; leave: string };
  puzzle: {
    watch: string;
    progress: (lit: number, total: number) => string;
    pull: (interact: string) => string;
  };
}

const EN: Copy = {
tutorial: {
    heading: (index, total, count) => `Tutorial ${index}/${total}${count}`,
    complete: 'Tutorial complete',
    lessons: {
      move: (c) => `Move — ${c.move}`,
      aim: (c) => `Aim — ${c.aim}`,
      light: (c) => `Light attack — ${c.light}`,
      heavy: (c) => `Heavy attack — ${c.heavy}`,
      guard: (c) => `Guard one attack — hold ${c.guard} while facing the attacker`,
      parry: (c) => `Perfect parry — tap ${c.guard} just before contact`,
      step: (c) => `Step through danger — ${c.step} plus a direction`,
      focusCharge: 'Earn 3 focus charges — perform three perfect parries',
      focusUse: (c) => `Spend the Royal Instant — ${c.focus} after the third perfect parry`,
      power: (name, c) => `Use ${name} — ${c.power}`,
      channelLightning: (c) => `Channel Lightning — hold ${c.power} on the targets`,
    },
  },
  controls: {
    pointer: {
      move: 'WASD or arrow keys',
      aim: 'the mouse',
      light: 'J or left mouse',
      heavy: 'K or right mouse',
      guard: 'Shift or L',
      step: 'Space',
      focus: 'F',
      power: 'Q or middle mouse',
      interact: 'E',
      restart: 'R',
    },
    touch: {
      move: 'the stick',
      aim: 'the stick',
      light: 'ATK',
      heavy: 'HEAVY',
      guard: 'GUARD',
      step: 'STEP',
      focus: 'FOCUS',
      power: 'POWER',
      interact: 'ACT',
      restart: 'RESTART',
    },
  },
  outcome: { cleared: 'CLEARED', timeout: 'TIMEOUT', dead: 'DEAD' },
  hud: {
    retry: (restart) => `${restart} to retry`,
    attempt: 'attempt',
    wave: 'wave',
    bossWave: 'BOSS WAVE',
    enemies: 'enemies',
    parryStreak: 'parry streak',
    riposte: 'RIPOSTE',
    replay: 'REPLAY',
  },
  travel: {
    sentinel: {
      name: 'SENTINEL',
      line: 'The walls hold for now. The First Blade waits in the inner court — if you mean to end this today, I will take you.',
      accept: 'TO THE COURT',
    },
    squire: {
      name: 'SQUIRE',
      line: 'The court is yours while it lasts. The walls still want a king — say the word and we go back.',
      accept: 'BACK TO THE WALLS',
    },
    talkTo: (name) => `TALK TO ${name}`,
  },
  herald: { choose: 'choose', go: 'go', leave: 'NEVER MIND' },
  puzzle: {
    watch: 'See the order',
    progress: (lit, total) => `Seals ${lit}/${total}`,
    pull: (interact) => `${interact}  PULL THE SEAL`,
  },
};

const COPY: Readonly<Record<Locale, Copy>> = { en: EN };

export const copyFor = (locale: Locale): Copy => COPY[locale];

export const localeFrom = (_languages: readonly string[]): Locale => 'en';



export interface LabCopy extends Copy {
  tutorialSetup: { focus: string; power: string };
}

const LAB_COPY: Readonly<Record<Locale, LabCopy>> = {
  en: {
    ...EN,
    tutorialSetup: {
      focus: "Setup — use ; / ' to select the player_focus slow-motion preset",
      power: 'Setup — use [ / ] to select a Power_* combat preset',
    },
  },
};

export const labCopyFor = (locale: Locale): LabCopy => LAB_COPY[locale];
